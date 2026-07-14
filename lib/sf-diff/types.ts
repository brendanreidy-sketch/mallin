/**
 * ============================================================================
 *  Salesforce ↔ Substrate diff engine — types
 * ============================================================================
 *
 *  Phase 1 of the write-back spec (read-only). Compares a Salesforce
 *  Opportunity record against the substrate truth, returns a list of
 *  per-field diffs tagged with tier (auto / suggest / readonly) and
 *  suggested action (write_now / suggest / surface_only / no_op).
 *
 *  No UI here. No HTTP route. No write side-effects. Pure data in →
 *  data out, so it's exhaustively unit-testable and the eventual UI
 *  is a thin renderer of the result.
 *
 *  Doctrine alignment (DOCTRINE.md §11.3):
 *    - Tiers come from SF_FIELD_TIERS in the mapping module.
 *    - Forecast-impacting fields (StageName, Amount, CloseDate) are
 *      tier=readonly here — engine surfaces the gap but the action is
 *      always "surface_only", never "write_now" or "suggest". Caller
 *      that builds an Approve button MUST gate on this.
 * ============================================================================
 */

/** Action the engine recommends for a single field diff. */
export type DiffAction =
  | "write_now" // tier=auto, SF is blank, substrate has a confident value
  | "suggest" // tier=suggest (or tier=auto on a value disagreement)
  | "surface_only" // tier=readonly — show the gap, never offer to write
  | "no_op"; // values match, or substrate has nothing useful to add

/** Why this diff exists, relative to SF's current state. */
export type DiffStatus =
  | "match" // SF and substrate agree
  | "sf_blank" // SF is blank, substrate has a value
  | "substrate_blank" // SF has a value, substrate doesn't (no_op)
  | "differs"; // both have values, they disagree

export interface DiffItem {
  /** Human-readable label for the field (used in UI). */
  field_label: string;
  /** Salesforce API name (e.g. "Who_is_the_Economic_Buyer__c"). */
  sf_field: string;
  /** doctrine §11.3 tier — auto / suggest / readonly. */
  tier: "auto" | "suggest" | "readonly";
  /** Stringified SF current value (null if blank). */
  sf_current: string | null;
  /** Stringified substrate-derived value (null if substrate has nothing). */
  substrate_value: string | null;
  status: DiffStatus;
  action: DiffAction;
  /** One-line rationale, surfaced in the UI tooltip / debug. */
  reason: string;
}

export interface DiffResult {
  /** Salesforce Opportunity Id (18-char). */
  sf_id: string;
  /** SF Opportunity name, for the panel title. */
  sf_name: string;
  /** Substrate deal id we matched against. */
  substrate_deal_id: string;
  /** Total diff items (including no_op). */
  total: number;
  /** Counts by status. */
  by_status: Record<DiffStatus, number>;
  /** Counts by action. */
  by_action: Record<DiffAction, number>;
  items: DiffItem[];
}
