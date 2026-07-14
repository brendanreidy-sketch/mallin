/**
 * scripts/run-pass-1.5-manual.ts
 *
 * Manual invocation of the Pass 1.5 input assembler against fixture data.
 * Validates that the orchestrator works end-to-end: Supabase queries
 * resolve, type inference works at runtime, activity merge produces
 * sane output, diagnostics populate correctly.
 *
 * Default: runs against Acme's opportunity.
 * Optional: pass --globex to run against Globex instead.
 *
 * Run:
 *   npm run pass15:test
 *   npm run pass15:test -- --globex
 */

import { assembleCoreIntelligenceInput } from '../orchestration/pass-1.5/input-assembler';
import { printCommercialState } from './_helpers/print-commercial-state';
import { printStakeholders } from './_helpers/print-stakeholders';
import { printPayloads } from './_helpers/print-payloads';

// ────────────────────────────────────────────────────────────────────────────
// Fixture IDs (from Block A and Block B fixture deployment)
// ────────────────────────────────────────────────────────────────────────────

const ACME = {
  tenant_id: 'af6a6787-f7f1-4db0-ade2-eeccc5ec9790',
  opportunity_source_external_id: 'sf_opp_acme_001',
};

const GLOBEX = {
  // Tenant + opportunity IDs resolved at runtime via Supabase lookup
  // because Globex's UUIDs were generated dynamically during fixture
  // insert (no hardcoded value to use here).
  slug: 'globex-test',
  opportunity_source_external_id: 'sf_opp_globex_001',
};

// ────────────────────────────────────────────────────────────────────────────
// Entry
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const useGlobex = process.argv.includes('--globex');
  const fixture = useGlobex ? 'Globex' : 'Acme';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Pass 1.5 Input Assembler — Manual Test (${fixture})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  // Resolve tenant + opportunity IDs
  const { tenant_id, opportunity_id } = useGlobex
    ? await resolveGlobexIds()
    : await resolveAcmeIds();

  console.log(`Tenant ID:       ${tenant_id}`);
  console.log(`Opportunity ID:  ${opportunity_id}`);
  console.log();
  console.log('Calling assembleCoreIntelligenceInput...');
  console.log();

  const result = await assembleCoreIntelligenceInput({
    tenant_id,
    opportunity_id,
  });

  // ── Output shape ──────────────────────────────────────────────────────────
  console.log('─── Input shape (top-level keys) ──────────────────────────────');
  console.log(Object.keys(result.input));
  console.log();

  // ── Opportunity ───────────────────────────────────────────────────────────
  console.log('─── Opportunity ────────────────────────────────────────────────');
  console.log(`Name:            ${result.input.opportunity.name}`);
  console.log(`Stage:           ${result.input.opportunity.stage_label} (${result.input.opportunity.stage_position}/${result.input.opportunity.total_stages})`);
  console.log(`Amount:          ${result.input.opportunity.amount} ${result.input.opportunity.currency}`);
  console.log(`Methodology:     ${result.input.opportunity.methodology_type}`);
  console.log(`Posture:         ${result.input.opportunity.deal_posture ?? '(none)'}`);
  console.log();

  // ── Account ───────────────────────────────────────────────────────────────
  console.log('─── Account ────────────────────────────────────────────────────');
  console.log(`Name:            ${result.input.account.name}`);
  console.log(`Industry:        ${result.input.account.industry ?? '(unset)'}`);
  console.log(`Owner ID:        ${result.input.account.owner_id ?? '(unset)'}`);
  console.log();

  // ── Activities ────────────────────────────────────────────────────────────
  // ── Methodology ─────────────────────────────────────────────────────────
  console.log('─── Methodology ────────────────────────────────────────────────');
  console.log(`Type:            ${result.input.opportunity.methodology.type}`);
  console.log(`Surface mode:    ${result.input.opportunity.methodology.surface_mode}`);
  console.log(`Pillar count:    ${result.input.opportunity.methodology.pillars.length}`);
  console.log();
  console.log('Pillars:');
  console.table(
    result.input.opportunity.methodology.pillars.map((p) => ({
      key: p.pillar_key,
      label: p.label,
      status: p.status,
      evidence: p.evidence_ids.length,
    }))
  );
  console.log();


  printCommercialState(result.input.commercial_state);


  printStakeholders(result.input.stakeholders);


  printPayloads(result);


  console.log('─── Activities ─────────────────────────────────────────────────');
  console.log(`Total: ${result.input.activities.length}`);
  console.log();

  const byType = result.input.activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('By type:');
  console.table(byType);

  const byAnchor = result.input.activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.anchor_type] = (acc[a.anchor_type] ?? 0) + 1;
    return acc;
  }, {});
  console.log('By anchor:');
  console.table(byAnchor);

  console.log('Activities (most recent first):');
  console.table(
    result.input.activities.map((a) => ({
      type: a.type,
      anchor: a.anchor_type,
      occurred_at: a.occurred_at.slice(0, 19),
      subject: a.subject.slice(0, 50),
    }))
  );
  console.log();
