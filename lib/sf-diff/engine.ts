/**
 * ============================================================================
 *  Salesforce ↔ Substrate diff engine
 * ============================================================================
 *
 *  Pure logic. Given a SF Opportunity record (raw object from jsforce
 *  query result) and a substrate snapshot, returns a structured diff.
 *
 *  No I/O. No fetches. No writes. Caller orchestrates.
 *
 *  The mapping table below is the source of truth for "which SF field
 *  maps to which substrate extractor". Add a new row to wire up a new
 *  field; everything else (status detection, action assignment, count
 *  rollup) is automatic.
 * ============================================================================
 */

import type { LoadedSubstrate } from "../db/load-deal";
import { tierForField } from "../adapters/salesforce-mapping";
import type {
  DiffAction,
  DiffItem,
  DiffResult,
  DiffStatus,
} from "./types";
import * as extractors from "./extractors";

// ─────────────────────────────────────────────────────────────────────────────
// Mapping table — each row links SF field → substrate extractor
// ─────────────────────────────────────────────────────────────────────────────

interface MappingRow {
  sf_field: string;
  field_label: string;
  extractor: extractors.SubstrateExtractor;
}

const MAPPING: MappingRow[] = [
  // Standard fields
  {
    sf_field: "Name",
    field_label: "Opportunity Name",
    extractor: extractors.opportunityName,
  },
  {
    sf_field: "StageName",
    field_label: "Stage",
    extractor: extractors.stageLabel,
  },
  {
    sf_field: "Amount",
    field_label: "Amount",
    extractor: extractors.amount,
  },
  {
    sf_field: "CloseDate",
    field_label: "Close Date",
    extractor: extractors.closeDate,
  },
  {
    sf_field: "LastActivityDate",
    field_label: "Last Activity",
    extractor: extractors.lastActivityDate,
  },

  // NOTE: Only standard Salesforce fields are mapped here. Org-specific
  // custom ("__c") fields (methodology / people / competition, etc.) are
  // deferred to the per-tenant schema introspection path — see
  // lib/adapters/salesforce-mapping.ts. The substrate extractors for
  // those concepts still exist in ./extractors and can be re-wired once
  // a tenant's own SF custom fields are discovered.
];

// ─────────────────────────────────────────────────────────────────────────────
// Core engine
// ─────────────────────────────────────────────────────────────────────────────

/** Coerce any SF field value into the same string shape extractors return,
 *  so equality checks are apples-to-apples. */
function normalizeSfValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t === "" ? null : t;
  }
  if (typeof raw === "number") {
    return String(raw);
  }
  if (typeof raw === "boolean") {
    return raw ? "true" : "false";
  }
  // Dates often arrive as ISO strings already; objects we don't recognize
  // get JSON-stringified so the diff still surfaces something useful.
  return JSON.stringify(raw);
}

/** Apples-to-apples comparison after light normalization. */
function valuesEqual(a: string | null, b: string | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Numeric tolerance for amount-shaped fields: "125000" === "125000.00". */
function numericEqual(a: string, b: string): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return false;
}

function decideStatus(
  sf: string | null,
  sub: string | null,
  isNumericField: boolean,
): DiffStatus {
  if (sf === null && sub === null) return "match"; // both blank, nothing to do
  if (sf === null) return "sf_blank";
  if (sub === null) return "substrate_blank";
  if (valuesEqual(sf, sub)) return "match";
  if (isNumericField && numericEqual(sf, sub)) return "match";
  return "differs";
}

function decideAction(
  status: DiffStatus,
  tier: "auto" | "suggest" | "readonly",
): DiffAction {
  // Forecast-impacting fields: never offer to write, even on disagreement.
  if (tier === "readonly") {
    return status === "match" || status === "substrate_blank"
      ? "no_op"
      : "surface_only";
  }
  if (status === "match" || status === "substrate_blank") return "no_op";
  if (tier === "auto") {
    // Auto-write only when SF is empty AND substrate has a confident value.
    // Disagreement on an existing SF value falls back to suggest — we
    // never silently overwrite something a human typed.
    return status === "sf_blank" ? "write_now" : "suggest";
  }
  // tier === "suggest" — always suggest, never auto.
  return "suggest";
}

function reasonForDiff(
  label: string,
  status: DiffStatus,
  action: DiffAction,
): string {
  if (status === "match") return `${label} matches`;
  if (status === "substrate_blank") return `Substrate has no ${label}`;
  if (status === "sf_blank") {
    return action === "write_now"
      ? `SF blank — auto-write substrate value`
      : action === "surface_only"
      ? `SF blank — flag only, rep edits in SF`
      : `SF blank — suggest substrate value`;
  }
  // differs
  return action === "surface_only"
    ? `Forecast-impacting; surface gap, do not auto-write`
    : `SF ≠ substrate; suggest update for rep approval`;
}

const NUMERIC_FIELDS = new Set(["Amount", "Probability"]);

/**
 * Compute the diff between a Salesforce Opportunity record and a
 * substrate snapshot. Pure function. Stable output ordering matches
 * the MAPPING table for deterministic UI rendering.
 */
export function diffOpportunity(
  sf: Record<string, unknown>,
  substrate: LoadedSubstrate,
  substrate_deal_id: string,
): DiffResult {
  const items: DiffItem[] = [];

  for (const row of MAPPING) {
    const sf_current = normalizeSfValue(sf[row.sf_field]);
    const substrate_value = row.extractor(substrate);
    const tier = tierForField(row.sf_field);
    const isNumeric = NUMERIC_FIELDS.has(row.sf_field);
    const status = decideStatus(sf_current, substrate_value, isNumeric);
    const action = decideAction(status, tier);
    items.push({
      field_label: row.field_label,
      sf_field: row.sf_field,
      tier,
      sf_current,
      substrate_value,
      status,
      action,
      reason: reasonForDiff(row.field_label, status, action),
    });
  }

  // Roll up counts.
  const by_status: Record<DiffStatus, number> = {
    match: 0,
    sf_blank: 0,
    substrate_blank: 0,
    differs: 0,
  };
  const by_action: Record<DiffAction, number> = {
    write_now: 0,
    suggest: 0,
    surface_only: 0,
    no_op: 0,
  };
  for (const it of items) {
    by_status[it.status]++;
    by_action[it.action]++;
  }

  return {
    sf_id: String(sf.Id ?? ""),
    sf_name: String(sf.Name ?? ""),
    substrate_deal_id,
    total: items.length,
    by_status,
    by_action,
    items,
  };
}

/** Filter helper for the eventual UI: only show items the rep should
 *  actually act on (drops match + substrate_blank no-ops). */
export function actionableItems(diff: DiffResult): DiffItem[] {
  return diff.items.filter((i) => i.action !== "no_op");
}
