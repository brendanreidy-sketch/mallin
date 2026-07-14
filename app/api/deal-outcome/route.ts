import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";

/**
 * POST /api/deal-outcome — record how a deal ended + Mallin attribution.
 *
 * Closes the action→outcome loop: one upsert per deal (won/lost/no_decision +
 * close date + amount) plus the two attribution flags — did the flagged risk
 * materialize, and was the recommended move taken. This is the data realized
 * ROI is computed from (npm run roi).
 *
 * Self-auths; must stay in middleware isPublicRoute (Clerk protect() would
 * otherwise 404 + edge-cache it).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBoolOrNull(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  return null;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    opportunityId?: string;
    outcome?: string;
    closedAt?: string;
    amount?: number | string;
    riskMaterialized?: boolean;
    moveTaken?: boolean;
    notes?: string;
  };

  const opportunityId = (body.opportunityId ?? "").trim();
  const outcome = (body.outcome ?? "").trim();
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunity_required" }, { status: 400 });
  }
  if (!["won", "lost", "no_decision"].includes(outcome)) {
    return NextResponse.json(
      { error: "bad_outcome", message: "Outcome must be won, lost, or no_decision." },
      { status: 400 },
    );
  }

  // Confirm the deal belongs to this tenant + grab its currency.
  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("id, currency")
    .eq("id", opportunityId)
    .eq("tenant_id", tenantId)
    .single();
  if (!opp) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const amountNum =
    body.amount === undefined || body.amount === null || body.amount === ""
      ? null
      : Number(body.amount);

  const { error } = await supabaseAdmin.from("deal_outcomes").upsert(
    {
      tenant_id: tenantId,
      opportunity_id: opportunityId,
      outcome,
      closed_at: body.closedAt?.trim() || null,
      amount: Number.isFinite(amountNum as number) ? amountNum : null,
      currency: opp.currency ?? "USD",
      risk_materialized: toBoolOrNull(body.riskMaterialized),
      move_taken: toBoolOrNull(body.moveTaken),
      notes: body.notes?.trim() || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "opportunity_id" },
  );
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message.slice(0, 200) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
