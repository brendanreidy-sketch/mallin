import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId, isTenantDemo } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { refreshAccountNews } from "@/lib/intelligence/refresh/news-refresh";
import { mergeNewEventsIntoArtifact } from "@/lib/intelligence/refresh/merge";
import { decideRefresh } from "@/lib/intelligence/refresh/decide";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

/**
 * POST /api/intel/refresh — on-access freshness for ONE deal.
 *
 * Replaces the "refresh every deal nightly whether or not anyone looks"
 * model: the cockpit calls this when a rep OPENS a stale deal (i.e. is about
 * to use it). Re-checks staleness server-side so concurrent triggers and
 * already-fresh deals are a no-op — the costed web-search only runs when a
 * deal is genuinely stale AND someone's actually in it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  // Demo tenants run on simulated data — never spend a real web-search on them.
  if (await isTenantDemo(tenantId)) {
    return NextResponse.json({ ok: true, refreshed: false, reason: "demo" });
  }

  const body = (await req.json().catch(() => ({}))) as { dealId?: string };
  const dealId = (body.dealId ?? "").replace(/[^a-fA-F0-9-]/g, "");
  if (!dealId) return NextResponse.json({ error: "deal_required" }, { status: 400 });

  // Current artifact for this deal, scoped to the caller's tenant.
  const { data: row } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("id, tenant_id, account_id, opportunity_id, artifact")
    .eq("opportunity_id", dealId)
    .eq("is_current", true)
    .maybeSingle();

  if (!row || row.tenant_id !== tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const artifact = row.artifact as AccountIntelligenceArtifact;

  // The cost guard (unit-tested in decide.test.ts): skip — no web-search — if
  // the deal is already fresh or has nothing to anchor news to. isDemo is
  // already false here (demo short-circuited above before the DB read).
  const decision = decideRefresh(artifact, { isDemo: false });
  if (!decision.refresh) {
    return NextResponse.json({ ok: true, refreshed: false, reason: decision.reason });
  }

  try {
    const { new_events } = await refreshAccountNews(artifact);
    const { merged } = mergeNewEventsIntoArtifact(artifact, new_events);

    await supabaseAdmin
      .from("account_intelligence_artifacts")
      .update({ is_current: false })
      .eq("tenant_id", row.tenant_id)
      .eq("account_id", row.account_id)
      .eq("is_current", true);
    await supabaseAdmin.from("account_intelligence_artifacts").insert({
      tenant_id: row.tenant_id,
      account_id: row.account_id,
      // Preserve opportunity_id — the prep loader filters on it.
      opportunity_id: row.opportunity_id,
      artifact: merged,
      primary_source: "mixed",
      is_current: true,
      generated_at: merged.metadata.generated_at,
    });

    return NextResponse.json({ ok: true, refreshed: true, new_events: new_events?.length ?? 0 });
  } catch (err) {
    console.error("[intel/refresh] failed:", err);
    return NextResponse.json({ error: "refresh_failed" }, { status: 502 });
  }
}
