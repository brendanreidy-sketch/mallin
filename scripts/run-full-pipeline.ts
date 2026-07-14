/**
 * ============================================================================
 *  Full Pipeline Runner — Pass 1.5 → Pass 2 → Pass 3
 * ============================================================================
 *
 *  Produces the artifact a human can actually look at: the fully-enriched
 *  ExecutionAgentInput, which is what the downstream Execution agent will
 *  consume. This is the moment the abstract architecture becomes a concrete
 *  deliverable.
 *
 *  Pipeline:
 *    1. Pass 1.5 — assemble substrate from Supabase (or BANT fixture)
 *    2. Pass 2  — invoke Core Intelligence agent → CoreIntelligenceEnrichments
 *       Layer A — validateStructure (Zod) gates structural validity
 *       Layer B — validateEnrichments gates evidence linkage
 *    3. Pass 3  — applyCoreIntelligence merges enrichments into substrate
 *
 *  Usage:
 *    npx tsx --env-file=.env.local scripts/run-full-pipeline.ts
 *      Production: live LLM, MEDDPICC methodology, Acme/Beneba opportunity
 *
 *    npx tsx --env-file=.env.local scripts/run-full-pipeline.ts --stub
 *      Stub agent: canned enrichments from golden fixture, no API call
 *
 *    npx tsx --env-file=.env.local scripts/run-full-pipeline.ts --bant
 *      Live LLM with BANT methodology swap (in-code fixture)
 *
 *    npx tsx --env-file=.env.local scripts/run-full-pipeline.ts --save
 *      Write the final enriched ExecutionAgentInput to
 *      scripts/_fixtures/acme-beneba-full-pipeline-output.json
 *      (suffix differs for --bant: -bant- in filename)
 *
 *  Flags compose: --bant --save runs BANT and saves; --stub --save runs
 *  the stub and saves.
 * ============================================================================
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assembleCoreIntelligenceInput } from "../orchestration/pass-1.5/input-assembler";
import { buildBantFixture } from "./_fixtures/build-bant-fixture";
import { ProductionCoreIntelligenceAgent } from "../lib/agents/core-intelligence-agent";
import { StubCoreIntelligenceAgent } from "../lib/agents/core-intelligence-agent.stub";
import { validateEnrichments } from "../lib/contracts/core-intelligence-contract";
import { validateStructure } from "../lib/contracts/core-intelligence-validator";
import { applyCoreIntelligence } from "../orchestration/pass-3/apply";
import type {
  CoreIntelligenceAgent,
  CoreIntelligenceAgentRequest,
} from "../lib/contracts/core-intelligence-contract";

// ────────────────────────────────────────────────────────────────────────────
// Test target
// ────────────────────────────────────────────────────────────────────────────

const TENANT_ID = "af6a6787-f7f1-4db0-ade2-eeccc5ec9790";
const OPPORTUNITY_ID = "6d072dbd-cc3d-444a-a574-520eefb15296";

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const useStub = args.has("--stub");
const useBant = args.has("--bant");
const save = args.has("--save");

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

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = useStub
    ? "STUB MODE"
    : useBant
    ? "LIVE LLM, BANT methodology"
    : "LIVE LLM, MEDDPICC methodology";

  header(`Full Pipeline Runner — Acme/Beneba (${mode})`);
  console.log(`Tenant ID:       ${TENANT_ID}`);
  console.log(`Opportunity ID:  ${OPPORTUNITY_ID}`);
  console.log(`Save artifact:   ${save ? "yes" : "no"}`);

  if (!useStub && !process.env.ANTHROPIC_API_KEY) {
    fail(
      "ANTHROPIC_API_KEY is not set. Run with --env-file=.env.local " +
        "or use --stub to skip the LLM call."
    );
  }

  // ─── Pass 1.5 ────────────────────────────────────────────────────────────
  section(
    useBant
      ? "Pass 1.5 + BANT methodology swap"
      : "Pass 1.5: assemble pre-enrichment substrate"
  );
  const t0 = Date.now();
  const assembly = useBant
    ? await buildBantFixture()
    : await assembleCoreIntelligenceInput({
        tenant_id: TENANT_ID,
        opportunity_id: OPPORTUNITY_ID,
      });
  const assemblyMs = Date.now() - t0;
  console.log(`✓ Substrate assembled in ${assemblyMs}ms`);
  console.log(`  stakeholders:  ${assembly.input.stakeholders.length}`);
  console.log(`  activities:    ${assembly.input.activities.length}`);
  console.log(
    `  pillars:       ${assembly.input.opportunity.methodology.pillars.length}`
  );

  // ─── Pass 2 ──────────────────────────────────────────────────────────────
  section("Pass 2: invoke Core Intelligence agent");

  const agent: CoreIntelligenceAgent = useStub
    ? new StubCoreIntelligenceAgent()
    : new ProductionCoreIntelligenceAgent();

  const request: CoreIntelligenceAgentRequest = {
    pre_enrichment_input: assembly.input as never,
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
    fail(`Agent invocation failed: ${(err as Error).message}`);
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

  // ─── Layer A ─────────────────────────────────────────────────────────────
  section("Layer A: validateStructure");
  const layerA = validateStructure(enrichments);
  if (!layerA.ok) {
    console.error(`✗ Layer A FAIL — ${layerA.errors.length} structural errors:`);
    for (const e of layerA.errors.slice(0, 10)) console.error(`  - ${e}`);
    if (layerA.errors.length > 10) {
      console.error(`  ... and ${layerA.errors.length - 10} more`);
    }
    process.exit(1);
  }
  console.log(`✓ Layer A PASS`);

  // ─── Layer B ─────────────────────────────────────────────────────────────
  section("Layer B: validateEnrichments");
  const layerB = validateEnrichments(enrichments, assembly.input);
  if (!layerB.valid) {
    console.error(`✗ Layer B FAIL — ${layerB.errors.length} linkage errors:`);
    for (const e of layerB.errors.slice(0, 10)) console.error(`  - ${e}`);
    if (layerB.errors.length > 10) {
      console.error(`  ... and ${layerB.errors.length - 10} more`);
    }
    process.exit(1);
  }
  console.log(`✓ Layer B PASS`);

  // ─── Pass 3 ──────────────────────────────────────────────────────────────
  section("Pass 3: applyCoreIntelligence (merge enrichments into substrate)");
  const t2 = Date.now();
  const enriched = applyCoreIntelligence(assembly.input as never, enrichments);
  const applyMs = Date.now() - t2;
  console.log(`✓ Merged in ${applyMs}ms`);

  // Sample readout from the merged artifact — this is what proves the merge
  // landed where it should.
  const enrichedAny = enriched as unknown as Record<string, unknown>;
  const opp = (enrichedAny.opportunity as Record<string, unknown>) ?? {};
  const methodology = (opp.methodology as Record<string, unknown>) ?? {};
  const pillars = (methodology.pillars as Array<Record<string, unknown>>) ?? [];
  const stakeholders = (enrichedAny.stakeholders as Array<Record<string, unknown>>) ?? [];

  console.log("");
  console.log("  Substrate slots now populated:");
  console.log(`    intelligence (top-level):        ${enriched.intelligence.length}`);
  console.log(
    `    conflicts (top-level):           ${(enriched.conflicts ?? []).length}`
  );
  console.log(
    `    deal_posture (opportunity):      ${opp.deal_posture ?? "(unset)"}`
  );
  console.log(
    `    last_activity_summary:           ${
      typeof opp.last_activity_summary === "string" ? "(set)" : "(unset)"
    }`
  );

  const enrichedPillars = pillars.filter(
    (p) => Array.isArray(p.evidence_ids) && (p.evidence_ids as unknown[]).length > 0
  );
  console.log(
    `    pillars with evidence_ids:       ${enrichedPillars.length} / ${pillars.length}`
  );

  const enrichedStakeholders = stakeholders.filter(
    (s) => s.disposition !== undefined
  );
  console.log(
    `    stakeholders with disposition:   ${enrichedStakeholders.length} / ${stakeholders.length}`
  );

  // ─── Save ────────────────────────────────────────────────────────────────
  if (save) {
    section("Saving enriched ExecutionAgentInput");
    const filename = useBant
      ? "acme-beneba-full-pipeline-bant-output.json"
      : "acme-beneba-full-pipeline-output.json";
    const outPath = resolve(process.cwd(), `scripts/_fixtures/${filename}`);
    writeFileSync(outPath, JSON.stringify(enriched, null, 2));
    console.log(`✓ Wrote ${outPath}`);
  }

  // ─── Done ────────────────────────────────────────────────────────────────
  console.log("");
  header("Full pipeline complete — enriched ExecutionAgentInput is contract-valid");
}

main().catch((err) => {
  console.error("\n✗ Unexpected error:", err);
  process.exit(1);
});
