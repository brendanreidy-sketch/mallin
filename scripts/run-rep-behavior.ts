/**
 * ============================================================================
 *  Coaching Engine Runner — run Pass 2c on a REAL deal and save the result
 * ============================================================================
 *
 *  The coaching engine (rep-behavior extraction) already exists but has been
 *  DARK: it only ran from a hand-made substrate JSON and wrote to a file.
 *  This runner points it at a real deal in the DB, then persists the output
 *  to `rep_behavior_artifacts` so coaching signal accumulates for review.
 *
 *  It is deliberately NOT wired into the live pipeline — invoke it by hand on
 *  a handful of deals so we can judge whether the coaching is good before the
 *  engine is turned on automatically or surfaced to a manager/AE.
 *
 *  Use:
 *    set -a && source .env.local && set +a
 *    npx tsx scripts/run-rep-behavior.ts <tenant_id> <opportunity_id> [--no-persist]
 *
 *  --no-persist  Print the coaching output but do NOT write it to the DB.
 * ============================================================================
 */

import { assembleCoreIntelligenceInput } from '../orchestration/pass-1.5/input-assembler';
import { ProductionRepBehaviorAgent } from '../lib/agents/rep-behavior-agent';
import {
  validateRepBehaviorOutput,
  type RepBehaviorAgentInput,
} from '../lib/contracts/rep-behavior-contract';
import { persistRepBehaviorArtifact } from '../lib/coaching/persist-rep-behavior';

const HR = '━'.repeat(63);
const SUB = '─'.repeat(63);
const header = (t: string) => console.log(`${HR}\n  ${t}\n${HR}`);
const section = (t: string) => console.log(`\n${SUB}\n  ${t}\n${SUB}`);

const args = process.argv.slice(2);
const persist = !args.includes('--no-persist');
const [tenantId, opportunityId] = args.filter((a) => !a.startsWith('--'));

if (!tenantId || !opportunityId) {
  console.error(
    'Usage: npx tsx scripts/run-rep-behavior.ts <tenant_id> <opportunity_id> [--no-persist]'
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    '✗ ANTHROPIC_API_KEY is not set. Source .env.local first: set -a && source .env.local && set +a'
  );
  process.exit(1);
}

async function main(): Promise<void> {
  header(`Coaching engine — deal ${opportunityId}`);

  section('Assemble substrate from DB');
  const { input: substrate } = await assembleCoreIntelligenceInput({
    tenant_id: tenantId,
    opportunity_id: opportunityId,
  });
  console.log(`  calls:                 ${substrate.calls.length}`);
  console.log(`  emails:                ${substrate.emails.length}`);
  console.log(`  internal_participants: ${substrate.internal_participants.length}`);

  const input: RepBehaviorAgentInput = {
    substrate: {
      calls: substrate.calls as unknown as RepBehaviorAgentInput['substrate']['calls'],
      emails: substrate.emails as unknown as RepBehaviorAgentInput['substrate']['emails'],
      internal_participants:
        substrate.internal_participants as unknown as RepBehaviorAgentInput['substrate']['internal_participants'],
    },
  };

  section('Run coaching engine (Pass 2c)');
  const agent = new ProductionRepBehaviorAgent();
  const t0 = Date.now();
  const output = await agent.extract({ input });
  console.log(`✓ Returned in ${Date.now() - t0}ms`);
  console.log(`  signals:             ${output.signals.length}`);
  console.log(`  next_coaching_focus: ${output.next_coaching_focus.length}`);

  const validation = validateRepBehaviorOutput(output);
  if (!validation.ok) {
    console.error(`✗ Layer A FAIL — ${validation.errors.length} errors:`);
    for (const e of validation.errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('✓ Layer A PASS');

  if (output.signals.length > 0) {
    section('What the rep did well / missed');
    for (const s of output.signals) {
      const tag = s.valence === 'strength' ? '✓ did well ' : '⚠ missed   ';
      console.log(`  ${tag} [${s.behavior_stage.padEnd(10)}] ${s.behavior_name}`);
    }
  }
  if (output.next_coaching_focus.length > 0) {
    section('Coaching focus for the next call');
    for (const f of output.next_coaching_focus) {
      console.log(`  • ${f.focus}`);
      console.log(`    why: ${f.rationale}`);
    }
  }

  section(persist ? 'Save to rep_behavior_artifacts' : 'Persist skipped (--no-persist)');
  if (persist) {
    await persistRepBehaviorArtifact({ tenantId, opportunityId, output });
    console.log('✓ Saved as current coaching artifact for this deal');
  } else {
    console.log('  (dry run — nothing written)');
  }

  console.log('');
  header('Done');
}

main().catch((err) => {
  console.error('\n✗ Unexpected error:', err);
  process.exit(1);
});
