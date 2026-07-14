import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { stripe, billingConfigured } from "@/lib/billing/stripe";

/**
 * POST /api/billing/portal — open the Stripe Customer Portal so a Pro user
 * can update their card or cancel. Requires an existing Stripe customer
 * (created at first checkout).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!billingConfigured() || !stripe) {
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
    .select("stripe_customer_id")
    .eq("id", tenantId)
    .single();

  if (!tenant?.stripe_customer_id) {
    return NextResponse.json(
      { error: "no_customer", message: "No billing account yet — upgrade first." },
      { status: 400 },
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: `${req.nextUrl.origin}/new`,
  });

  return NextResponse.json({ url: session.url });
}
