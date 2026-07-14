/**
 * ============================================================================
 *  GET /api/sf/diff?dealId=X&sfOppId=Y
 * ============================================================================
 *
 *  Read-only diff between a substrate deal and a Salesforce opportunity.
 *  Phase 1 of the write-back spec — proves the bridge by surfacing
 *  what the system would suggest if writes were enabled.
 *
 *  ╔══════════════════════════════════════════════════════════════════╗
 *  ║                       SAFETY INVARIANTS                          ║
 *  ╠══════════════════════════════════════════════════════════════════╣
 *  ║  1. NO WRITES.                                                   ║
 *  ║     This route never calls updateOpportunity, createTask, or any ║
 *  ║     other SF mutation. Only conn.query() (SELECT only).          ║
 *  ║                                                                  ║
 *  ║  2. NO APPROVAL UI.                                              ║
 *  ║     This is a JSON debug endpoint. No "Approve" buttons. No      ║
 *  ║     diff cards rendered. Pure data return.                       ║
 *  ║                                                                  ║
 *  ║  3. READONLY-FIELDS HARD GUARDRAIL.                              ║
 *  ║     Forecast-impacting fields (StageName, Amount, CloseDate,     ║
 *  ║     ForecastCategory, etc.) MUST always carry action=surface_only║
 *  ║     in the response. The diff engine enforces this in            ║
 *  ║     decideAction(); this route re-asserts it before returning    ║
 *  ║     and 500s if the invariant ever fires.                        ║
 *  ╚══════════════════════════════════════════════════════════════════╝
 *
 *  Doctrine §11.3 alignment: tier-aware writeback. Forecast fields are
 *  never auto-touched. Methodology fields are suggested for rep approval.
 *  Low-risk observational fields would auto-write (this route still does
 *  not perform that write — the action label is the only signal).
 * ============================================================================
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getConnection,
  describeOpportunity,
  SalesforceConfigError,
} from "@/lib/adapters/salesforce";
import {
  SF_OPPORTUNITY_FIELDS,
  allOpportunityFields,
} from "@/lib/adapters/salesforce-mapping";
import { loadDealFromDB } from "@/lib/db/load-deal";
import { diffOpportunity } from "@/lib/sf-diff/engine";
import type { DiffItem } from "@/lib/sf-diff/types";
import { checkSfDebugAccess } from "@/lib/sf-diff/production-guard";
import { buildDryRunPreview } from "@/lib/sf-diff/dry-run";
import { getActiveLinkForDeal } from "@/lib/sf-diff/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Salesforce IDs are 15 (case-sensitive) or 18 (case-insensitive) chars,
 *  alphanumeric only. Anything else is rejected before SOQL injection
 *  surface widens. */
