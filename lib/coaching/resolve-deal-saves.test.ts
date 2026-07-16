import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifySaveResolution } from './resolve-deal-saves';
import { confirmDealSaveCounterfactual } from './persist-deal-save';

describe('classifySaveResolution', () => {
  it('lost/no_decision close as a loss regardless of at-risk state', () => {
    expect(classifySaveResolution({ dealOutcome: 'lost', stillAtRisk: true })).toBe('lost');
    expect(classifySaveResolution({ dealOutcome: 'lost', stillAtRisk: false })).toBe('lost');
    expect(classifySaveResolution({ dealOutcome: 'no_decision', stillAtRisk: false })).toBe('lost');
  });

  it('a won deal is a recovery even if a stale flag lingers', () => {
    expect(classifySaveResolution({ dealOutcome: 'won', stillAtRisk: true })).toBe('recovered');
  });

  it('an open deal recovers once the at-risk signature clears', () => {
    expect(classifySaveResolution({ dealOutcome: null, stillAtRisk: false })).toBe('recovered');
    expect(classifySaveResolution({ dealOutcome: undefined, stillAtRisk: false })).toBe('recovered');
  });

  it('an open deal that is still at-risk stays open', () => {
    expect(classifySaveResolution({ dealOutcome: null, stillAtRisk: true })).toBe('still_open');
  });
});

// Minimal stub of the supabase update→eq→eq→eq→is→select chain.
function makeConfirmStub(rows: { id: string }[]) {
  const calls: { patch?: Record<string, unknown>; eqs: Array<[string, unknown]>; is?: [string, unknown] } = {
    eqs: [],
  };
  const chain = {
    eq(col: string, val: unknown) {
      calls.eqs.push([col, val]);
      return chain;
    },
    is(col: string, val: unknown) {
      calls.is = [col, val];
      return chain;
    },
    select() {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const client = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          calls.patch = patch;
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe('confirmDealSaveCounterfactual', () => {
  it('sets the counterfactual + confirmer, scoped to id/tenant/recovered/unconfirmed', async () => {
    const { client, calls } = makeConfirmStub([{ id: 'save-1' }]);
    await confirmDealSaveCounterfactual({
      tenantId: 'tenant-1',
      saveId: 'save-1',
      counterfactual: 'would_have_missed',
      confirmedByUserId: 'user-1',
      client,
    });
    expect(calls.patch?.counterfactual).toBe('would_have_missed');
    expect(calls.patch?.confirmed_by_user_id).toBe('user-1');
    expect(calls.eqs).toContainEqual(['id', 'save-1']);
    expect(calls.eqs).toContainEqual(['tenant_id', 'tenant-1']);
    expect(calls.eqs).toContainEqual(['outcome', 'recovered']);
    expect(calls.is).toEqual(['counterfactual', null]);
  });

  it('does not clobber notes when none are provided', async () => {
    const { client, calls } = makeConfirmStub([{ id: 'save-1' }]);
    await confirmDealSaveCounterfactual({
      tenantId: 'tenant-1',
      saveId: 'save-1',
      counterfactual: 'would_have_caught',
      confirmedByUserId: 'user-1',
      client,
    });
    expect('notes' in (calls.patch ?? {})).toBe(false);
  });

  it('throws when no unconfirmed recovered episode matches (double-tap)', async () => {
    const { client } = makeConfirmStub([]);
    await expect(
      confirmDealSaveCounterfactual({
        tenantId: 'tenant-1',
        saveId: 'save-1',
        counterfactual: 'unsure',
        confirmedByUserId: 'user-1',
        client,
      })
    ).rejects.toThrow(/no unconfirmed recovered episode/);
  });
});
