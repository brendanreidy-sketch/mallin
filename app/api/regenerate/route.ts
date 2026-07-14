/**
 * ============================================================================
 *  POST /api/regenerate
 * ============================================================================
 *
 *  Manually trigger a Pass 4 regen for a deal, optionally with a
 *  declared altitude. Used for the altitude-diagnosis experiment:
 *  the rep declares the deal-loss gate altitude, the system scopes
 *  pre_mortem_paths to that altitude only.
 *
 *  Request body (JSON):
 *    {
 *      "dealId": "<uuid>",
 *      "altitude": "stakeholder" | "committee" | "commercial" | "governance"
 *                  // optional — when omitted, runs legacy inference behavior
 *    }
 *
 *  Response:
 *    Synchronous — waits for regen to complete (~2 min). Returns
 *    { ok, generated_at, declared_altitude, path_count } on success
 *    or { ok: false, error, reason } on failure.
 *
 *  GUARDRAILS
 *  ──────────
 *  - DEMO_ALLOWED_DEAL_IDS allowlist mirrored from /prep + /api/log-touch.
 *  - Synchronous because the rep is staring at the page waiting for
 *    declared-altitude paths to land. Async would defeat the purpose.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { regenerateBriefForDeal } from "@/lib/regenerate";
import type { DealAltitude } from "@/lib/contracts/execution-agent-output";
import {
  accountHasRecentIntelligence,
  runAccountIntelligence,
} from "@/lib/intelligence-runner";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ALTITUDES: ReadonlyArray<DealAltitude> = [
  "stakeholder",
  "committee",
  "commercial",
  "governance",
];

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON body");
  }

  const dealIdRaw = typeof body.dealId === "string" ? body.dealId : "";
  const dealId = dealIdRaw.replace(/[^a-fA-F0-9-]/g, "");
  if (!dealId) return bad("dealId is required");
  const userTenantId = await getCurrentTenantId().catch(() => null);
  if (!(await isOpportunityAccessible(dealId, userTenantId))) {
    return bad("opportunity not accessible to this tenant", 403);
  }

  // Altitude is optional. When provided, must be one of the four declared
  // values. We deliberately don't accept arbitrary strings — the four-way
  // taxonomy is the whole point. Adding a fifth option later requires
  // updating the prompt + integrity validator together.
  let altitude: DealAltitude | null = null;
  if (body.altitude !== undefined && body.altitude !== null) {
    if (
      typeof body.altitude !== "string" ||
      !ALLOWED_ALTITUDES.includes(body.altitude as DealAltitude)
    ) {
      return bad(
        `altitude must be one of: ${ALLOWED_ALTITUDES.join(", ")}`,
      );
    }
    altitude = body.altitude as DealAltitude;
  }

  const t0 = Date.now();
  const result = await regenerateBriefForDeal(dealId, {
    declared_altitude: altitude,
  });
  const elapsed = Date.now() - t0;

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        reason: result.reason,
        elapsed_ms: elapsed,
      },
      { status: 500 },
    );
  }

  // Auto-fire intelligence sweep if account has none recent.
  // Background work via after() — doesn't block this response. The
  // sweep itself logs touches + schedules another regen so the brief
  // picks up the new findings on the next render.
  // Cadence: skip if account has been swept in the last 30 days.
  // Self-healing: if sweep fails, the account just stays without
  // intelligence until something else triggers it.
  after(async () => {
    try {
      const hasIntel = await accountHasRecentIntelligence(dealId, 30);
      if (hasIntel) return;
      const intelResult = await runAccountIntelligence(dealId);
      if (!intelResult.ok) {
        console.warn(
          `[auto-intel] sweep failed for ${dealId}: ${intelResult.error}`,
        );
        return;
      }
      // Trigger another regen so brief absorbs the fresh intel touches.
      const r = await regenerateBriefForDeal(dealId);
      if (!r.ok) {
        console.warn(
          `[auto-intel] follow-up regen failed for ${dealId}: ${r.reason} — ${r.error}`,
        );
      }
    } catch (err) {
      console.error(`[auto-intel] unexpected error for ${dealId}:`, err);
    }
  });

  return NextResponse.json({
    ok: true,
    generated_at: result.artifact.metadata?.generated_at,
    declared_altitude: altitude,
    path_count: result.artifact.pre_mortem_paths?.length ?? 0,
    paths_summary: (result.artifact.pre_mortem_paths ?? []).map((p) => ({
      primary_driver: p.primary_driver,
      actor_name: p.actor_name,
      forcing_move: p.forcing_move,
    })),
    elapsed_ms: elapsed,
    attempts: result.attempts,
  });
}
