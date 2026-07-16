/**
 * ============================================================================
 *  Deal Save Ledger — the rollup (the number a firm audits)
 * ============================================================================
 *
 *  Reads deal_saves (see 038_deal_saves.sql) and returns the tangible-outcome
 *  summary a manager / finance owner relies on: credited pipeline saved, and
 *  — right next to it — the no-credit rate that proves the number is honest.
 *
 *  Crediting rule lives HERE, in one place, so it stays tunable:
 *    credited  = recovered AND counterfactual = 'would_have_missed'
 *    declined  = recovered AND counterfactual = 'would_have_caught'  (the rep
 *                had it — shown proudly; this is what makes the ledger auditable)
 *    pending   = still_open, OR recovered-but-not-yet-confirmed / 'unsure'
 *
 *  A save is credited on its amount_at_flag SNAPSHOT (never a close-time value),
 *  so the ledger can't be inflated by growth that happened for other reasons.
 *
 *  Company-scoped (this workspace + siblings), like outcome memory — a company
 *  audits its whole revenue org, not one workspace. Falls back to [tenantId].
 *  Never throws: any gap returns a zeroed ledger so a dashboard never breaks.
 * ============================================================================
 */

import { supabaseAdmin } from '@/lib/db/client';
import { getCompanyTenantIds } from '@/lib/cognition/company-graph';

export interface DealSaveLedger {
  /** Recovered + rep-confirmed "would have missed". The headline number. */
  creditedSaves: number;
  /** Sum of amount_at_flag for credited saves, in `currency`. */
  creditedValue: number;
  currency: string;
  /** Recovered but the rep said "I had it" — declined credit, shown proudly. */
  declinedSaves: number;
  /**
   * The honesty metric: declined / (credited + declined). Higher is more
   * trustworthy, not worse. Null when no recovered episodes are confirmed yet.
   */
  noCreditRate: number | null;
  /** Open episodes + recovered-unconfirmed awaiting the counterfactual ask. */
  pendingSaves: number;
  /** Total episodes ever opened in scope. */
  totalEpisodes: number;
}

const EMPTY: DealSaveLedger = {
  creditedSaves: 0,
  creditedValue: 0,
  currency: 'USD',
  declinedSaves: 0,
  noCreditRate: null,
  pendingSaves: 0,
  totalEpisodes: 0,
};

export interface SaveRow {
  outcome: string;
  counterfactual: string | null;
  amount_at_flag: number | null;
  currency: string | null;
}

/**
 * The crediting rule, pure and in one place (so it's tunable + testable with
 * no database). Credited pipeline = recovered AND rep said "would have missed".
 * Declined credit ("would have caught") is counted separately and drives the
 * honesty rate. Everything else — still_open, recovered-unconfirmed, 'unsure' —
 * is pending.
 */
export function tallyDealSaves(rows: SaveRow[]): DealSaveLedger {
  if (rows.length === 0) return { ...EMPTY };

  const ledger: DealSaveLedger = { ...EMPTY };
  ledger.totalEpisodes = rows.length;
  // Ledger currency = the modal currency of credited rows; defaults to USD.
  // (Mixed-currency workspaces should convert upstream; we don't guess rates.)
  const currencyTally = new Map<string, number>();

  for (const r of rows) {
    const recovered = r.outcome === 'recovered';
    if (recovered && r.counterfactual === 'would_have_missed') {
      ledger.creditedSaves += 1;
      ledger.creditedValue += r.amount_at_flag ?? 0;
      const c = r.currency ?? 'USD';
      currencyTally.set(c, (currencyTally.get(c) ?? 0) + 1);
    } else if (recovered && r.counterfactual === 'would_have_caught') {
      ledger.declinedSaves += 1;
    } else {
      // still_open, or recovered-but-unconfirmed / 'unsure'.
      ledger.pendingSaves += 1;
    }
  }

  const confirmed = ledger.creditedSaves + ledger.declinedSaves;
  ledger.noCreditRate = confirmed > 0 ? ledger.declinedSaves / confirmed : null;

  if (currencyTally.size > 0) {
    ledger.currency = [...currencyTally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return ledger;
}

export async function getDealSaveLedger(tenantId: string): Promise<DealSaveLedger> {
  try {
    // Company-scope: this workspace PLUS every sibling at the same company.
    const companyTenantIds = await getCompanyTenantIds(tenantId);

    const { data, error } = await supabaseAdmin
      .from('deal_saves')
      .select('outcome, counterfactual, amount_at_flag, currency')
      .in('tenant_id', companyTenantIds);

    if (error || !data) return { ...EMPTY };
    return tallyDealSaves(data as SaveRow[]);
  } catch {
    return { ...EMPTY };
  }
}
