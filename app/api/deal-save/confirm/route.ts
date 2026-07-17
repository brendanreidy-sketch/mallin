/**
 * ============================================================================
 *  /api/deal-save/confirm — the counterfactual gesture
 * ============================================================================
 *
 *  The rep answers "would you have caught this deal without Mallin?" on a
 *  recovered save episode. That one answer credits — or honestly declines —
 *  the save, and is what lets the ledger be relied on without statistics.
 *  Modeled on /api/cockpit-action (governed AI-proposes / human-governs seam).
 *
 *  POST body (JSON):
 *    {
 *      "saveId":        "<uuid>",
 *      "counterfactual":"would_have_missed" | "would_have_caught" | "unsure",
 *      "notes":         "<optional free text>"
 *    }
 *  POST response: { ok: true } once the gesture lands. 'would_have_caught'
 *  (the rep had it) is a first-class, encouraged answer — declined credit is
 *  what makes the ledger auditable.
 *
 *  GET — the prompt queue: recovered episodes awaiting this workspace's answer.
 *    { ok: true, pending: [{ saveId, opportunityId, dealName, riskDriver, ... }] }
 * ============================================================================
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";
import { supabaseAdmin } from "@/lib/db/client";
import {
  confirmDealSaveCounterfactual,
  type Counterfactual,
} from "@/lib/coaching/persist-deal-save";
import { getPendingCounterfactuals } from "@/lib/coaching/resolve-deal-saves";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTERFACTUALS = [
  "would_have_missed",
  "would_have_caught",
  "unsure",
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cleanUuid(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").replace(/[^a-fA-F0-9-]/g, "");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const saveId = cleanUuid(body.saveId);
  if (!saveId) return json({ ok: false, error: "saveId is required" }, 400);

  const counterfactual = body.counterfactual;
  if (
    typeof counterfactual !== "string" ||
    !COUNTERFACTUALS.includes(counterfactual as Counterfactual)
  ) {
    return json({ ok: false, error: "invalid counterfactual" }, 400);
  }

  const tenantId = await getCurrentTenantId().catch(() => null);
  const { userId } = await auth();
  if (!tenantId || !userId) {
    return json({ ok: false, error: "no authenticated user/tenant" }, 403);
  }

  // Resolve the episode's opportunity so we can run the tenant access check —
  // the same gate cockpit-action applies. Also scopes the save to this tenant.
  const { data: save } = await supabaseAdmin
    .from("deal_saves")
    .select("opportunity_id")
    .eq("id", saveId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!save) return json({ ok: false, error: "save not found" }, 404);
  if (!(await isOpportunityAccessible(save.opportunity_id as string, tenantId))) {
    return json({ ok: false, error: "opportunity not accessible to this tenant" }, 403);
  }

  const notes =
    typeof body.notes === "string" && body.notes.length <= 2000 ? body.notes : undefined;

  try {
    await confirmDealSaveCounterfactual({
      tenantId,
      saveId,
      counterfactual: counterfactual as Counterfactual,
      confirmedByUserId: userId,
      notes,
    });
  } catch (err) {
    // Already answered / no longer pending → a benign double-tap. Surface it
    // as a soft failure rather than a 500.
    return json(
      { ok: false, error: err instanceof Error ? err.message : "confirm failed" },
      409
    );
  }

  return json({ ok: true });
}

export async function GET() {
  const tenantId = await getCurrentTenantId().catch(() => null);
  const { userId } = await auth();
  if (!tenantId || !userId) return json({ ok: true, pending: [] });

  const pending = await getPendingCounterfactuals(tenantId);
  return json({ ok: true, pending });
}
