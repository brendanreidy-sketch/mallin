import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId, isTenantDemo } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { researchStakeholder } from "@/lib/intelligence/refresh/stakeholder-research";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

/**
 * POST /api/intel/stakeholder — web-research ONE person on a deal, on demand.
 *
 * Fired when the rep opens a stakeholder's card and there's no held research
 * yet (or they hit Refresh). Triangulates the person from the public web and
 * writes the read back onto the held artifact, so the next open is instant
 * and free. Same hold-don't-re-pay discipline as the news refresh; auth-gated
 * and demo-skipped so the costed search only runs for a real rep on a real
 * deal who actually looked the person up.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  // Demo tenants run on simulated data — never spend a real web-search.
  if (await isTenantDemo(tenantId)) {
    return NextResponse.json({ error: "demo" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    dealId?: string;
    name?: string;
  };
  const dealId = (body.dealId ?? "").replace(/[^a-fA-F0-9-]/g, "");
  const name = (body.name ?? "").trim();
  if (!dealId) return NextResponse.json({ error: "deal_required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

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
  const idx = (artifact.stakeholders ?? []).findIndex(
    (sh) => sh.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (idx < 0) {
    return NextResponse.json({ error: "stakeholder_not_found" }, { status: 404 });
  }

  try {
    const result = await researchStakeholder(artifact.stakeholders[idx], artifact);
    if (!result) {
      return NextResponse.json({ error: "research_failed" }, { status: 502 });
    }

    // Merge the research onto the held stakeholder (immutably). Backfill the
    // LinkedIn URL only if we didn't already have one.
    const stakeholders = artifact.stakeholders.map((sh, i) =>
      i === idx
        ? {
            ...sh,
            web_research: result.web_research,
            linkedin_url: sh.linkedin_url ?? result.linkedin_url,
          }
        : sh,
    );
    const updated: AccountIntelligenceArtifact = { ...artifact, stakeholders };

    // Version the artifact (same pattern as the news refresh) but DO NOT bump
    // generated_at — person research is independent of news staleness, and
    // bumping it would make the on-access news refresh wrongly skip as fresh.
    await supabaseAdmin
      .from("account_intelligence_artifacts")
      .update({ is_current: false })
      .eq("tenant_id", row.tenant_id)
      .eq("account_id", row.account_id)
      .eq("is_current", true);
    await supabaseAdmin.from("account_intelligence_artifacts").insert({
      tenant_id: row.tenant_id,
      account_id: row.account_id,
      opportunity_id: row.opportunity_id,
      artifact: updated,
      primary_source: "mixed",
      is_current: true,
      generated_at: artifact.metadata.generated_at,
    });

    return NextResponse.json({ ok: true, web_research: result.web_research });
  } catch (err) {
    console.error("[intel/stakeholder] failed:", err);
    return NextResponse.json({ error: "research_failed" }, { status: 502 });
  }
}
