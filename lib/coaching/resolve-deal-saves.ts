/**
 * ============================================================================
 *  Deal Save Ledger — the resolve side (closes the loop)
 * ============================================================================
 *
 *  recordDealSaveCandidate opens an episode when Mallin acts on an at-risk
 *  deal. This module RESOLVES it:
 *
 *    detectAndResolveDealSaves — runs on the proactive cron. For each open
 *      episode it reads the deal's current state and resolves symmetrically to
 *      how it opened:
 *        • closed lost / no_decision            → 'lost'      (no rep prompt)
 *        • the at-risk signature has cleared     → 'recovered' (pending the
 *          (no longer stall/silence, or won)       counterfactual ask)
 *        • still at-risk                         → left open
 *
 *    getPendingCounterfactuals — the recovered-but-unconfirmed episodes that
 *      need the rep's one-tap answer. Feeds the prompt surface (digest / cockpit)
 *      and, via confirmDealSaveCounterfactual, becomes credited pipeline.
 *
 *  A 'recovered' episode is NOT yet credited — tallyDealSaves counts it as
 *  pending until the rep confirms 'would_have_missed'. The recovery is the
 *  system's observation; the credit requires the human. That gap is the whole
 *  point: it's what makes the ledger auditable rather than self-serving.
 *
 *  Never throws — a resolve pass that fails returns a zeroed summary / [] so it
 *  can never break the cron or a dashboard.
 * ============================================================================
 */

import { supabaseAdmin } from '@/lib/db/client';
import { scanTenantForNudges } from '@/lib/proactive/detect-nudges';
import { resolveDealSave } from '@/lib/coaching/persist-deal-save';

/**
 * The resolution decision, pure and testable with no database.
 *   - A deal that closed lost / no_decision is a loss, never a save.
 *   - A deal that closed won cleared the risk → recovered.
 *   - Otherwise: recovered once it's no longer flagged at-risk; still open
 *     while the at-risk signature persists.
 */
export function classifySaveResolution(args: {
  dealOutcome?: string | null;
  stillAtRisk: boolean;
}): 'lost' | 'recovered' | 'still_open' {
  const { dealOutcome, stillAtRisk } = args;
  if (dealOutcome === 'lost' || dealOutcome === 'no_decision') return 'lost';
  if (dealOutcome === 'won') return 'recovered';
  return stillAtRisk ? 'still_open' : 'recovered';
}

export interface ResolveSummary {
  recovered: number;
  lost: number;
  stillOpen: number;
}

export async function detectAndResolveDealSaves(
  tenantId: string,
  nowMs: number
): Promise<ResolveSummary> {
  const summary: ResolveSummary = { recovered: 0, lost: 0, stillOpen: 0 };
  try {
    const { data: openEps } = await supabaseAdmin
      .from('deal_saves')
      .select('opportunity_id')
      .eq('tenant_id', tenantId)
      .eq('outcome', 'still_open');
    if (!openEps || openEps.length === 0) return summary;

    const oppIds = [...new Set(openEps.map((e) => e.opportunity_id as string))];

    const [outcomesRes, nudges] = await Promise.all([
      supabaseAdmin
        .from('deal_outcomes')
        .select('opportunity_id, outcome')
        .in('opportunity_id', oppIds),
      // Re-scan with the SAME detector that opened the episode — symmetry is
      // what makes "no longer at-risk" an honest recovery signal.
      scanTenantForNudges(tenantId, nowMs),
    ]);

    const outcomeOf = new Map(
      (outcomesRes.data ?? []).map((o) => [o.opportunity_id as string, o.outcome as string])
    );
    const atRisk = new Set(
      nudges
        .filter((n) => n.kind === 'stall' || n.kind === 'silence')
        .map((n) => n.opportunityId)
    );

    const outcomeAt = new Date(nowMs).toISOString();
    for (const opportunityId of oppIds) {
      const verdict = classifySaveResolution({
        dealOutcome: outcomeOf.get(opportunityId),
        stillAtRisk: atRisk.has(opportunityId),
      });
      if (verdict === 'still_open') {
        summary.stillOpen += 1;
        continue;
      }
      try {
        await resolveDealSave({ tenantId, opportunityId, outcome: verdict, outcomeAt });
        if (verdict === 'recovered') summary.recovered += 1;
        else summary.lost += 1;
      } catch {
        /* best-effort per episode — one failure never aborts the pass */
      }
    }
    return summary;
  } catch {
    return summary;
  }
}

export interface PendingCounterfactual {
  saveId: string;
  opportunityId: string;
  dealName: string;
  riskDriver: string | null;
  actionTaken: string;
  recoveredAt: string | null;
}

/**
 * Recovered episodes awaiting the rep's counterfactual answer — the prompt
 * queue. Company-scope is intentionally NOT applied: a rep confirms saves on
 * their OWN workspace's deals, not a sibling's.
 */
export async function getPendingCounterfactuals(
  tenantId: string
): Promise<PendingCounterfactual[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('deal_saves')
      .select('id, opportunity_id, risk_driver, action_taken, outcome_at')
      .eq('tenant_id', tenantId)
      .eq('outcome', 'recovered')
      .is('counterfactual', null)
      .order('outcome_at', { ascending: false });
    if (error || !data || data.length === 0) return [];

    const oppIds = [...new Set(data.map((r) => r.opportunity_id as string))];
    const { data: opps } = await supabaseAdmin
      .from('opportunities')
      .select('id, name')
      .in('id', oppIds);
    const nameOf = new Map(
      (opps ?? []).map((o) => [o.id as string, (o.name as string | null) ?? 'a deal'])
    );

    return data.map((r) => ({
      saveId: r.id as string,
      opportunityId: r.opportunity_id as string,
      dealName: nameOf.get(r.opportunity_id as string) ?? 'a deal',
      riskDriver: (r.risk_driver as string | null) ?? null,
      actionTaken: r.action_taken as string,
      recoveredAt: (r.outcome_at as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}
