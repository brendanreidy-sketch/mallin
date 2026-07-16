/**
 * ============================================================================
 *  Persist Rep Behavior Artifact — coaching engine storage (DARK)
 * ============================================================================
 *
 *  Writes a RepBehaviorAgentOutput (Pass 2c — the coaching engine's per-deal
 *  output) to the `rep_behavior_artifacts` table using the same
 *  demote-current-then-insert pattern execution_artifacts uses
 *  (see create-deal-from-transcript.ts).
 *
 *  STATUS — DARK: nothing in the live intake pipeline calls this. It exists
 *  so the coaching engine's output can accumulate on a handful of REAL deals
 *  for quality review, per the rep-behavior contract's doctrine:
 *  "Do not design [the coaching layers] until layer 1 is producing real
 *  signal on at least 3-5 deals." This is how layer 1 starts producing.
 *
 *  Invoked today only by scripts/run-rep-behavior.ts. When the engine is
 *  later wired into rebuildBrief (behind a per-tenant gate), that path will
 *  call this same function.
 * ============================================================================
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/db/client';
import type { RepBehaviorAgentOutput } from '@/lib/contracts/rep-behavior-contract';

const TABLE = 'rep_behavior_artifacts';

export interface PersistRepBehaviorParams {
  tenantId: string;
  opportunityId: string;
  output: RepBehaviorAgentOutput;
  /** Injectable for tests. Defaults to the service-role admin client. */
  client?: SupabaseClient;
}

/**
 * Demote the prior current artifact for the opportunity, then insert the new
 * output as current. Throws on insert failure so callers/runners surface it.
 */
export async function persistRepBehaviorArtifact(
  params: PersistRepBehaviorParams
): Promise<void> {
  const { tenantId, opportunityId, output } = params;
  const client = params.client ?? supabaseAdmin;

  await client
    .from(TABLE)
    .update({ is_current: false })
    .eq('opportunity_id', opportunityId)
    .eq('is_current', true);

  const { error } = await client.from(TABLE).insert({
    tenant_id: tenantId,
    opportunity_id: opportunityId,
    artifact: output as unknown as Record<string, unknown>,
    prompt_version: output.metadata.prompt_version ?? null,
    model: output.metadata.model ?? null,
    generated_at: output.metadata.generated_at ?? new Date().toISOString(),
    is_current: true,
  });

  if (error) {
    throw new Error(
      `persistRepBehaviorArtifact: insert failed for opportunity ${opportunityId}: ${error.message}`
    );
  }
}
