/**
 * ============================================================================
 *  Slack interaction audit — Stage 1 trust progression ledger
 * ============================================================================
 *
 *  Every "Looks right" / "Looks wrong" click in Slack lands as a row
 *  in slack_interactions. The aggregate of those rows is what unlocks
 *  Stage 2 graduation per ui_trust_progression.md (≥85% confirm rate
 *  over N=50 for a given field).
 *
 *  This module exposes:
 *    - InsertSlackInteractionInput / insertSlackInteraction()
 *      The single write path. Used by /api/slack/interact.
 *    - getConfirmRateByField()
 *      The graduation-eligibility query. Returns confirm rate +
 *      sample size per SF field.
 *    - getConfirmRateByRule()
 *      Same shape but grouped by rule_id (for alerts that don't
 *      target a single SF field).
 *
 *  Failure mode: if the DB insert fails, the route still returns 200
 *  to Slack (the click already replaced the message — we don't want
 *  Slack to retry and create duplicate rows). The error is logged so
 *  it's catchable in monitoring. This is a deliberate trade-off: a
 *  single missed audit row is preferable to a noisy retry storm.
 * ============================================================================
 */

// supabaseAdmin is loaded lazily — its module-level init throws when
// env vars are missing, which would prevent unit-testing the pure
// aggregation helpers (aggregate, isGraduationEligible) below.
async function getDb() {
  const mod = await import("../db/client");
  return mod.supabaseAdmin;
}

/** Mirrors the slack_interaction_status enum in the DB. */
export type SlackInteractionStatus =
  | "confirmed_pending_apply"
  | "dismissed_with_correction"
  | "unknown_action";

export interface InsertSlackInteractionInput {
  /** WHO clicked. */
  slack_user_id: string;
  slack_user_name?: string | null;

  /** WHAT they clicked. */
  action_id: string;
  status: SlackInteractionStatus;

  /** WHICH alert. */
  rule_id: string;
  alert_severity: string;
  deal_name?: string | null;
  deal_id?: string | null;
  sf_field?: string | null;
  suggested_value?: string | null;
  triggered_at_call?: number | null;

  /** WHEN. */
  message_ts: string;
  channel_id?: string | null;

  /** RAW snapshot of the entire Slack payload. */
  raw_payload: Record<string, unknown>;
}

export interface InsertSlackInteractionResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Insert one Slack interaction row.
 *
 * Never throws — errors are returned in `error` so the calling route
 * can decide whether to surface or swallow. The current caller
 * (/api/slack/interact) swallows so the user-facing message-replace
 * still works even when the audit write fails.
 */
export async function insertSlackInteraction(
  input: InsertSlackInteractionInput,
): Promise<InsertSlackInteractionResult> {
  try {
    const supabaseAdmin = await getDb();
    const { data, error } = await supabaseAdmin
      .from("slack_interactions")
      .insert({
        slack_user_id: input.slack_user_id,
        slack_user_name: input.slack_user_name ?? null,
        action_id: input.action_id,
        status: input.status,
        rule_id: input.rule_id,
        alert_severity: input.alert_severity,
        deal_name: input.deal_name ?? null,
        deal_id: input.deal_id ?? null,
        sf_field: input.sf_field ?? null,
        suggested_value: input.suggested_value ?? null,
        triggered_at_call: input.triggered_at_call ?? null,
        message_ts: input.message_ts,
        channel_id: input.channel_id ?? null,
        raw_payload: input.raw_payload,
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ────────────────────────────────────────────────────────────────────
 *  Confirm-rate aggregations — drive Stage 1 → Stage 2 graduation
 * ──────────────────────────────────────────────────────────────────── */

export interface ConfirmRateRow {
  /** Grouping key — sf_field (when grouping by field) or rule_id. */
  key: string;
  confirms: number;
  dismisses: number;
  total: number;
  /** confirms / total — null when total is zero. */
  confirm_rate: number | null;
  /** True when this group meets the ui_trust_progression.md threshold:
   *  total >= 50 AND confirm_rate >= 0.85. Use this to decide whether
   *  a field is eligible to graduate from Stage 1 (Suggest) to
   *  Stage 2 (Apply). */
  graduation_eligible: boolean;
}

const GRADUATION_MIN_SAMPLE = 50;
const GRADUATION_MIN_RATE = 0.85;

/** Compute the eligibility flag — exposed so callers can change the
 *  threshold without recomputing rate themselves. */
export function isGraduationEligible(total: number, rate: number | null): boolean {
  if (rate === null) return false;
  return total >= GRADUATION_MIN_SAMPLE && rate >= GRADUATION_MIN_RATE;
}

/**
 * Confirm rate grouped by sf_field. Rows where sf_field IS NULL are
 * excluded — use getConfirmRateByRule() for those.
 */
export async function getConfirmRateByField(): Promise<ConfirmRateRow[]> {
  const supabaseAdmin = await getDb();
  const { data, error } = await supabaseAdmin
    .from("slack_interactions")
    .select("sf_field,status")
    .not("sf_field", "is", null);
  if (error) {
    throw new Error(`getConfirmRateByField: ${error.message}`);
  }
  return aggregate((data ?? []).map((r) => ({ key: r.sf_field as string, status: r.status as string })));
}

/**
 * Confirm rate grouped by rule_id (every row has rule_id, so this
 * covers the full corpus including alerts without a specific sf_field).
 */
export async function getConfirmRateByRule(): Promise<ConfirmRateRow[]> {
  const supabaseAdmin = await getDb();
  const { data, error } = await supabaseAdmin
    .from("slack_interactions")
    .select("rule_id,status");
  if (error) {
    throw new Error(`getConfirmRateByRule: ${error.message}`);
  }
  return aggregate((data ?? []).map((r) => ({ key: r.rule_id as string, status: r.status as string })));
}

/** Pure aggregation — exposed for unit testing. */
export function aggregate(
  rows: { key: string; status: string }[],
): ConfirmRateRow[] {
  const map = new Map<string, { confirms: number; dismisses: number; total: number }>();
  for (const r of rows) {
    const e = map.get(r.key) ?? { confirms: 0, dismisses: 0, total: 0 };
    e.total += 1;
    if (r.status === "confirmed_pending_apply") e.confirms += 1;
    if (r.status === "dismissed_with_correction") e.dismisses += 1;
    map.set(r.key, e);
  }
  return Array.from(map.entries())
    .map(([key, v]) => {
      const rate = v.total > 0 ? v.confirms / v.total : null;
      return {
        key,
        confirms: v.confirms,
        dismisses: v.dismisses,
        total: v.total,
        confirm_rate: rate,
        graduation_eligible: isGraduationEligible(v.total, rate),
      };
    })
    .sort((a, b) => b.total - a.total);
}
