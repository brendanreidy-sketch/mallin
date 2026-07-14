/**
 * ============================================================================
 *  Pipeline runner — substrate file → Pass 4 input
 * ============================================================================
 *
 *  Reads a Pass 1.5-shaped substrate JSON from disk (skipping the DB-backed
 *  input-assembler), runs Pass 2 (Core Intelligence), runs Pass 3 (apply
 *  merge), and writes the merged ExecutionAgentInput to disk so it can be
 *  fed to run-pass-4-manual.ts.
 *
 *  Use:
 *    set -a && source .env.local && set +a
 *    npx tsx scripts/run-pipeline-from-substrate.ts <substrate.json> [<output.json>]
 *
 *  Output default: <substrate-without-.json>.pass3-merged.json
 *
 *  This bypasses Pass 1.5 entirely — the substrate JSON is treated as
 *  the assembled input. Useful for offline experiments and PDF-derived
 *  fixtures that don't live in the DB.
 * ============================================================================
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ProductionCoreIntelligenceAgent } from "../lib/agents/core-intelligence-agent";
import { applyCoreIntelligence } from "../orchestration/pass-3/apply";
import { validateStructure } from "../lib/contracts/core-intelligence-validator";
import { validateEnrichments } from "../lib/contracts/core-intelligence-contract";
import type {
  CoreIntelligenceAgentRequest,
} from "../lib/contracts/core-intelligence-contract";
import type { ExecutionAgentInput } from "../lib/contracts/execution-agent-input";

const HR = "━".repeat(63);
const SUB = "─".repeat(63);

function header(t: string): void {
  console.log(HR);
  console.log(`  ${t}`);
  console.log(HR);
}

function section(t: string): void {
  console.log(`\n${SUB}\n  ${t}\n${SUB}`);
}

const [substratePath, outputPathArg] = process.argv.slice(2);
if (!substratePath) {
  console.error(
    "Usage: npx tsx scripts/run-pipeline-from-substrate.ts <substrate.json> [<output.json>]"
  );
  process.exit(1);
}

const outputPath =
  outputPathArg ?? substratePath.replace(/\.json$/, "") + ".pass3-merged.json";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "✗ ANTHROPIC_API_KEY is not set. Source .env.local first: set -a && source .env.local && set +a"
  );
  process.exit(1);
}

async function main(): Promise<void> {
  header(`Pipeline runner — ${substratePath}`);

  // ─── Load substrate ──────────────────────────────────────────────────────
  section("Load substrate (Pass 1.5 output shape)");
  const substrate = JSON.parse(
    readFileSync(resolve(substratePath), "utf8")
  ) as ExecutionAgentInput;
  console.log(`  opportunity_id:  ${(substrate.opportunity as { id?: string })?.id ?? "(missing)"}`);
  console.log(`  stakeholders:    ${substrate.stakeholders?.length ?? 0}`);
  console.log(`  internal_participants: ${(substrate as unknown as { internal_participants?: unknown[] }).internal_participants?.length ?? 0}`);
  console.log(`  activities:      ${substrate.activities?.length ?? 0}`);
  console.log(`  calls:           ${(substrate as unknown as { calls?: unknown[] }).calls?.length ?? 0}`);
  console.log(`  emails:          ${(substrate as unknown as { emails?: unknown[] }).emails?.length ?? 0}`);

  // ─── Pass 2: Core Intelligence ──────────────────────────────────────────
  section("Pass 2: invoke Core Intelligence agent");
  const agent = new ProductionCoreIntelligenceAgent();
  const request: CoreIntelligenceAgentRequest = {
    pre_enrichment_input: substrate as never,
    config: {
      model: "claude-sonnet-4-6",
      min_confidence: "low",
      include_full_transcripts: false,
      max_intelligence_items: 30,
    },
  };

  const t0 = Date.now();
  const enrichments = await agent.enrich(request);
  const elapsed = Date.now() - t0;
  console.log(`✓ Pass 2 returned in ${elapsed}ms`);
  console.log(`  intelligence:                ${enrichments.intelligence.length}`);
  console.log(`  pillar_evidence:             ${enrichments.methodology_pillar_evidence.length}`);
  console.log(`  stakeholder_enrichments:     ${enrichments.stakeholder_enrichments.length}`);
  console.log(`  conflicts:                   ${enrichments.conflicts.length}`);
  console.log(`  overall_confidence:          ${enrichments.diagnostics?.overall_confidence ?? "(missing)"}`);

  // ─── Layer A + B on Pass 2 output ──────────────────────────────────────
  section("Pass 2 — Layer A (structural) + Layer B (linkage)");
  const layerA = validateStructure(enrichments);
  if (!layerA.ok) {
    // Soften to warning. Pass 2 occasionally returns one or two records with
    // a bad enum or null quote; the rest of the output is still useful for
    // the experiment. Production runner stays strict — this looser variant
    // is for offline iteration on PDF-derived substrate.
    console.warn(`⚠ Layer A WARNINGS — ${layerA.errors.length} (non-blocking for experiment)`);
    for (const e of layerA.errors.slice(0, 10)) console.warn(`  - ${e}`);
  } else {
    console.log(`✓ Layer A PASS`);
  }

  const layerB = validateEnrichments(enrichments, substrate as never);
  if (!layerB.valid) {
    // Log as warning, do NOT abort. Char-limit overruns and other soft
    // constraint violations are noisy on real substrate; the merge is
    // still valid and Pass 4 will run. Strict validation lives in the
    // production runner.
    console.warn(`⚠ Layer B WARNINGS — ${layerB.errors.length} (non-blocking for experiment)`);
    for (const e of layerB.errors.slice(0, 10)) console.warn(`  - ${e}`);
  } else {
    console.log(`✓ Layer B PASS`);
  }

  // ─── Pass 3: apply merge ───────────────────────────────────────────────
  section("Pass 3: applyCoreIntelligence merge");
  const merged = applyCoreIntelligence(substrate, enrichments);
  console.log(`✓ Merged`);
  console.log(`  intelligence (top-level):    ${(merged as unknown as { intelligence?: unknown[] }).intelligence?.length ?? 0}`);
  console.log(`  conflicts (top-level):       ${(merged as unknown as { conflicts?: unknown[] }).conflicts?.length ?? 0}`);

  // ─── Save ──────────────────────────────────────────────────────────────
  section("Save merged Pass 4 input");
  writeFileSync(resolve(outputPath), JSON.stringify(merged, null, 2));
  console.log(`✓ Wrote ${outputPath}`);

  console.log("");
  header("Pipeline complete — feed to run-pass-4-manual.ts");
}

main().catch((err) => {
  console.error("\n✗ Unexpected error:", err);
  process.exit(1);
});
