/**
 * ============================================================================
 *  Deal Save Ledger — writes (DARK)
 * ============================================================================
 *
 *  Two writes that bookend a save EPISODE (see 038_deal_saves.sql):
 *
 *    recordDealSaveCandidate — opens an episode when Mallin acts on an at-risk
 *      deal under rep approval. Idempotent per open episode: the partial-unique
 *      index (one 'still_open' row per opportunity) is the guard, so a
 *      re-flagged deal that already has an open save does NOT double-count.
 *      Unlike execution_artifacts we do NOT demote-then-insert here — a save is
 *      one real episode that RESOLVES, not a versioned artifact, so opening a
 *      second row for the same live risk would inflate the ledger. We insert
 *      once and let resolveDealSave close it.
 *
 *    resolveDealSave — closes the episode: outcome ('recovered' | 'lost') plus,
 *      on recovery, the rep-confirmed counterfactual. The counterfactual is the
 *      credibility engine — credited pipeline only counts 'would_have_missed'.
 *
 *  STATUS — DARK: nothing in the live pipeline calls these yet. They exist so
 *  the ledger can accumulate on a handful of REAL at-risk deals for quality
 *  review before the surface (and the finance rollup) light up, mirroring the
 *  persist-rep-behavior doctrine.
 * ============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/db/client';

const TABLE = 'deal_saves';

/**
 * Per-tenant gate for the save ledger. DARK by default: the ledger only writes
 * for tenants listed in DEAL_SAVE_LEDGER_TENANTS (comma-separated tenant IDs),
 * so it accumulates on a handful of REAL deals for quality review before it
 * lights up workspace-wide — same doctrine as persist-rep-behavior.
 */
