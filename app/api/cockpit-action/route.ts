/**
 * ============================================================================
 *  /api/cockpit-action  — governed-gesture capture
 * ============================================================================
 *
 *  The durable seam for "AI proposes, human governs". Records the three
 *  rep-initiated cockpit gestures into cockpit_actions:
 *
 *    - strategy_confirmed   (× on "How you win this" = "we discussed it")
 *    - risk_acknowledged    (ack on a "What could go wrong" item)
 *    - stakeholder_flagged  (flag a wrong stakeholder + reason)
 *
 *  POST body (JSON):
 *    {
 *      "dealId":      "<uuid>",
 *      "actionType":  "strategy_confirmed" | "risk_acknowledged" | "stakeholder_flagged",
 *      "targetRef":   "<stakeholder_id | 'how_you_win' | 'risk:0'>",   (optional)
 *      "reason":      "wrong_person" | "wrong_role" | "no_longer_here" | "not_involved",  (flags only)
 *      "detail":      { ... small display context }                     (optional)
 *    }
 *  POST response: { ok: true } — always 200 once auth passes. The write is
 *  best-effort (defended so a not-yet-applied table never fails the gesture);
 *  the rep's ✓ affordance is optimistic and low-stakes to lose.
 *
 *  GET ?dealId=<uuid> — hydration. Returns this rep's prior gestures for the
 *  deal so confirms / acks / flags survive reload:
 *    { ok: true, actions: [{ action_type, target_ref, reason, detail, created_at }] }
 *  Anonymous / no-tenant → { ok: true, actions: [] } (graceful, never 500s).
 * ============================================================================
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/db/client";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_TYPES = [
  "strategy_confirmed",
  "risk_acknowledged",
  "stakeholder_flagged",
] as const;
type ActionType = (typeof ACTION_TYPES)[number];

const FLAG_REASONS = [
  "wrong_person",
  "wrong_role",
  "no_longer_here",
  "not_involved",
] as const;
type FlagReason = (typeof FLAG_REASONS)[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cleanDealId(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").replace(/[^a-fA-F0-9-]/g, "");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const dealId = cleanDealId(body.dealId);
  if (!dealId) return json({ ok: false, error: "dealId is required" }, 400);

  const actionType = body.actionType;
  if (typeof actionType !== "string" || !ACTION_TYPES.includes(actionType as ActionType)) {
    return json({ ok: false, error: "invalid actionType" }, 400);
  }

  // Gate: opportunity must belong to the caller's tenant.
  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!(await isOpportunityAccessible(dealId, tenantId))) {
    return json({ ok: false, error: "opportunity not accessible to this tenant" }, 403);
  }
  const { userId } = await auth();
  if (!tenantId || !userId) {
    return json({ ok: false, error: "no authenticated user/tenant" }, 403);
  }

  const targetRef =
    typeof body.targetRef === "string" && body.targetRef.length <= 200
      ? body.targetRef
      : null;

  // reason is required for stakeholder_flagged, forbidden otherwise.
  let reason: FlagReason | null = null;
  if (actionType === "stakeholder_flagged") {
    if (typeof body.reason !== "string" || !FLAG_REASONS.includes(body.reason as FlagReason)) {
      return json({ ok: false, error: "invalid or missing reason for stakeholder_flagged" }, 400);
    }
    reason = body.reason as FlagReason;
  }

  // detail: small display context. Cap serialized size defensively.
  let detail: Record<string, unknown> = {};
  if (body.detail && typeof body.detail === "object" && !Array.isArray(body.detail)) {
    const serialized = JSON.stringify(body.detail);
    if (serialized.length <= 2000) detail = body.detail as Record<string, unknown>;
  }

  // Best-effort write. A missing table (migration not yet applied to prod) or
  // a transient failure must not fail the gesture — the ✓ is optimistic and
  // losing one confirmation is low-stakes. Log for visibility.
  try {
    await supabaseAdmin.from("cockpit_actions").insert({
      tenant_id: tenantId,
      opportunity_id: dealId,
      user_id: userId,
      action_type: actionType,
      target_ref: targetRef,
      reason,
      detail,
    });
  } catch (err) {
    console.warn(
      "[cockpit-action] persist failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return json({ ok: true });
}

export async function GET(req: NextRequest) {
  const dealId = cleanDealId(req.nextUrl.searchParams.get("dealId"));
  if (!dealId) return json({ ok: true, actions: [] });

  const tenantId = await getCurrentTenantId().catch(() => null);
  const { userId } = await auth();
  if (!tenantId || !userId) return json({ ok: true, actions: [] });
  if (!(await isOpportunityAccessible(dealId, tenantId))) {
    return json({ ok: true, actions: [] });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("cockpit_actions")
      .select("action_type, target_ref, reason, detail, created_at")
      .eq("tenant_id", tenantId)
      .eq("opportunity_id", dealId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return json({ ok: true, actions: data ?? [] });
  } catch (err) {
    console.warn(
      "[cockpit-action] hydrate failed:",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: true, actions: [] });
  }
}
