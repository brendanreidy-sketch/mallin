import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { stripe, STRIPE_PRICE_ID, billingConfigured } from "@/lib/billing/stripe";

/**
 * POST /api/billing/checkout — start a Mallin Pro subscription.
 *
 * Creates (or reuses) the tenant's Stripe customer, opens a Checkout
 * session for the Pro price, and returns its URL for the client to
 * redirect to. The webhook flips the tenant to plan='pro' on payment.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!billingConfigured() || !stripe || !STRIPE_PRICE_ID) {
    return NextResponse.json(
      { error: "billing_not_configured", message: "Billing isn't set up yet." },
      { status: 503 },
    );
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("stripe_customer_id, name")
    .eq("id", tenantId)
    .single();

  // Reuse the tenant's customer if we've created one before; otherwise make
  // it and persist the id so future checkouts/portals are stable.
  let customerId = tenant?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: tenant?.name ?? undefined,
      metadata: { tenant_id: tenantId, clerk_user_id: userId },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from("tenants")
      .update({ stripe_customer_id: customerId })
      .eq("id", tenantId);
  }

  const origin = req.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/new?upgraded=1`,
    cancel_url: `${origin}/new?upgrade_canceled=1`,
    metadata: { tenant_id: tenantId },
    subscription_data: { metadata: { tenant_id: tenantId } },
  });

  return NextResponse.json({ url: session.url });
}