export function isDealSaveLedgerEnabled(tenantId: string): boolean {
  const allow = (process.env.DEAL_SAVE_LEDGER_TENANTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(tenantId);
}

export type RiskSignal =
  | 'stalled'
  | 'no_next_step'
  | 'champion_dark'
  | 'procurement_stuck'
  | 'single_threaded'
  | 'ghosted';

export type SaveAction =
  | 'reengage_email'
  | 'multithread'
  | 'exec_escalation'
  | 'reframe_value'
  | 'revive_next_step';

export type Counterfactual = 'would_have_missed' | 'would_have_caught' | 'unsure';

export interface RecordDealSaveParams {
  tenantId: string;
  opportunityId: string;
  /** The at-risk signature that opened the episode. */
  riskSignal: RiskSignal;
  /** The human "why", reused verbatim from the rep-focus at-risk driver. */
  riskDriver?: string;
  /** When the deal was flagged at-risk (from the execution artifact). */
  flaggedAt: string;
  /** Deal value AT FLAG — snapshotted so growth can't inflate the credit. */
  amountAtFlag?: number | null;
  currency?: string;
  actionTaken: SaveAction;
  /** Soft pointer to the brief/artifact that carried the move (no FK). */
  actionArtifactId?: string | null;
  /** Clerk user ID of the rep who greenlit the governed action. */
  approvedByUserId?: string | null;
  /** Injectable for tests. Defaults to the service-role admin client. */
  client?: SupabaseClient;
}

/**
 * Open a save episode. Returns the row id, or the id of the existing open
 * episode if one is already live for this opportunity (idempotent — the
 * partial-unique index prevents a second open row, and we surface that rather
 * than throwing so a re-flag is a no-op, not an error). Throws on any other
 * insert failure so callers/runners surface it.
 */
export async function recordDealSaveCandidate(
  params: RecordDealSaveParams
): Promise<string> {
  const client = params.client ?? supabaseAdmin;

  // Idempotency: if an episode is already open for this opp, reuse it.
  const { data: open } = await client
    .from(TABLE)
    .select('id')
    .eq('opportunity_id', params.opportunityId)
    .eq('outcome', 'still_open')
    .maybeSingle();
  if (open?.id) return open.id as string;

  const { data, error } = await client
    .from(TABLE)
    .insert({
      tenant_id: params.tenantId,
      opportunity_id: params.opportunityId,
      risk_signal: params.riskSignal,
      risk_driver: params.riskDriver ?? null,
      flagged_at: params.flaggedAt,
      amount_at_flag: params.amountAtFlag ?? null,
      currency: params.currency ?? 'USD',
      action_taken: params.actionTaken,
      action_artifact_id: params.actionArtifactId ?? null,
      approved_by_user_id: params.approvedByUserId ?? null,
      outcome: 'still_open',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`deal_saves insert failed: ${error.message}`);
  }
  return data.id as string;
}

export interface ResolveDealSaveParams {
  tenantId: string;
  opportunityId: string;
  outcome: 'recovered' | 'lost';
  outcomeAt: string;
  /** Required on 'recovered' — the credibility engine. Null on 'lost'. */
  counterfactual?: Counterfactual | null;
  /** Clerk user ID of the rep who confirmed the counterfactual. */
  confirmedByUserId?: string | null;
  confirmedAt?: string | null;
  notes?: string | null;
  /** Injectable for tests. Defaults to the service-role admin client. */
  client?: SupabaseClient;
}

/**
 * Resolve the open episode for an opportunity. On 'recovered' the rep's
 * counterfactual is what makes the save credited (or honestly declined).
 * Throws if no open episode exists or the update fails.
 */
export async function resolveDealSave(
  params: ResolveDealSaveParams
): Promise<void> {
  const client = params.client ?? supabaseAdmin;

  const { data, error } = await client
    .from(TABLE)
    .update({
      outcome: params.outcome,
      outcome_at: params.outcomeAt,
      counterfactual: params.outcome === 'recovered' ? params.counterfactual ?? null : null,
      confirmed_by_user_id: params.confirmedByUserId ?? null,
      confirmed_at: params.confirmedAt ?? null,
      notes: params.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', params.tenantId)
    .eq('opportunity_id', params.opportunityId)
    .eq('outcome', 'still_open')
    .select('id');

  if (error) {
    throw new Error(`deal_saves resolve failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `deal_saves resolve: no open episode for opportunity ${params.opportunityId}`
    );
  }
}

export interface ConfirmCounterfactualParams {
  tenantId: string;
  /** Target by episode id — a deal can have several recovered episodes over
   *  time, and only the one the rep is answering should be confirmed. */
  saveId: string;
  counterfactual: Counterfactual;
  /** Clerk user ID of the rep answering. */
  confirmedByUserId: string;
  confirmedAt?: string;
  notes?: string | null;
  /** Injectable for tests. Defaults to the service-role admin client. */
  client?: SupabaseClient;
}

/**
 * The governed confirmation gesture (modeled on cockpit_actions): the rep
 * answers "would you have caught this without Mallin?" on a recovered episode,
 * setting the counterfactual that credits — or honestly declines — the save.
 * Only acts on a recovered, not-yet-confirmed episode. Throws if none matches
 * (already answered, or not recovered), so a double-tap is a no-op error rather
 * than a silent overwrite.
 */
export async function confirmDealSaveCounterfactual(
  params: ConfirmCounterfactualParams
): Promise<void> {
  const client = params.client ?? supabaseAdmin;

  const patch: Record<string, unknown> = {
    counterfactual: params.counterfactual,
    confirmed_by_user_id: params.confirmedByUserId,
    confirmed_at: params.confirmedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Only touch notes when provided — never clobber a note set at resolve.
  if (params.notes !== undefined) patch.notes = params.notes;

  const { data, error } = await client
    .from(TABLE)
    .update(patch)
    .eq('id', params.saveId)
    .eq('tenant_id', params.tenantId)
    .eq('outcome', 'recovered')
    .is('counterfactual', null)
    .select('id');

  if (error) {
    throw new Error(`deal_saves confirm failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `deal_saves confirm: no unconfirmed recovered episode ${params.saveId}`
    );
  }
}
