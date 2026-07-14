/**
 * ============================================================================
 *  Substrate-side value extractors
 * ============================================================================
 *
 *  Each extractor pulls a field-shaped value out of the substrate that
 *  maps onto a single Salesforce field. The diff engine calls these to
 *  compute "what substrate says" before comparing against "what SF says".
 *
 *  All extractors return either a normalized string or null. Returning
 *  null means "substrate has nothing useful to suggest for this field"
 *  → the engine will mark the diff as no_op.
 *
 *  Adding a new mapped field:
 *    1. Add a new extractor below.
 *    2. Reference it in lib/sf-diff/engine.ts's MAPPING table.
 *    3. Add a unit test covering the typical + null + tricky cases.
 * ============================================================================
 */

import type { LoadedSubstrate } from "../db/load-deal";

/** Substrate value extractor: substrate → string | null. */
export type SubstrateExtractor = (s: LoadedSubstrate) => string | null;

// ─────────────────────────────────────────────────────────────────────────────
// Standard SF fields
// ─────────────────────────────────────────────────────────────────────────────

export const opportunityName: SubstrateExtractor = (s) =>
  s.opportunity?.name?.trim() || null;

/** stage_label is substrate's free-text stage. We surface it for the
 *  readonly diff against SF's StageName, but the engine will never
 *  suggest writing it. */
export const stageLabel: SubstrateExtractor = (s) =>
  s.opportunity?.stage_label?.trim() || null;

/** Amount from substrate. Returned as string for diff display. Engine
 *  uses normalized comparison so "125000" matches "125000.00". */
export const amount: SubstrateExtractor = (s) => {
  const a = s.opportunity?.amount;
  if (a == null) return null;
  return String(a);
};

/** YYYY-MM-DD format to match SF CloseDate shape. */
export const closeDate: SubstrateExtractor = (s) => {
  const d = s.opportunity?.close_date;
  if (!d) return null;
  // Substrate stores as ISO date; SF wants YYYY-MM-DD only.
  return d.slice(0, 10);
};

/** ISO date of last activity in substrate. Compared against SF
 *  LastActivityDate (also YYYY-MM-DD). */
export const lastActivityDate: SubstrateExtractor = (s) => {
  // Pick the latest activity occurrence from substrate.activities[].
  const acts = s.activities ?? [];
  if (acts.length === 0) {
    // Fallback to opportunity.last_activity_at if present.
    const fallback = s.opportunity?.last_activity_at;
    return fallback ? fallback.slice(0, 10) : null;
  }
  let latest = "";
  for (const a of acts) {
    if (a.occurred_at && a.occurred_at > latest) latest = a.occurred_at;
  }
  return latest ? latest.slice(0, 10) : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// MEDDPICC — Champion / Economic Buyer
// ─────────────────────────────────────────────────────────────────────────────

/** Format: "Name (Title)" or "Name" if title missing. Used for both
 *  Who_is_the_Champion__c and Who_is_the_Economic_Buyer__c. */
function formatStakeholder(
  name: string,
  title: string | undefined,
): string {
  const n = name.trim();
  const t = title?.trim();
  return t ? `${n} (${t})` : n;
}

/** Pick the substrate stakeholder whose committee_role indicates
 *  champion. Multiple candidates → return the first one (substrate
 *  shouldn't have ambiguous champions; if it does, that's a substrate
 *  bug we want surfaced). */
export const champion: SubstrateExtractor = (s) => {
  const sh = s.stakeholders ?? [];
  const c = sh.find((x) => /champion/i.test(x.committee_role ?? ""));
  if (!c) return null;
  return formatStakeholder(c.name, c.title);
};

/** Economic buyer: committee_role contains "economic_buyer" or "eb". */
export const economicBuyer: SubstrateExtractor = (s) => {
  const sh = s.stakeholders ?? [];
  const c = sh.find((x) => {
    const r = (x.committee_role ?? "").toLowerCase();
    return r.includes("economic_buyer") || r === "eb";
  });
  if (!c) return null;
  return formatStakeholder(c.name, c.title);
};

/** "Who signs" — typically the same stakeholder as economic_buyer.
 *  If substrate distinguishes a signer role, prefer that; else fall
 *  back to EB. */
export const whoSigns: SubstrateExtractor = (s) => {
  const sh = s.stakeholders ?? [];
  const explicit = sh.find((x) =>
    /signer|signs|approver/i.test(x.committee_role ?? ""),
  );
  if (explicit) return formatStakeholder(explicit.name, explicit.title);
  return economicBuyer(s);
};

// ─────────────────────────────────────────────────────────────────────────────
// Free-text MEDDPICC pillars
// ─────────────────────────────────────────────────────────────────────────────

/** UBV details / Bus drivers / Compelling event — these typically live
 *  in artifact-level text rather than substrate. Until the artifact is
 *  threaded into the diff input, return null (substrate has nothing). */
export const ubvDetails: SubstrateExtractor = () => null;
export const compellingEventDetails: SubstrateExtractor = () => null;

// ─────────────────────────────────────────────────────────────────────────────
// Competition — derived from artifact (forced_move / risk surfaces),
// not directly stored in substrate. Stub for now; engine will mark
// these as no_op until artifact is threaded in.
// ─────────────────────────────────────────────────────────────────────────────

export const competition: SubstrateExtractor = () => null;
