/**
 * Seeds Ten Five Hospitality (Macerich · Jessica Janes — Francine space
 * evaluation call with Dan Daley) into a tenant.
 *
 * Mirrors the Olive & June seed pattern (see seed-olive-june-for-john.ts).
 *
 * Creates (idempotent):
 *   1. Account: Ten Five Hospitality
 *   2. Opportunity: "Macerich SFS — Francine space, Ten Five Hospitality
 *      tenant evaluation"
 *   3. Stakeholders: Dan Daley, Kim Walker, Giancarlo Pagani
 *   4. Internal participant: Jessica Janes (the rep)
 *   5. Account intelligence artifact (MACERICH_TEN_FIVE_INTELLIGENCE)
 *
 * Usage:
 *   npx tsx scripts/db/seed-macerich-for-jessica.ts
 *
 * Before running: fill in TENANT_ID and OWNER_ID below from the
 * `provision-demo-partner.mjs --no-seed` output for Jessica.
 *
 * Re-runnable: upserts by (tenant_id, source_system, source_external_id)
 * and marks any prior account_intelligence_artifacts as not-current
 * before inserting the new one.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MACERICH_TEN_FIVE_INTELLIGENCE } from "@/lib/intelligence/fixtures/macerich-ten-five-intelligence";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ─── Fill in before running ─────────────────────────────────────────────
// Jessica's tenant_id from `provision-demo-partner.mjs --no-seed` output.
const TENANT_ID = "d20285e4-87d7-472a-974e-ab8557ed7ac2";

// Jessica's Clerk user_id from the same provision step.
const OWNER_ID = "user_3E3W189KiXwAcxiDfIWv1q8CJad";

// Rep display info on the deal (real Macerich email — substrate record only,
// not the Clerk auth email).
const REP_NAME = "Jessica Janes";
const REP_EMAIL = "jessica.janes@macerich.com";
const REP_TITLE = "AVP Leasing, National Restaurant Group";
const REP_COMPANY = "Macerich";
// ────────────────────────────────────────────────────────────────────────

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  if (TENANT_ID.startsWith("REPLACE") || OWNER_ID.startsWith("REPLACE")) {
    throw new Error(
      "TENANT_ID and OWNER_ID are placeholders — fill them in at the top of the script before running.",
    );
  }

  const c = client();
  console.log(`\n→ Seeding Ten Five Hospitality into tenant ${TENANT_ID}\n`);

  // ── Account: Ten Five Hospitality ─────────────────────────────────
  const { data: acct, error: acctErr } = await c
    .from("accounts")
    .upsert(
      {
        tenant_id: TENANT_ID,
        name: "Ten Five Hospitality",
        industry: "Hospitality investment + management · multi-concept restaurant operator",
        size_descriptor: "Private · five active markets (LA, Vegas, Miami, NYC, DC) · ~5 active concepts",
        headquarters: "Hollywood, CA",
        website: "https://www.tenfivehospitality.com",
        strategic_priority:
          "Sun Belt geographic expansion (Miami opened 2024, NYC signed 2025, Scottsdale being courted 2026). Concept-led, chef-anchored portfolio. Active commercial litigation with former employer (Relevant Group) over Mother Wolf trademark / corporate-opportunity allegations.",
        source_system: "manual",
        source_external_id: "acct_ten_five_hospitality",
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr) throw new Error(`account upsert: ${acctErr.message}`);
  console.log(`  ✓ account: ${acct.id} (Ten Five Hospitality)`);

  // ── Opportunity: Francine space tenant evaluation ─────────────────
  const { data: opp, error: oppErr } = await c
    .from("opportunities")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Macerich SFS — Francine space, Ten Five Hospitality tenant evaluation",
        stage_label: "Discovery",
        stage_position: 1,
        total_stages: 7,
        amount: null,
        currency: "USD",
        close_date: null,
        owner_id: OWNER_ID,
        deal_posture: null,
        methodology_type: "MEDDPICC",
        methodology_surface_mode: "full",
        last_activity_at: null,
        source_system: "manual",
        source_external_id: "opp_macerich_sfs_francine_ten_five",
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr) throw new Error(`opportunity upsert: ${oppErr.message}`);
  console.log(`  ✓ opportunity: ${opp.id} (Macerich SFS — Francine / Ten Five)`);

  // ── Stakeholder: Dan Daley ────────────────────────────────────────
  const { data: dan, error: danErr } = await c
    .from("stakeholders")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Dan Daley",
        email: null,
        title: "CEO, Co-Founder & Principal",
        company: "Ten Five Hospitality",
        party: "external",
        committee_role: "economic_buyer",
        created_via: "manual",
        source_system: "manual",
        source_external_id: "sth_dan_daley",
      },
      { onConflict: "tenant_id,account_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (danErr) throw new Error(`stakeholder upsert (Dan): ${danErr.message}`);
  console.log(`  ✓ stakeholder: ${dan.id} (Dan Daley)`);

  // ── Stakeholder: Kim Walker ───────────────────────────────────────
  const { data: kim, error: kimErr } = await c
    .from("stakeholders")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Kim Walker",
        email: null,
        title: "CMO, Co-Founder",
        company: "Ten Five Hospitality",
        party: "external",
        committee_role: "influencer",
        created_via: "manual",
        source_system: "manual",
        source_external_id: "sth_kim_walker",
      },
      { onConflict: "tenant_id,account_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (kimErr) throw new Error(`stakeholder upsert (Kim): ${kimErr.message}`);
  console.log(`  ✓ stakeholder: ${kim.id} (Kim Walker)`);

  // ── Stakeholder: Giancarlo Pagani ─────────────────────────────────
  const { data: gc, error: gcErr } = await c
    .from("stakeholders")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Giancarlo Pagani",
        email: null,
        title: "Managing Partner, Food & Beverage",
        company: "Ten Five Hospitality",
        party: "external",
        committee_role: "influencer",
        created_via: "manual",
        source_system: "manual",
        source_external_id: "sth_giancarlo_pagani",
      },
      { onConflict: "tenant_id,account_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (gcErr) throw new Error(`stakeholder upsert (Giancarlo): ${gcErr.message}`);
  console.log(`  ✓ stakeholder: ${gc.id} (Giancarlo Pagani)`);

  // ── Internal participant: Jessica ─────────────────────────────────
  const { error: jErr } = await c.from("internal_participants").upsert(
    {
      tenant_id: TENANT_ID,
      opportunity_id: opp.id,
      account_id: acct.id,
      name: REP_NAME,
      email: REP_EMAIL,
      title: REP_TITLE,
      company: REP_COMPANY,
      party: "internal",
      committee_role: null,
      source_system: "manual",
      source_external_id: "int_jessica_janes",
    },
    { onConflict: "tenant_id,account_id,source_system,source_external_id" },
  );
  if (jErr) console.warn(`  ⚠ internal participant: ${jErr.message}`);
  else console.log(`  ✓ internal participant: ${REP_NAME} (rep)`);

  // ── Account Intelligence artifact ─────────────────────────────────
  await c
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("tenant_id", TENANT_ID)
    .eq("account_id", acct.id)
    .eq("is_current", true);

  const stakeholderIdByName: Record<string, string> = {
    "Dan Daley": dan.id,
    "Kim Walker": kim.id,
    "Giancarlo Pagani": gc.id,
  };

  const artifactWithIds = {
    ...MACERICH_TEN_FIVE_INTELLIGENCE,
    stakeholders: MACERICH_TEN_FIVE_INTELLIGENCE.stakeholders.map((s) =>
      stakeholderIdByName[s.name]
        ? { ...s, stakeholder_id: stakeholderIdByName[s.name] }
        : s,
    ),
  };

  const { data: intel, error: intelErr } = await c
    .from("account_intelligence_artifacts")
    .insert({
      tenant_id: TENANT_ID,
      account_id: acct.id,
      opportunity_id: opp.id,
      artifact: artifactWithIds,
      primary_source: "manual",
      is_current: true,
      generated_at: artifactWithIds.metadata.generated_at,
    })
    .select("id")
    .single();
  if (intelErr) throw new Error(`intel artifact: ${intelErr.message}`);
  console.log(`  ✓ account intelligence artifact: ${intel.id} (is_current=true)`);

  console.log(`\n✓ Seed complete.\n`);
  console.log("─".repeat(72));
  console.log(`  tenant_id      = ${TENANT_ID}`);
  console.log(`  account_id     = ${acct.id}`);
  console.log(`  opportunity_id = ${opp.id}`);
  console.log(`  stakeholders   = Dan (${dan.id}), Kim (${kim.id}), Giancarlo (${gc.id})`);
  console.log(`  intel_artifact = ${intel.id}`);
  console.log("─".repeat(72));
  console.log("");
  console.log("Next: add opp UUID to Vercel DEMO_ALLOWED_DEAL_IDS:");
  console.log(`  ${opp.id}`);
  console.log("");
  console.log(`Then the prep URL is: https://mallin.io/prep?dealId=${opp.id}`);
  console.log("");
}

main().catch((err) => {
  console.error(`\n✗ Seed failed: ${err.message}`);
  process.exit(1);
});
