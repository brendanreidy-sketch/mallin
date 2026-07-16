import { describe, it, expect } from 'vitest';
import { tallyDealSaves, type SaveRow } from './deal-save-ledger';

function row(overrides: Partial<SaveRow> = {}): SaveRow {
  return {
    outcome: 'recovered',
    counterfactual: 'would_have_missed',
    amount_at_flag: 10_000,
    currency: 'USD',
    ...overrides,
  };
}

describe('tallyDealSaves — crediting math', () => {
  it('returns a zeroed ledger for no rows', () => {
    const l = tallyDealSaves([]);
    expect(l.creditedSaves).toBe(0);
    expect(l.creditedValue).toBe(0);
    expect(l.noCreditRate).toBeNull();
    expect(l.totalEpisodes).toBe(0);
  });

  it('credits only recovered + would_have_missed', () => {
    const l = tallyDealSaves([
      row({ amount_at_flag: 10_000 }),
      row({ amount_at_flag: 25_000 }),
    ]);
    expect(l.creditedSaves).toBe(2);
    expect(l.creditedValue).toBe(35_000);
  });

  it('does NOT credit a recovered deal the rep says they had (would_have_caught)', () => {
    const l = tallyDealSaves([
      row({ counterfactual: 'would_have_caught', amount_at_flag: 50_000 }),
    ]);
    expect(l.creditedSaves).toBe(0);
    expect(l.creditedValue).toBe(0);
    expect(l.declinedSaves).toBe(1);
  });

  it('treats still_open and recovered-unconfirmed as pending, never credited', () => {
    const l = tallyDealSaves([
      row({ outcome: 'still_open', counterfactual: null }),
      row({ outcome: 'recovered', counterfactual: null }),
      row({ outcome: 'recovered', counterfactual: 'unsure' }),
    ]);
    expect(l.creditedSaves).toBe(0);
    expect(l.pendingSaves).toBe(3);
  });

  it('never credits a lost deal', () => {
    const l = tallyDealSaves([
      row({ outcome: 'lost', counterfactual: null, amount_at_flag: 99_000 }),
    ]);
    expect(l.creditedSaves).toBe(0);
    expect(l.creditedValue).toBe(0);
    expect(l.pendingSaves).toBe(1);
  });

  it('computes the no-credit (honesty) rate over confirmed episodes only', () => {
    // 3 credited + 1 declined = 4 confirmed; 1 still_open is excluded.
    const l = tallyDealSaves([
      row(),
      row(),
      row(),
      row({ counterfactual: 'would_have_caught' }),
      row({ outcome: 'still_open', counterfactual: null }),
    ]);
    expect(l.creditedSaves).toBe(3);
    expect(l.declinedSaves).toBe(1);
    expect(l.noCreditRate).toBeCloseTo(0.25);
  });

  it('missing amount_at_flag counts the save but adds no value', () => {
    const l = tallyDealSaves([row({ amount_at_flag: null })]);
    expect(l.creditedSaves).toBe(1);
    expect(l.creditedValue).toBe(0);
  });

  it('reports the modal currency of credited rows', () => {
    const l = tallyDealSaves([
      row({ currency: 'EUR' }),
      row({ currency: 'EUR' }),
      row({ currency: 'USD' }),
    ]);
    expect(l.currency).toBe('EUR');
  });
});
