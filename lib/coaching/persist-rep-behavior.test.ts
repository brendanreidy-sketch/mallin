import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistRepBehaviorArtifact } from './persist-rep-behavior';
import type { RepBehaviorAgentOutput } from '@/lib/contracts/rep-behavior-contract';

function makeOutput(
  overrides: Partial<RepBehaviorAgentOutput> = {}
): RepBehaviorAgentOutput {
  return {
    signals: [],
    next_coaching_focus: [],
    metadata: {
      generated_at: '2026-07-15T00:00:00.000Z',
      model: 'claude-sonnet-4-6',
      prompt_version: 'v0.2.0',
      rep_ids_analyzed: ['rep-1'],
    },
    ...overrides,
  };
}

interface Recorded {
  table: string | null;
  updates: Record<string, unknown>[];
  eqs: Array<[string, unknown]>;
  inserts: Record<string, unknown>[];
}

function makeStubClient(insertError: { message: string } | null = null) {
  const rec: Recorded = { table: null, updates: [], eqs: [], inserts: [] };
  const eqChain = {
    eq(col: string, val: unknown) {
      rec.eqs.push([col, val]);
      return eqChain;
    },
    then(resolve: (v: { error: null }) => unknown) {
      return resolve({ error: null });
    },
  };
  const client = {
    from(table: string) {
      rec.table = table;
      return {
        update(patch: Record<string, unknown>) {
          rec.updates.push(patch);
          return eqChain;
        },
        insert(row: Record<string, unknown>) {
          rec.inserts.push(row);
          return Promise.resolve({ error: insertError });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rec };
}

describe('persistRepBehaviorArtifact', () => {
  it('writes to the rep_behavior_artifacts table', async () => {
    const { client, rec } = makeStubClient();
    await persistRepBehaviorArtifact({
      tenantId: 't-1',
      opportunityId: 'opp-1',
      output: makeOutput(),
      client,
    });
    expect(rec.table).toBe('rep_behavior_artifacts');
  });

  it('demotes the prior current artifact before inserting', async () => {
    const { client, rec } = makeStubClient();
    await persistRepBehaviorArtifact({
      tenantId: 't-1',
      opportunityId: 'opp-1',
      output: makeOutput(),
      client,
    });
    expect(rec.updates).toEqual([{ is_current: false }]);
    expect(rec.eqs).toContainEqual(['opportunity_id', 'opp-1']);
    expect(rec.eqs).toContainEqual(['is_current', true]);
  });

  it('inserts the output as the new current artifact', async () => {
    const { client, rec } = makeStubClient();
    const output = makeOutput();
    await persistRepBehaviorArtifact({
      tenantId: 't-1',
      opportunityId: 'opp-1',
      output,
      client,
    });
    expect(rec.inserts).toHaveLength(1);
    expect(rec.inserts[0]).toMatchObject({
      tenant_id: 't-1',
      opportunity_id: 'opp-1',
      prompt_version: 'v0.2.0',
      model: 'claude-sonnet-4-6',
      generated_at: '2026-07-15T00:00:00.000Z',
      is_current: true,
    });
    expect(rec.inserts[0].artifact).toEqual(output);
  });

  it('throws when the insert fails', async () => {
    const { client } = makeStubClient({ message: 'duplicate key' });
    await expect(
      persistRepBehaviorArtifact({
        tenantId: 't-1',
        opportunityId: 'opp-1',
        output: makeOutput(),
        client,
      })
    ).rejects.toThrow(/insert failed for opportunity opp-1: duplicate key/);
  });

  it('falls back to now() for generated_at when metadata omits it', async () => {
    const { client, rec } = makeStubClient();
    const output = makeOutput();
    (output.metadata as { generated_at?: string }).generated_at = undefined;
    await persistRepBehaviorArtifact({
      tenantId: 't-1',
      opportunityId: 'opp-1',
      output,
      client,
    });
    expect(rec.inserts[0].generated_at).toEqual(expect.any(String));
  });
});
