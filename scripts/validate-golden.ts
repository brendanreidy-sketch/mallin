/**
 * scripts/validate-golden.ts
 *
 * Runs Layer A (validateStructure) and Layer B (validateEnrichments)
 * against the Acme/Beneba golden fixture.
 *
 * Layer A: Zod structural validation (pure JSON shape check).
 * Layer B: ID resolution against the assembled ExecutionAgentInput
 *          produced by Pass 1.5.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/validate-golden.ts
 */

import * as fs from 'fs';
import { validateStructure } from '../lib/contracts/core-intelligence-validator';
import {
  validateEnrichments,
  type CoreIntelligenceEnrichments,
} from '../lib/contracts/core-intelligence-contract';
import { assembleCoreIntelligenceInput } from '../orchestration/pass-1.5/input-assembler';

const ACME = {
  tenant_id: 'af6a6787-f7f1-4db0-ade2-eeccc5ec9790',
  opportunity_source_external_id: 'sf_opp_acme_001',
};

async function resolveAcmeIds(): Promise<{ tenant_id: string; opportunity_id: string }> {
  const { supabaseAdmin } = await import('../lib/db/client');

  const { data, error } = await supabaseAdmin
    .from('opportunities')
    .select('id')
    .eq('tenant_id', ACME.tenant_id)
    .eq('source_external_id', ACME.opportunity_source_external_id)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to resolve Acme opportunity: ${error?.message ?? 'not found'}`
    );
  }

  return { tenant_id: ACME.tenant_id, opportunity_id: data.id };
}

async function main() {
  const goldenPath = 'scripts/_fixtures/acme-beneba-golden.json';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Golden Fixture Validation — Acme/Beneba');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log(`Loading: ${goldenPath}`);

  const raw = fs.readFileSync(goldenPath, 'utf8');
  const parsed = JSON.parse(raw);

  // ── Layer A ──────────────────────────────────────────────────
  console.log();
  console.log('─── Layer A: validateStructure ─────────────────────────────────');
  const layerA = validateStructure(parsed);

  if (!layerA.ok) {
    console.log('✗ FAIL — structural errors:');
    for (const err of layerA.errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✓ PASS — structural validation succeeded');
  console.log(`  intelligence records:        ${layerA.data.intelligence.length}`);
  console.log(`  pillar evidence entries:     ${layerA.data.methodology_pillar_evidence.length}`);
  console.log(`  stakeholder enrichments:     ${layerA.data.stakeholder_enrichments.length}`);
  console.log(`  conflicts:                   ${layerA.data.conflicts.length}`);

  // ── Layer B ──────────────────────────────────────────────────
  console.log();
  console.log('─── Layer B: validateEnrichments ───────────────────────────────');
  console.log('Resolving Acme/Beneba opportunity IDs...');
  const { tenant_id, opportunity_id } = await resolveAcmeIds();
  console.log(`  tenant_id:      ${tenant_id}`);
  console.log(`  opportunity_id: ${opportunity_id}`);

  console.log('Assembling pre-enrichment input via Pass 1.5...');
  const assembled = await assembleCoreIntelligenceInput({
    tenant_id,
    opportunity_id,
  });
  console.log(`  stakeholders:   ${assembled.input.stakeholders.length}`);
  console.log(`  activities:     ${assembled.input.activities.length}`);
  console.log(`  pillars:        ${assembled.input.opportunity.methodology.pillars.length}`);

  console.log();
  console.log('Running validateEnrichments...');
  // Zod-inferred type and contract interface are structurally identical
  // but nominally distinct; cast through unknown for tsc.
  const layerB = validateEnrichments(
    layerA.data as unknown as CoreIntelligenceEnrichments,
    assembled.input
  );

  if (!layerB.valid) {
    console.log('✗ FAIL — evidence resolution errors:');
    for (const err of layerB.errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✓ PASS — all evidence IDs resolve');

  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Both layers PASS — golden fixture is contract-valid');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});