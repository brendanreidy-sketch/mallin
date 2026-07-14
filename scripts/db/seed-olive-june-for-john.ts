/**
 * Seeds Olive & June (Vision33 / John Dearlove prep call) into a tenant.
 *
 * Mirrors the standard per-deal seed pattern.
 *
 * Creates (idempotent):
 *   1. Account: Olive & June (oliveandjune.com)
 *   2. Opportunity: "Olive & June — S/4HANA Public Cloud evaluation"
 *   3. Stakeholders: Sarah Gibson Tuttle, Kimberly Luciani, Monica Willadsen
 *   4. Internal participant: John Dearlove (the rep)
 *   5. Account intelligence artifact (OLIVE_JUNE_INTELLIGENCE fixture)
 *
 * Usage:
 *   npx tsx scripts/db/seed-olive-june-for-john.ts
 *
 * Before running: fill in TENANT_ID and OWNER_ID below. Either:
 *   (a) Provision a fresh tenant for John:
 *       node scripts/clerk/provision-demo-partner.mjs \
 *         --email <email> --name "John Dearlove" --no-seed
 *       → copy the Tenant ID + Clerk user_id from the output
 *   (b) Reuse an existing tenant (Gianna's, Hooli demo, etc.) — commingles
 *       data with that tenant. Use only if intentional.
 *
 * Re-runnable: upserts by (tenant_id, source_system, source_external_id)
 * and marks any prior account_intelligence_artifacts as not-current
 * before inserting the new one.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { OLIVE_JUNE_INTELLIGENCE } from "@/lib/intelligence/fixtures/olive-june-intelligence";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// ─── Fill in before running ─────────────────────────────────────────────
// John's tenant_id from `provision-demo-partner.mjs --no-seed` output
// (or an existing tenant ID if you're reusing one).
const TENANT_ID = "ea88e57b-37ec-4e1f-b925-ba031469921a";

// John's Clerk user_id from the same provision step.
const OWNER_ID = "user_3DyAK3cCUAYDiEp2L17W7r1Nk6P";

// The rep's display info on the deal.
const REP_NAME = "John Dearlove";
const REP_EMAIL = "brendan+john@mallin.io";
const REP_TITLE = "Account Executive";
const REP_COMPANY = "Vision33";
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
  console.log(`\n→ Seeding Olive & June into tenant ${TENANT_ID}\n`);

  // ── Account: Olive & June ─────────────────────────────────────────
  const { data: acct, error: acctErr } = await c
    .from("accounts")
    .upsert(
      {
        tenant_id: TENANT_ID,
        name: "Olive & June",
        industry: "Beauty / personal care · nail",
        size_descriptor: "~$92M net sales (FY2024) · ~120-150 employees",
        headquarters: "Los Angeles, CA",
        website: "https://oliveandjune.com",
        strategic_priority:
          "Post-acquisition system rationalization (~17 months post-HoT close) + wholesale scale ops (Target/Ulta/Walmart EDI + OTIF)",
        source_system: "manual",
        source_external_id: "acct_olive_june",
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr) throw new Error(`account upsert: ${acctErr.message}`);
  console.log(`  ✓ account: ${acct.id} (Olive & June)`);

  // ── Opportunity: S/4HANA Public Cloud evaluation ──────────────────
  const { data: opp, error: oppErr } = await c
    .from("opportunities")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Olive & June — S/4HANA Public Cloud evaluation",
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
        source_external_id: "opp_olive_june_s4hana",
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr) throw new Error(`opportunity upsert: ${oppErr.message}`);
  console.log(`  ✓ opportunity: ${opp.id} (Olive & June — S/4HANA Public Cloud evaluation)`);

  // ── Stakeholder: Sarah Gibson Tuttle ──────────────────────────────
  const { data: sarah, error: sarahErr } = await c
    .from("stakeholders")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Sarah Gibson Tuttle",
        email: null,
        title: "Founder & CEO",
        company: "Olive & June",
        party: "external",
        committee_role: "economic_buyer",
        created_via: "manual",
        source_system: "manual",
        source_external_id: "sth_sarah_gibson_tuttle",
      },
      { onConflict: "tenant_id,account_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (sarahErr) throw new Error(`stakeholder upsert (Sarah): ${sarahErr.message}`);
  console.log(`  ✓ stakeholder: ${sarah.id} (Sarah Gibson Tuttle)`);

  // ── Stakeholder: Kimberly Luciani (title gap noted) ───────────────
  const { data: kimberly, error: kimErr } = await c
    .from("stakeholders")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Kimberly Luciani",
        email: null,
        title: "Senior Director, FP&A",
        company: "Olive & June",
        party: "external",
        committee_role: "influencer",
        created_via: "manual",
        source_system: "manual",
        source_external_id: "sth_kimberly_luciani",
      },
      { onConflict: "tenant_id,account_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (kimErr) throw new Error(`stakeholder upsert (Kimberly): ${kimErr.message}`);
  console.log(`  ✓ stakeholder: ${kimberly.id} (Kimberly Luciani)`);

  // ── Stakeholder: Monica Willadsen ─────────────────────────────────
  const { data: monica, error: monErr } = await c
    .from("stakeholders")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: acct.id,
        name: "Monica Willadsen",
        email: null,
        title: "SVP Operations",
        company: "Olive & June",
        party: "external",
        committee_role: "influencer",
        created_via: "manual",
        source_system: "manual",
        source_external_id: "sth_monica_willadsen",
      },
      { onConflict: "tenant_id,account_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (monErr) throw new Error(`stakeholder upsert (Monica): ${monErr.message}`);
  console.log(`  ✓ stakeholder: ${monica.id} (Monica Willadsen)`);

  // ── Internal participant: John ────────────────────────────────────
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
      source_external_id: "int_john_dearlove",
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

  // Patch the artifact with stakeholder_ids so the rendering layer
  // can link each intel block back to its substrate row.
  const stakeholderIdByName: Record<string, string> = {
    "Sarah Gibson Tuttle": sarah.id,
    "Kimberly Luciani": kimberly.id,
    "Monica Willadsen": monica.id,
  };

  const artifactWithIds = {
    ...OLIVE_JUNE_INTELLIGENCE,
    stakeholders: OLIVE_JUNE_INTELLIGENCE.stakeholders.map((s) =>
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
  console.log(`  stakeholders   = Sarah (${sarah.id}), Kimberly (${kimberly.id}), Monica (${monica.id})`);
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