function isValidSalesforceId(id: string): boolean {
  return /^[A-Za-z0-9]{15}$|^[A-Za-z0-9]{18}$/.test(id);
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();

  // Production guard — refuse to serve in prod unless explicitly enabled.
  const access = checkSfDebugAccess();
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "debug_disabled_in_production",
        message: access.reason,
        hint: "This endpoint surfaces live Salesforce data. Disabled in production by default.",
      },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId")?.trim();
  const sfOppId = searchParams.get("sfOppId")?.trim();
  /**
   * actionableOnly=true filters the items array to action ∈ {write_now,
   * suggest} — what a human would actually act on. The rollup counts in
   * by_status / by_action stay full so the surface_only count remains
   * auditable ("3 readonly conflicts hidden but counted"). No data is
   * deleted from the universe — just from the visible items list.
   */
  const actionableOnly =
    (searchParams.get("actionableOnly") ?? "").toLowerCase() === "true";

  if (!dealId || !sfOppId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_params",
        message: "Both dealId and sfOppId query params are required",
        usage: "GET /api/sf/diff?dealId=<substrate-deal-id>&sfOppId=<sf-opportunity-id>",
      },
      { status: 400 },
    );
  }

  if (!isValidSalesforceId(sfOppId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_sf_id",
        message:
          "sfOppId must be a 15- or 18-character alphanumeric Salesforce Id (got " +
          sfOppId.length +
          " chars)",
      },
      { status: 400 },
    );
  }

  try {
    // ─── 1. Load substrate ──────────────────────────────────────────────
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

    // ─── 2. Discover org schema, narrow query to fields that exist ─────
    // Org-specific custom fields may not exist in every org, so SELECTing
    // them would 400 with INVALID_FIELD. Intersect the engine's mapped
    // (standard) fields with the org's actual schema before querying.
    const desc = await describeOpportunity();
    const orgFields = new Set(desc.fields.map((f) => f.name));

    const candidateFields = Array.from(
      new Set([
        ...SF_OPPORTUNITY_FIELDS.standard,
        ...allOpportunityFields(),
      ]),
    );
    const queryableFields = candidateFields.filter((f) => orgFields.has(f));

    if (!queryableFields.includes("Id")) queryableFields.unshift("Id");
    if (!queryableFields.includes("Name")) queryableFields.push("Name");

    // ─── 3. Query the specific opportunity ────────────────────────────
    const conn = await getConnection();
    const safeId = sfOppId.replace(/[^A-Za-z0-9]/g, ""); // belt-and-suspenders
    const fieldList = queryableFields.join(", ");
    const result = await conn.query<Record<string, unknown>>(
      `SELECT ${fieldList} FROM Opportunity WHERE Id = '${safeId}' LIMIT 1`,
    );

    if (!result.records || result.records.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "sf_opp_not_found",
          message: `No Salesforce opportunity found with Id ${safeId}`,
        },
        { status: 404 },
      );
    }
    const sfOpp = result.records[0];

    // ─── 4. Run the diff engine ───────────────────────────────────────
    const fullDiff = diffOpportunity(sfOpp, loaded.substrate, dealId);

    // Filter out items the org doesn't actually have schema for (avoids
    // misleading "SF blank, suggest substrate value" on fields that
    // don't exist in this org at all). For "Id" pseudo-field, retain.
    const visibleItems: DiffItem[] = fullDiff.items.filter((it) =>
      orgFields.has(it.sf_field),
    );

    // ─── 5. SAFETY INVARIANT — readonly fields cannot suggest writes ──
    // The engine already enforces this. This re-check is defense in
    // depth: if a future engine refactor breaks the invariant, the
    // route 500s rather than silently returning a write recommendation
    // for a forecast-impacting field.
    for (const it of visibleItems) {
      if (
        it.tier === "readonly" &&
        (it.action === "write_now" || it.action === "suggest")
      ) {
        console.error(
          "[sf-diff] INVARIANT VIOLATION: readonly field returned writeable action",
          { sf_field: it.sf_field, action: it.action, status: it.status },
        );
        return NextResponse.json(
          {
            ok: false,
            error: "readonly_invariant_violated",
            message: `Engine returned ${it.action} for readonly field ${it.sf_field}. Forecast-impacting fields must always be surface_only.`,
            offending_item: it,
          },
          { status: 500 },
        );
      }
    }

    // ─── 6. Recompute rollup over the visible (filtered) items only ──
    const by_status = { match: 0, sf_blank: 0, substrate_blank: 0, differs: 0 };
    const by_action = { write_now: 0, suggest: 0, surface_only: 0, no_op: 0 };
    for (const it of visibleItems) {
      by_status[it.status]++;
      by_action[it.action]++;
    }

    // Build dry-run preview from the FULL (unfiltered) diff. This shows
    // exactly what the system would PATCH if writes were enabled —
    // crucial verification step before earning the write privilege.
    // The filter param above only affects the visible items list, not
    // the dry-run computation, so the preview is always complete.
    const dryRunFromFull = buildDryRunPreview({
      ...fullDiff,
      items: visibleItems, // org-available fields only
    });

    // Apply optional actionable-only filter to the items list. Rollup
    // counts above are computed BEFORE filtering so surface_only items
    // remain accounted for ("hidden but auditable").
    const renderedItems = actionableOnly
      ? visibleItems.filter(
          (it) => it.action === "write_now" || it.action === "suggest",
        )
      : visibleItems;
    const hidden_surface_only_count = actionableOnly
      ? visibleItems.filter((it) => it.action === "surface_only").length
      : 0;
    const hidden_no_op_count = actionableOnly
      ? visibleItems.filter((it) => it.action === "no_op").length
      : 0;

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - t0,
      route: "/api/sf/diff",
      writes_performed: false, // explicit signal — this route never writes
      filter: {
        actionableOnly,
        hidden_surface_only_count,
        hidden_no_op_count,
        note: actionableOnly
          ? "Items list shows only write_now + suggest. Surface_only and no_op items are still counted in by_action below for full auditability."
          : "All items returned. Pass ?actionableOnly=true to filter to write_now + suggest only.",
      },
      diff: {
        sf_id: fullDiff.sf_id,
        sf_name: fullDiff.sf_name,
        substrate_deal_id: fullDiff.substrate_deal_id,
        total: visibleItems.length,
        by_status,
        by_action,
        items: renderedItems.map((it) => ({
          field_label: it.field_label,
          sf_field: it.sf_field,
          tier: it.tier,
          substrate_value: it.substrate_value,
          sf_value: it.sf_current,
          status: it.status,
          action: it.action,
          reason: it.reason,
        })),
      },
      substrate_summary: {
        deal_name: loaded.substrate.opportunity?.name ?? null,
        account_name: loaded.substrate.account?.name ?? null,
        stakeholder_count: (loaded.substrate.stakeholders ?? []).length,
        activity_count: (loaded.substrate.activities ?? []).length,
      },
      link: await (async () => {
        const active = await getActiveLinkForDeal(dealId);
        if (!active) return { status: "unconfirmed", active: null };
        if (active.sf_opp_id === safeId) {
          return { status: "confirmed_match", active };
        }
        return {
          status: "confirmed_other",
          active, // points to a DIFFERENT sfOppId — UI should warn
        };
      })(),
      dry_run: dryRunFromFull,
      schema: {
        org_total_fields: orgFields.size,
        engine_known_fields: candidateFields.length,
        fields_queried: queryableFields.length,
        fields_unavailable_in_org: candidateFields.filter(
          (f) => !orgFields.has(f),
        ),
      },
    });
  } catch (e) {
    if (e instanceof SalesforceConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_env",
          message: e.message,
          hint: "Add SF_CLIENT_ID, SF_CLIENT_SECRET, SF_LOGIN_URL to .env.local",
          elapsed_ms: Date.now() - t0,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "diff_failed",
        message: (e as Error).message,
        elapsed_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
