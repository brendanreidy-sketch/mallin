/**
 * ============================================================================
 *  Pass 4 Manual Runner
 * ============================================================================
 *
 *  Loads a merged ExecutionAgentInput from disk, invokes the Execution
 *  agent, validates against Layer A, saves the resulting PrepArtifact
 *  beside the input file.
 *
 *  Usage:
 *    npx tsx --env-file=.env.local scripts/run-pass-4-manual.ts <input-path>
 *      Stub agent (default — canned fixture, no API call)
 *
 *    npx tsx --env-file=.env.local scripts/run-pass-4-manual.ts <input-path> --production
 *      Production agent (real LLM call)
 *
 *  Output saved as: <input-path-without-.json>.pass4-output.json
 *
 *  CONVENTION DEVIATION FROM PASS 2:
 *    Pass 2 defaults to production with --stub opt-in.
 *    Pass 4 defaults to stub with --production opt-in.
 *    Reason: stub-by-default keeps runner-development cycles isolated
 *    from model behavior. Flip the default once the runner is proven.
 *
 *  LAYER B:
 *    Not implemented. Plugs in below the Layer A section once
 *    execution-agent-integrity.ts ships.
 * ============================================================================
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { validateExecutionOutput } from "../lib/contracts/execution-agent-validator";
import { validateExecutionIntegrity } from "../lib/contracts/execution-agent-integrity";
import { ProductionExecutionAgent } from "../lib/agents/execution-agent";
import { StubExecutionAgent } from "../lib/agents/execution-agent.stub";
import type {
  ExecutionAgent,
  ExecutionAgentRequest,
  PrepArtifact,
} from "../lib/contracts/execution-agent-output";
import type { ExecutionAgentInput } from "../lib/contracts/execution-agent-input";

// ────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ────────────────────────────────────────────────────────────────────────────

const allArgs = process.argv.slice(2);
const flagSet = new Set(allArgs.filter((a) => a.startsWith("--")));
const positional = allArgs.filter((a) => !a.startsWith("--"));

const inputPath = positional[0];
const useProduction = flagSet.has("--production");
const useStub = !useProduction;

if (!inputPath) {
  console.error(
    "Usage: npx tsx --env-file=.env.local scripts/run-pass-4-manual.ts <input-path> [--production]"
  );
  process.exit(1);
}

const HR = "━".repeat(63);
const SUB = "─".repeat(63);

function header(title: string): void {
  console.log(HR);
  console.log(`  ${title}`);
  console.log(HR);
}

function section(title: string): void {
  console.log(`\n${SUB}\n  ${title}\n${SUB}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = useStub ? "(STUB MODE)" : "(LIVE LLM)";
  const inputName = basename(inputPath).replace(/\.json$/, "");
  header(`Pass 4 Manual Runner — ${inputName} ${mode}`);
  console.log(`Input path:      ${inputPath}`);
  console.log(`Agent:           ${useStub ? "StubExecutionAgent" : "ProductionExecutionAgent"}`);

  if (!useStub && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\n✗ ANTHROPIC_API_KEY is not set. Run with --env-file=.env.local " +
        "or export the key. Omit --production to use the stub agent."
    );
    process.exit(1);
  }

  // ─── Load input ──────────────────────────────────────────────────────────
  section("Load ExecutionAgentInput from disk");
  const t0 = Date.now();
  let enrichedInput: ExecutionAgentInput;
  try {
    const raw = readFileSync(resolve(inputPath), "utf-8");
    enrichedInput = JSON.parse(raw) as ExecutionAgentInput;
  } catch (err) {
    console.error(`\n✗ Failed to load input from ${inputPath}: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`✓ Loaded in ${Date.now() - t0}ms`);
  console.log(`  opportunity_id:  ${enrichedInput.opportunity?.id ?? "(missing)"}`);
  console.log(`  stakeholders:    ${enrichedInput.stakeholders?.length ?? 0}`);
  console.log(`  activities:      ${enrichedInput.activities?.length ?? 0}`);

  // ─── Pass 4: invoke agent ────────────────────────────────────────────────
  section("Pass 4: invoke Execution agent");

  const agent: ExecutionAgent = useStub
    ? new StubExecutionAgent()
    : new ProductionExecutionAgent();

  const request: ExecutionAgentRequest = {
    enriched_input: enrichedInput,
    config: {},
  };

  const t1 = Date.now();
  let artifact: PrepArtifact;
  try {
    artifact = await agent.execute(request);
  } catch (err) {
    console.error(`\n✗ Agent invocation failed: ${(err as Error).message}`);
    process.exit(1);
  }
  const agentMs = Date.now() - t1;
  console.log(`✓ Agent returned in ${agentMs}ms`);
  console.log(`  posture:                     ${artifact.top_line.posture}`);
  console.log(`  critical_risks:              ${artifact.critical_risks.length}`);
  console.log(`  stakeholder_strategy:        ${artifact.stakeholder_strategy.length}`);
  console.log(`  talk_track.key_questions:    ${artifact.talk_track.key_questions.length}`);
  console.log(`  open_questions:              ${artifact.open_questions.length}`);
  console.log(`  coaching_notes:              ${artifact.coaching_notes.length}`);
  console.log(`  attempts:                    ${artifact.metadata.attempts ?? "(missing)"}`);
  console.log(`  latency_ms:                  ${artifact.metadata.latency_ms ?? "(missing)"}`);

  // ─── Layer A: structural validation ──────────────────────────────────────
  section("Layer A: validateExecutionOutput");
  const layerA = validateExecutionOutput(artifact);
  if (!layerA.ok) {
    console.error(`✗ Layer A FAIL — ${layerA.errors.length} structural errors:`);
    for (const e of layerA.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (layerA.errors.length > 20) {
      console.error(`  ... and ${layerA.errors.length - 20} more`);
    }
    process.exit(1);
  }
  console.log(`✓ Layer A PASS — structural validation succeeded`);

  // ─── Save output ─────────────────────────────────────────────────────────
  section("Save output");
  const outputPath = inputPath.replace(/\.json$/, "") + ".pass4-output.json";
  writeFileSync(resolve(outputPath), JSON.stringify(artifact, null, 2));
  console.log(`✓ Wrote ${outputPath}`);

  // ─── Layer B: integrity validation ───────────────────────────────────────
  // Runs AFTER save so a failing artifact stays on disk for inspection.
  section("Layer B: validateExecutionIntegrity");
  const layerB = validateExecutionIntegrity(artifact, enrichedInput);
  if (!layerB.valid) {
    console.error(`✗ Layer B FAIL — ${layerB.errors.length} integrity errors:`);
    for (const e of layerB.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (layerB.errors.length > 20) {
      console.error(`  ... and ${layerB.errors.length - 20} more`);
    }
    console.error(`  (artifact saved to ${outputPath} for inspection)`);
    process.exit(1);
  }
  console.log(`✓ Layer B PASS — all evidence/posture/stakeholder/conflict linkage resolves`);
  console.log(`  Exercised:`);
  console.log(`    Check 1 (evidence resolution):    ${layerB.exercised.check_1_evidence_resolution ? "yes" : "no"}`);
  console.log(`    Check 2 (posture equality):       ${layerB.exercised.check_2_posture_equality ? "yes" : "no"}`);
  console.log(`    Check 3 (stakeholder mirror):     ${layerB.exercised.check_3_stakeholder_mirror ? "yes" : "no"}`);
  console.log(`    Check 4 (source conflict):        ${layerB.exercised.check_4_source_conflict ? "yes" : "no (dormant — no Pass 2 conflicts to verify against)"}`);
  console.log(`    Check 5 (meeting linkage):        ${layerB.exercised.check_5_meeting_linkage ? "yes" : "no (reserved)"}`);

  // ─── Done ────────────────────────────────────────────────────────────────
  console.log("");
  header("Pass 4 output is contract-valid");
}

main().catch((err) => {
  console.error("\n✗ Unexpected error:", err);
  process.exit(1);
});
