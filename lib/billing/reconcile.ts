import { stripe, billingConfigured } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/db/client";

/**
 * Grant Pro entitlement immediately when a user returns from Stripe Checkout
 * (/new?upgraded=1), instead of waiting for the async webhook (~30s, up to
 * minutes). Closes the race where a freshly-paid rep still sees the paywall.
 *
 * GRANT-ONLY + idempotent: it never downgrades — cancellations/lapses remain
 * the webhook's job (customer.subscription.updated/deleted). It only flips a
 * tenant to Pro when Stripe actually shows an active/trialing subscription for
 * that tenant's customer, so a user manually hitting ?upgraded=1 without a real
 * subscription is a safe no-op. The webhook remains the source of truth; this
 * is belt-and-suspenders for latency only.
 *
 * Best-effort: any failure returns false and never blocks page render.
 */
export async function reconcileProOnReturn(tenantId: string): Promise<boolean> {
  if (!billingConfigured() || !stripe) return false;
  try {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("stripe_customer_id, plan")
      .eq("id", tenantId)
      .single();

    const customerId = tenant?.stripe_customer_id;
    if (!customerId) return false;
    // Webhook already won the race — nothing to do.
    if (tenant?.plan === "pro") return true;

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 3,
    });
    const active = subs.data.find(
      (s) => s.status === "active" || s.status === "trialing",
    );
    if (!active) return false;

    await supabaseAdmin
      .from("tenants")
      .update({
        plan: "pro",
        deal_limit: null, // unlimited — mirrors the webhook
        stripe_subscription_id: active.id,
      })
      .eq("id", tenantId);
    return true;
  } catch {
    return false;
  }
}
