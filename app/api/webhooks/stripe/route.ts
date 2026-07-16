import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, FREE_DEAL_LIMIT } from "@/lib/billing/stripe";
import { supabaseAdmin } from "@/lib/db/client";
import { sendProWelcome } from "@/lib/email/resend";

/**
 * POST /api/webhooks/stripe — source of truth for plan state.
 *
 * Stripe calls this on subscription lifecycle events. We verify the
 * signature against STRIPE_WEBHOOK_SECRET (raw body required — hence
 * req.text(), not req.json()), then map the customer back to a tenant and
 * set plan/deal_limit:
 *   - paid/active  → plan='pro',  deal_limit=NULL (unlimited)
 *   - canceled/lapsed → plan='free', deal_limit=FREE_DEAL_LIMIT
 *
 * Idempotent: every handler is a plain UPDATE keyed on stripe_customer_id,
 * so redelivered events converge to the same state.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function customerIdOf(
  ref: string | { id: string } | null | undefined,
): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

async function setPlanByCustomer(
  customerId: string | null,
  fields: Record<string, unknown>,
): Promise<void> {
  if (!customerId) return;
  await supabaseAdmin
    .from("tenants")
    .update(fields)
    .eq("stripe_customer_id", customerId);
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_signature", detail: (err as Error).message },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const custId = customerIdOf(s.customer);
      // Read the tenant BEFORE flipping it, so we only welcome on the actual
      // free→pro transition — never again on a redelivered event.
      const { data: before } = custId
        ? await supabaseAdmin
            .from("tenants")
            .select("plan, owner_email, first_name")
            .eq("stripe_customer_id", custId)
            .maybeSingle()
        : { data: null };
      await setPlanByCustomer(custId, {
        plan: "pro",
        deal_limit: null,
        stripe_subscription_id: customerIdOf(s.subscription),
      });
      // Welcome email — best-effort, never blocks the webhook's 2xx.
      if (before && before.plan !== "pro") {
        const email =
          s.customer_details?.email ?? s.customer_email ?? before.owner_email ?? null;
        if (email) {
          try {
            await sendProWelcome({ email, name: before.first_name });
          } catch (e) {
            console.warn(`[stripe-webhook] pro-welcome failed: ${(e as Error).message}`);
          }
        }
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const active = sub.status === "active" || sub.status === "trialing";
      await setPlanByCustomer(customerIdOf(sub.customer), {
        plan: active ? "pro" : "free",
        deal_limit: active ? null : FREE_DEAL_LIMIT,
        stripe_subscription_id: active ? sub.id : null,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await setPlanByCustomer(customerIdOf(sub.customer), {
        plan: "free",
        deal_limit: FREE_DEAL_LIMIT,
        stripe_subscription_id: null,
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
