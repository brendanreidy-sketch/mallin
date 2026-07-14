/**
 * ============================================================================
 *  GET /api/search?q=<query>
 * ============================================================================
 *
 *  Cross-deal search. Returns opportunities matching the query against
 *  account name, opportunity name, or stakeholder name. Used by the
 *  ⌘K SearchBar to let reps jump between briefs without losing context.
 *
 *  Query semantics:
 *    - q empty / missing → return recent deals (last_activity_at desc)
 *    - q present         → ILIKE match on three fields, deduped by deal
 *    - capped at 20 results
 *
 *  GUARDRAILS
 *  ──────────
 *  - DEMO_ALLOWED_DEAL_IDS allowlist (mirrors /prep + /api/log-touch +
 *    /api/coach). When set, results are filtered to that subset, so the
 *    public Vercel deploy never surfaces deals it isn't supposed to.
 *
 *  ARCHITECTURAL NOTE: real-time integration
 *  ─────────────────────────────────────────
 *  This route reads from Supabase, which is the synced state of
 *  whatever ETL/webhook flows we wire from Salesforce/Gong/Gmail.
 *  When those writers exist, this query stays unchanged — search is
 *  always against the read-side cache, not live API fan-out, because
 *  fan-out per keystroke would saturate vendor rate limits and add
 *  hundreds of ms of latency. The "real-time" property comes from
 *  webhook-driven invalidation on the writer side, not from query-
 *  time fan-out on the reader side.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULT_CAP = 20;

interface SearchResult {
  dealId: string;
  dealName: string;
  accountName: string | null;
  stageLabel: string | null;
  posture: string | null;
  lastActivityAt: string | null;
  matchedOn: "name" | "account" | "stakeholder";
  matchedStakeholder?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  // Tenant-membership filter: scope every opportunity query to the
  // current user's tenant. Replaces the previous per-opp
  // DEMO_ALLOWED_DEAL_IDS allowlist. No tenant context = no results.
  const userTenantId = await getCurrentTenantId().catch(() => null);
  if (!userTenantId) {
    return NextResponse.json({ ok: true, q, results: [] });
  }

  // Cross-table OR via PostgREST is fragile for joined relations, and the
  // dataset is small (single-tenant, dozens of deals). We fetch the
  // candidate set with their accounts in one round-trip and filter in
  // application code — simpler and correct, with no perf concern at this
  // scale. (When this grows past ~thousands of deals per tenant, swap to
  // a Postgres function or full-text index.)
  const { data: opps, error: oppsErr } = await supabaseAdmin
    .from("opportunities")
    .select(
      `
      id,
      name,
      stage_label,
      deal_posture,
      last_activity_at,
      account_id,
      accounts ( id, name )
    `,
    )
    .eq("tenant_id", userTenantId)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(120);

  if (oppsErr) {
    return NextResponse.json(
      { ok: false, error: oppsErr.message },
      { status: 500 },
    );
  }

  const lowered = q.toLowerCase();
  const results: SearchResult[] = [];
  for (const o of opps ?? []) {
    const acct = (o.accounts as unknown as { name?: string } | null) ?? null;
    const dealName: string = o.name ?? "";
    const accountName: string = acct?.name ?? "";
    const nameMatch = dealName.toLowerCase().includes(lowered);
    const accountMatch = accountName.toLowerCase().includes(lowered);
    if (q && !nameMatch && !accountMatch) continue;
    results.push({
      dealId: o.id,
      dealName,
      accountName: accountName || null,
      stageLabel: o.stage_label ?? null,
      posture: o.deal_posture ?? null,
      lastActivityAt: o.last_activity_at ?? null,
      matchedOn: accountMatch && !nameMatch ? "account" : "name",
    });
  }

  // Stakeholder name match — only run for non-empty q. Worth doing because
  // reps think in people ("who's at Acme?"), but we don't run it for
  // empty queries since recent-deals is the right empty state.
  if (q && results.length < RESULT_CAP) {
    const escaped = q.replace(/[%_]/g, "\\$&");
    const { data: shs } = await supabaseAdmin
      .from("stakeholders")
      .select("id, name, account_id, accounts(id, name)")
      .ilike("name", `%${escaped}%`)
      .limit(20);

    const accountIdsHit = new Set(
      (shs ?? [])
        .map((s) => s.account_id)
        .filter((x): x is string => Boolean(x)),
    );

    if (accountIdsHit.size > 0) {
      const { data: stOpps } = await supabaseAdmin
        .from("opportunities")
        .select(
          `id, name, stage_label, deal_posture, last_activity_at, account_id,
           accounts ( id, name )`,
        )
        .eq("tenant_id", userTenantId)
        .in("account_id", Array.from(accountIdsHit));

      const seen = new Set(results.map((r) => r.dealId));
      for (const o of stOpps ?? []) {
        if (seen.has(o.id)) continue;
            const acct =
          (o.accounts as unknown as { name?: string } | null) ?? null;
        const matchedSh = (shs ?? []).find(
          (sh) => sh.account_id === o.account_id,
        );
        results.push({
          dealId: o.id,
          dealName: o.name,
          accountName: acct?.name ?? null,
          stageLabel: o.stage_label ?? null,
          posture: o.deal_posture ?? null,
          lastActivityAt: o.last_activity_at ?? null,
          matchedOn: "stakeholder",
          matchedStakeholder: matchedSh?.name ?? undefined,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    q,
    results: results.slice(0, RESULT_CAP),
  });
}
