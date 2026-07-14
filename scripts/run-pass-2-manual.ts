/**
 * ============================================================================
 *  Pass 2 Manual Runner
 * ============================================================================
 *
 *  Exercises the full Pass 1.5 → Pass 2 → Layer A → Layer B chain against
 *  the Acme/Beneba opportunity.
 *
 *  Usage:
 *    npx tsx --env-file=.env.local scripts/run-pass-2-manual.ts
 *      Production agent (real LLM call)
 *
 *    npx tsx --env-file=.env.local scripts/run-pass-2-manual.ts --stub
 *      Stub agent (canned fixture, no API call)
 *
 *    npx tsx --env-file=.env.local scripts/run-pass-2-manual.ts --save-fixture
 *      Production agent + write raw enrichments to scripts/_fixtures/
 *      acme-beneba-pass2-output.json for diffing against the golden fixture
 *
 * ============================================================================
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assembleCoreIntelligenceInput } from "../orchestration/pass-1.5/input-assembler";
import { buildBantFixture } from "./_fixtures/build-bant-fixture";
import {
  validateEnrichments,
} from "../lib/contracts/core-intelligence-contract";
import { validateStructure } from "../lib/contracts/core-intelligence-validator";
import { ProductionCoreIntelligenceAgent } from "../lib/agents/core-intelligence-agent";
import { StubCoreIntelligenceAgent } from "../lib/agents/core-intelligence-agent.stub";
import type {
  CoreIntelligenceAgent,
  CoreIntelligenceAgentRequest,
} from "../lib/contracts/core-intelligence-contract";

// ────────────────────────────────────────────────────────────────────────────
// Test target — same Acme/Beneba opportunity as Pass 1.5 manual test
// ────────────────────────────────────────────────────────────────────────────

const TENANT_ID = "af6a6787-f7f1-4db0-ade2-eeccc5ec9790";
const OPPORTUNITY_ID = "6d072dbd-cc3d-444a-a574-520eefb15296";

// ────────────────────────────────────────────────────────────────────────────
// CLI parsing
// ────────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const useStub = args.has("--stub");
const useBant = args.has("--bant");
const saveFixture = args.has("--save-fixture");

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
  const mode = useStub
    ? "(STUB MODE)"
    : useBant
    ? "(LIVE LLM, BANT methodology)"
    : "(LIVE LLM)";
  header(`Pass 2 Manual Runner — Acme/Beneba ${mode}`);
  console.log(`Tenant ID:       ${TENANT_ID}`);
  console.log(`Opportunity ID:  ${OPPORTUNITY_ID}`);
  console.log(`Save fixture:    ${saveFixture ? "yes" : "no"}`);

  if (!useStub && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\n✗ ANTHROPIC_API_KEY is not set. Run with --env-file=.env.local " +
        "or export the key. Use --stub to skip the LLM call entirely."
    );
    process.exit(1);
  }

  // ─── Pass 1.5: assemble substrate ────────────────────────────────────────
  section(
    useBant
      ? "Pass 1.5 + BANT methodology swap (in-code fixture)"
      : "Pass 1.5: assemble pre-enrichment input"
  );
  const t0 = Date.now();
  const assembly = useBant
    ? await buildBantFixture()
    : await assembleCoreIntelligenceInput({
        tenant_id: TENANT_ID,
        opportunity_id: OPPORTUNITY_ID,
      });
  const assemblyMs = Date.now() - t0;
  console.log(`✓ Assembled in ${assemblyMs}ms`);
  console.log(`  stakeholders:   ${assembly.input.stakeholders.length}`);
  console.log(`  activities:     ${assembly.input.activities.length}`);
  console.log(
    `  pillars:        ${assembly.input.opportunity.methodology.pillars.length}`
  );

  // ─── Pass 2: build envelope and invoke agent ─────────────────────────────
  section("Pass 2: invoke Core Intelligence agent");

  const agent: CoreIntelligenceAgent = useStub
    ? new StubCoreIntelligenceAgent()
    : new ProductionCoreIntelligenceAgent();

  const request: CoreIntelligenceAgentRequest = {
    pre_enrichment_input: assembly.input as never, // see STRUCTURAL WARNING in agent file
    config: {
      model: "claude-sonnet-4-6",
      min_confidence: "low",
      include_full_transcripts: false,
      max_intelligence_items: 25,
    },
  };

  const t1 = Date.now();
  let enrichments;
  try {
    enrichments = await agent.enrich(request);
  } catch (err) {
    console.error(`\n✗ Agent invocation failed: ${(err as Error).message}`);
    process.exit(1);
  }
  const agentMs = Date.now() - t1;
  console.log(`✓ Agent returned in ${agentMs}ms`);
  console.log(`  intelligence records:        ${enrichments.intelligence.length}`);
  console.log(
    `  pillar evidence entries:     ${enrichments.methodology_pillar_evidence.length}`
  );
  console.log(
    `  stakeholder enrichments:     ${enrichments.stakeholder_enrichments.length}`
  );
  console.log(`  conflicts:                   ${enrichments.conflicts.length}`);
  console.log(
    `  overall confidence:          ${enrichments.diagnostics?.overall_confidence ?? "(missing)"}`
  );

  // ─── Save fixture if requested ───────────────────────────────────────────
  if (saveFixture) {
    section("Saving raw enrichments");
    const outPath = resolve(
      process.cwd(),
      useBant
        ? "scripts/_fixtures/acme-beneba-bant-pass2-output.json"
        : "scripts/_fixtures/acme-beneba-pass2-output.json"
    );
    writeFileSync(outPath, JSON.stringify(enrichments, null, 2));
    console.log(`✓ Wrote ${outPath}`);
  }

  // ─── Layer A: structural validation ──────────────────────────────────────
  section("Layer A: validateStructure");
  const layerA = validateStructure(enrichments);
  if (!layerA.ok) {
    console.error(`✗ Layer A FAIL — ${layerA.errors.length} structural errors:`);
    for (const e of layerA.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (layerA.errors.length > 20) {
      console.error(`  ... and ${layerA.errors.length - 20} more`);
    }
    process.exit(1);
  }
  console.log(`✓ Layer A PASS — structural validation succeeded`);

  // ─── Layer B: evidence linkage validation ────────────────────────────────
  section("Layer B: validateEnrichments");
  const layerB = validateEnrichments(enrichments, assembly.input);
  if (!layerB.valid) {
    console.error(`✗ Layer B FAIL — ${layerB.errors.length} linkage errors:`);
    for (const e of layerB.errors.slice(0, 20)) console.error(`  - ${e}`);
    if (layerB.errors.length > 20) {
      console.error(`  ... and ${layerB.errors.length - 20} more`);
    }
    process.exit(1);
  }
  console.log(`✓ Layer B PASS — all evidence IDs resolve`);

  // ─── Done ────────────────────────────────────────────────────────────────
  console.log("");
  header("Both layers PASS — Pass 2 output is contract-valid");
}

main().catch((err) => {
  console.error("\n✗ Unexpected error:", err);
  process.exit(1);
});
