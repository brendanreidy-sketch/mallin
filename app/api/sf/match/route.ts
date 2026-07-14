/**
 * ============================================================================
 *  GET /api/sf/match?dealId=X
 * ============================================================================
 *
 *  Substrate → Salesforce auto-match. Given a substrate dealId, returns
 *  ranked SF opportunity candidates with confidence scores.
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. NO WRITES.                                                   ║
 *  ║  2. NO AUTO-SELECT. Response always carries                      ║
 *  ║     requires_human_confirmation=true. The caller MUST surface a  ║
 *  ║     confirmation step before treating any candidate as "the"     ║
 *  ║     match for downstream operations (diff, write, etc.).         ║
 *  ║  3. PRODUCTION-GUARDED. 403 in prod unless SF_DEBUG_ENABLED=true.║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Strategy: pull the most recent open opportunities from SF (capped at
 *  100), join Account.Name, score each against the substrate deal,
 *  return top N. Scoring weights: 40% name, 30% account, 20% amount,
 *  10% close date.
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getConnection,
  SalesforceConfigError,
} from "@/lib/adapters/salesforce";
import { loadDealFromDB } from "@/lib/db/load-deal";
import {
  matchSubstrateToSf,
  matchStrength,
  type SfOppCandidateInput,
} from "@/lib/sf-diff/matcher";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { getActiveLinkForDeal } from "@/lib/sf-diff/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_POOL_LIMIT = 100;

export async function GET(req: NextRequest) {
  const t0 = Date.now();

  const access = checkSfDebugAccess();
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "debug_disabled_in_production",
        message: access.reason,
      },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId")?.trim();
  const includeClosed =
    (searchParams.get("includeClosed") ?? "").toLowerCase() === "true";
  const maxResults = Math.min(
    Math.max(parseInt(searchParams.get("maxResults") ?? "5", 10) || 5, 1),
    20,
  );

  if (!dealId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_dealId",
        message: "dealId query param is required",
        usage: "GET /api/sf/match?dealId=<substrate-deal-id>&includeClosed=false&maxResults=5",
      },
      { status: 400 },
    );
  }

  try {
    // ─── 1. Load substrate deal ───────────────────────────────────────
    const loaded = await loadDealFromDB(dealId);
    if (!loaded) {
      return NextResponse.json(
        {
          ok: false,
          error: "deal_not_found",
          message: `No substrate deal found with id ${dealId}`,
        },
        { status: 404 },
      );
    }

    const substrateForMatch = {
      name: loaded.substrate.opportunity?.name ?? null,
      account_name: loaded.substrate.account?.name ?? null,
      amount: loaded.substrate.opportunity?.amount ?? null,
      close_date: loaded.substrate.opportunity?.close_date ?? null,
    };

    // ─── 2. Pull SF candidate pool ────────────────────────────────────
    // Joining Account.Name via dot-notation in SOQL.
    const conn = await getConnection();
    const closedFilter = includeClosed ? "" : "WHERE IsClosed = false";
    const soql = `
      SELECT Id, Name, AccountId, Account.Name, Amount, CloseDate, StageName, IsClosed
      FROM Opportunity
      ${closedFilter}
      ORDER BY LastModifiedDate DESC
      LIMIT ${CANDIDATE_POOL_LIMIT}
    `;
    const result = await conn.query<
      Record<string, unknown> & {
        Id: string;
        Name: string;
        Amount: number | null;
        CloseDate: string | null;
        StageName: string | null;
        IsClosed: boolean;
        Account?: { Name?: string | null } | null;
      }
    >(soql);

    // Flatten Account.Name into AccountName
    const candidatePool: SfOppCandidateInput[] = result.records.map((r) => ({
      Id: r.Id,
      Name: r.Name,
      AccountName: r.Account?.Name ?? null,
      Amount: r.Amount,
      CloseDate: r.CloseDate,
      StageName: r.StageName,
      IsClosed: r.IsClosed,
    }));

    // ─── 2b. Look up existing confirmed link (if any) ────────────────
    // If the rep previously confirmed a substrate ↔ SF match for this
    // deal, surface it prominently so the UI can short-circuit straight
    // to the diff. Doesn't change the candidate ranking — rep retains
    // the option to re-evaluate.
    const existingLink = await getActiveLinkForDeal(dealId);

    // ─── 3. Score & rank ──────────────────────────────────────────────
    const matchResult = matchSubstrateToSf(substrateForMatch, candidatePool, {
      maxResults,
    });

    // ─── 4. Re-assert the no-auto-select invariant before returning ──
    if (!matchResult.requires_human_confirmation) {
      console.error(
        "[sf-match] INVARIANT VIOLATION: requires_human_confirmation was not true",
      );
      return NextResponse.json(
        {
          ok: false,
          error: "match_invariant_violated",
          message:
            "Matcher returned without requires_human_confirmation=true. This is a safety violation; refusing to return.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - t0,
      route: "/api/sf/match",
      writes_performed: false,
      requires_human_confirmation: true,
      substrate_deal_id: dealId,
      substrate_summary: {
        deal_name: substrateForMatch.name,
        account_name: substrateForMatch.account_name,
        amount: substrateForMatch.amount,
        close_date: substrateForMatch.close_date,
      },
      pool: {
        candidate_pool_size: candidatePool.length,
        candidate_pool_limit: CANDIDATE_POOL_LIMIT,
        include_closed: includeClosed,
        scored_above_threshold: matchResult.candidates.length,
      },
      best_match: matchResult.best_match
        ? {
            ...matchResult.best_match,
            strength: matchStrength(matchResult.best_match.confidence),
          }
        : null,
      candidates: matchResult.candidates.map((c) => ({
        ...c,
        strength: matchStrength(c.confidence),
        diff_url: `/api/sf/diff?dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(c.sf_id)}`,
      })),
      thresholds: matchResult.thresholds,
      existing_link: existingLink
        ? {
            sf_opp_id: existingLink.sf_opp_id,
            sf_instance_url: existingLink.sf_instance_url,
            confirmed_at: existingLink.confirmed_at,
            confirmed_by: existingLink.confirmed_by,
            notes: existingLink.notes,
            diff_url: `/sf/diff?dealId=${encodeURIComponent(dealId)}&sfOppId=${encodeURIComponent(existingLink.sf_opp_id)}`,
          }
        : null,
      hint: matchResult.best_match
        ? "Best match returned. The caller MUST surface a human confirmation step before treating any candidate as authoritative."
        : "No candidates above minimum confidence threshold. Substrate deal may not exist in this SF org, or signal is too weak.",
    });
  } catch (e) {
    if (e instanceof SalesforceConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_env",
          message: e.message,
          elapsed_ms: Date.now() - t0,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "match_failed",
        message: (e as Error).message,
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