// ── Inventory (IDs for Pass 2 golden construction / Layer B) ─────────────
  console.log('─── Inventory (IDs for Layer B) ───────────────────────────────');
  console.log();

  console.log('Stakeholders:');
  console.table(
    result.input.stakeholders.map((s) => ({
      id: s.id,
      name: s.name,
    }))
  );
  console.log();

  console.log('Activities:');
  console.table(
    result.input.activities.map((a) => ({
      id: a.id,
      type: a.type,
      subject: (a.subject ?? '').slice(0, 50),
    }))
  );
  console.log();

  console.log('Calls:');
  console.table(
    result.input.calls.map((c) => ({
      id: c.id,
      title: (c.title ?? '(no title)').slice(0, 50),
    }))
  );
  console.log();

  console.log('Emails:');
  console.table(
    result.input.emails.map((e) => ({
      id: e.id,
      subject: (e.subject ?? '(no subject)').slice(0, 50),
    }))
  );
  console.log();

  console.log('Meetings:');
  console.table(
    result.input.meetings.map((m) => ({
      id: m.id,
      title: (m.title ?? '(no title)').slice(0, 50),
      attendee_count: m.attendees?.length ?? 0,
    }))
  );
  console.log();

  for (const m of result.input.meetings) {
    if (m.attendees?.length) {
      console.log(`Meeting "${(m.title ?? '').slice(0, 40)}" attendees:`);
      console.table(
        m.attendees.map((att) => ({
          stakeholder_id: att.stakeholder_id,
          name: att.name ?? '(unset)',
        }))
      );
    }
  }
  console.log();
  // ── Diagnostics ───────────────────────────────────────────────────────────
  console.log('─── Diagnostics ────────────────────────────────────────────────');
  console.log(`Prep time:                          ${result.diagnostics.prep_time}`);
  console.log(`Lookback window start:              ${result.diagnostics.lookback_window_start}`);
  console.log(`Total activities found:             ${result.diagnostics.total_activities_found}`);
  console.log(`Total activities included:          ${result.diagnostics.total_activities_included}`);
  console.log(`Activities capped:                  ${result.diagnostics.activities_capped}`);
  console.log(`Opportunity-anchored activities:    ${result.diagnostics.opportunity_level_activities_included}`);
  console.log(`Account-anchored activities:        ${result.diagnostics.account_level_activities_included}`);
  console.log(`Warnings:                           ${result.diagnostics.warnings.length}`);
  for (const w of result.diagnostics.warnings) {
    console.log(`  - ${w}`);
  }
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Pass 1.5 manual test complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ────────────────────────────────────────────────────────────────────────────
// ID resolution helpers
// ────────────────────────────────────────────────────────────────────────────

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
      `Failed to resolve Acme opportunity by source_external_id="${ACME.opportunity_source_external_id}": ${error?.message ?? 'not found'}`
    );
  }

  return { tenant_id: ACME.tenant_id, opportunity_id: data.id };
}

async function resolveGlobexIds(): Promise<{ tenant_id: string; opportunity_id: string }> {
  const { supabaseAdmin } = await import('../lib/db/client');

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', GLOBEX.slug)
    .single();

  if (tenantError || !tenant) {
    throw new Error(
      `Failed to resolve Globex tenant by slug="${GLOBEX.slug}": ${tenantError?.message ?? 'not found'}`
    );
  }

  const { data: opp, error: oppError } = await supabaseAdmin
    .from('opportunities')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('source_external_id', GLOBEX.opportunity_source_external_id)
    .single();

  if (oppError || !opp) {
    throw new Error(
      `Failed to resolve Globex opportunity: ${oppError?.message ?? 'not found'}`
    );
  }

  return { tenant_id: tenant.id, opportunity_id: opp.id };
}

main().catch((err) => {
  console.error();
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('  Pass 1.5 manual test FAILED');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(err);
  process.exit(1);
});
