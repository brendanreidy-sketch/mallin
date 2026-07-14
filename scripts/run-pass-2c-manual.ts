/**
 * ============================================================================
 *  Pass 2c Manual Runner — Rep Behavior extraction
 * ============================================================================
 *
 *  Loads a substrate JSON (the same shape as Pass 2 input — calls, emails,
 *  internal_participants, optionally intelligence). Runs the Rep Behavior
 *  agent. Validates Layer A. Writes output beside input.
 *
 *  Use:
 *    set -a && source .env.local && set +a
 *    npx tsx scripts/run-pass-2c-manual.ts <substrate.json> [<rep_id>...]
 *
 *  If rep_ids are passed, extraction is restricted to those reps.
 *  Otherwise all internal_participants are analyzed.
 *
 *  Output saved as: <substrate-without-.json>.pass2c-output.json
 * ============================================================================
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProductionRepBehaviorAgent } from '../lib/agents/rep-behavior-agent';
import { validateRepBehaviorOutput } from '../lib/contracts/rep-behavior-contract';
import type { RepBehaviorAgentInput } from '../lib/contracts/rep-behavior-contract';

const HR = '━'.repeat(63);
const SUB = '─'.repeat(63);

function header(t: string): void {
  console.log(HR);
  console.log(`  ${t}`);
  console.log(HR);
}
function section(t: string): void {
  console.log(`\n${SUB}\n  ${t}\n${SUB}`);
}

const args = process.argv.slice(2);
const [substratePath, ...repIds] = args;
if (!substratePath) {
  console.error(
    'Usage: npx tsx scripts/run-pass-2c-manual.ts <substrate.json> [<rep_id>...]'
  );
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    '✗ ANTHROPIC_API_KEY is not set. Source .env.local first: set -a && source .env.local && set +a'
  );
  process.exit(1);
}

interface SubstrateLike {
  calls?: Array<{ id: string; [k: string]: unknown }>;
  emails?: Array<{ id: string; [k: string]: unknown }>;
  internal_participants?: Array<{ id: string; [k: string]: unknown }>;
  intelligence?: Array<{ id: string; [k: string]: unknown }>;
}

async function main(): Promise<void> {
  header(`Pass 2c Manual Runner — ${substratePath}`);

  section('Load substrate');
  const raw = readFileSync(resolve(substratePath), 'utf-8');
  const substrate = JSON.parse(raw) as SubstrateLike;
  const internal = substrate.internal_participants ?? [];
  console.log(`  calls:                 ${substrate.calls?.length ?? 0}`);
  console.log(`  emails:                ${substrate.emails?.length ?? 0}`);
  console.log(`  internal_participants: ${internal.length}`);
  console.log(`  intelligence:          ${substrate.intelligence?.length ?? 0}`);
  if (repIds.length > 0) {
    console.log(`  rep_ids_to_analyze:    ${repIds.join(', ')}`);
  }

  const input: RepBehaviorAgentInput = {
    substrate: {
      calls: substrate.calls ?? [],
      emails: substrate.emails ?? [],
      internal_participants: internal,
      intelligence: substrate.intelligence ?? [],
    },
    rep_ids_to_analyze: repIds.length > 0 ? repIds : undefined,
  };

  section('Pass 2c: invoke Rep Behavior agent');
  const agent = new ProductionRepBehaviorAgent();
  const t0 = Date.now();
  let output;
  try {
    output = await agent.extract({ input });
  } catch (err) {
    console.error(`\n✗ Agent invocation failed: ${(err as Error).message}`);
    process.exit(1);
  }
  const elapsed = Date.now() - t0;
  console.log(`✓ Returned in ${elapsed}ms`);
  console.log(`  signals:                ${output.signals.length}`);
  console.log(`  next_coaching_focus:    ${output.next_coaching_focus.length}`);
  console.log(`  insufficiently_evidenced: ${output.metadata.insufficiently_evidenced?.length ?? 0}`);
  console.log(`  quality_warnings:       ${output.metadata.quality_warnings?.length ?? 0}`);
  console.log(`  attempts:               ${output.metadata.attempts ?? '?'}`);

  section('Layer A: validateRepBehaviorOutput');
  const validation = validateRepBehaviorOutput(output);
  if (!validation.ok) {
    console.error(`✗ Layer A FAIL — ${validation.errors.length} errors:`);
    for (const e of validation.errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ Layer A PASS`);

  // ── Brief signal preview ────────────────────────────────────────────────
  if (output.signals.length > 0) {
    section('Signal preview (first 5)');
    for (const s of output.signals.slice(0, 5)) {
      const tag = s.valence === 'strength' ? '✓' : '⚠';
      console.log(
        `  ${tag} [${s.behavior_stage.padEnd(10)}] [${s.category.padEnd(20)}] ${s.behavior_name}`
      );
      console.log(`     rep_id: ${s.rep_id}  strength: ${s.strength}  evidence: ${s.evidence_ids.length}`);
    }
    if (output.signals.length > 5) {
      console.log(`  … and ${output.signals.length - 5} more`);
    }
  }
  if (output.next_coaching_focus.length > 0) {
    section('Coaching focus');
    for (const f of output.next_coaching_focus) {
      console.log(`  • ${f.focus}`);
      console.log(`    rationale: ${f.rationale}`);
      console.log(`    attached: ${f.attached_signal_ids.join(', ')}`);
    }
  }
  if ((output.metadata.quality_warnings?.length ?? 0) > 0) {
    section('Quality warnings (Layer C — non-blocking)');
    for (const w of output.metadata.quality_warnings ?? []) {
      console.log(`  [${w.code}]${w.signal_id ? ` (${w.signal_id})` : ''}: ${w.message}`);
    }
  }

  section('Save output');
  const outputPath = substratePath.replace(/\.json$/, '') + '.pass2c-output.json';
  writeFileSync(resolve(outputPath), JSON.stringify(output, null, 2));
  console.log(`✓ Wrote ${outputPath}`);

  console.log('');
  header('Pass 2c output is contract-valid');
}

main().catch((err) => {
  console.error('\n✗ Unexpected error:', err);
  process.exit(1);
});
