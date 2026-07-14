/**
 * ============================================================================
 *  POST /api/intelligence
 * ============================================================================
 *
 *  Run an external intelligence sweep on an account. Looks up the deal's
 *  account + key stakeholders, calls the Intelligence Agent (Claude +
 *  WebSearch), and logs each finding as a touch with
 *  source_system="intelligence_web_sweep". Schedules a Pass 4 regen via
 *  after() so the brief picks up the findings without the rep waiting.
 *
 *  Request body:
 *    { dealId: "<uuid>" }
 *
 *  Response:
 *    {
 *      ok: true,
 *      findings: [...],
 *      touch_ids: [...],
 *      search_count: N,
 *      latency_ms: N,
 *      regen: { status: "scheduled" }
 *    }
 *
 *  Allowlist: same DEMO_ALLOWED_DEAL_IDS gate as /prep + /api/regenerate.
 *
 *  Implementation: thin route over lib/intelligence-runner.ts so /api/regenerate
 *  can call the same sweep code via after() for auto-fire.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { regenerateBriefForDeal } from "@/lib/regenerate";
import { runAccountIntelligence } from "@/lib/intelligence-runner";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const result = await runAccountIntelligence(dealId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "intelligence sweep failed" },
      { status: 500 },
    );
  }

  // Schedule Pass 4 regen as background work via after(). The page's
  // existing in-flight banner pattern (touch newer than artifact, < 5 min)
  // takes over and auto-refreshes until the new artifact lands.
  after(async () => {
    try {
      const r = await regenerateBriefForDeal(dealId);
      if (!r.ok) {
        console.warn(
          `[intelligence] regen failed for ${dealId}: ${r.reason} — ${r.error}`,
        );
      }
    } catch (err) {
      console.error(
        `[intelligence] unexpected regen error for ${dealId}:`,
        err,
      );
    }
  });

  return NextResponse.json({
    ok: true,
    strategic_priority: result.strategic_priority,
    findings: result.findings,
    signal_ids: result.signal_ids,
    search_count: result.search_count,
    latency_ms: result.latency_ms,
    regen: { status: "scheduled" },
  });
}
