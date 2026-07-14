/**
 * Seeds the Mallin demo tenant + Hooli Holdings substrate.
 *
 * What it creates (idempotent, safe to re-run):
 *   - Tenant: slug="mallin-demo", name="Mallin Demo", is_demo=true
 *   - Account: Hooli Holdings (industrial holding, 9 subsidiaries)
 *   - Opportunity: Hooli Holdings TMS, $185K ARR, Negotiation 75%
 *   - Stakeholders: Marcus Hale (champion, thin), Linda Park (EB, absent),
 *     Devin Roy (procurement, moderate), Sarah Vega (controller, absent)
 *   - Internal participants: Demo Rep, Demo SE
 *   - 5 calls (Feb 12 → Apr 9) with summaries
 *   - Pass 4 execution_artifact (the risk-analysis surface) from
 *     scripts/_fixtures/hooli-holdings.pass4-output.json
 *
 * Usage:
 *   npx tsx scripts/db/seed-demo-tenant.ts
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { HOOLI_HOLDINGS } from "@/lib/demo/substrate/hooli-holdings";

// Load .env.local so this can be invoked the same way as the migration
// runners (npx tsx scripts/db/seed-demo-tenant.ts) without needing
// dotenv-cli or pre-exported env.
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// CLI usage:
//   npx tsx scripts/db/seed-demo-tenant.ts
//     → seeds the legacy "mallin-demo" tenant (creates if missing)
//   npx tsx scripts/db/seed-demo-tenant.ts <tenant-slug>
//     → seeds an EXISTING tenant looked up by slug (must already exist,
//       provisioned by Clerk org_id from provision-demo-user.mjs)
const TENANT_SLUG_OVERRIDE = process.argv[2];

const DEFAULT_TENANT_SLUG = "mallin-demo";
const DEFAULT_TENANT_NAME = "Mallin Demo";
const PASS4_FIXTURE = "scripts/_fixtures/hooli-holdings.pass4-output.json";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function ensureDemoTenant(c: ReturnType<typeof client>) {
  // If a tenant slug was passed on the CLI, require it to exist —
  // we assume the caller (provision-demo-user.mjs) already created
  // the tenant via the Clerk org_id mapping flow. Just verify and
  // ensure is_demo=true.
  if (TENANT_SLUG_OVERRIDE) {
    const { data: existing } = await c
      .from("tenants")
      .select("id, slug, is_demo")
      .eq("slug", TENANT_SLUG_OVERRIDE)
      .maybeSingle();
    if (!existing) {
      throw new Error(
        `Tenant '${TENANT_SLUG_OVERRIDE}' not found. Run provision-demo-user.mjs first to create the tenant.`,
      );
    }
    if (!existing.is_demo) {
      const { error } = await c
        .from("tenants")
        .update({ is_demo: true })
        .eq("id", existing.id);
      if (error) throw new Error(`failed to flip is_demo: ${error.message}`);
      console.log(`↻ tenant existed but is_demo was false — flipped to true`);
    }
    console.log(`✓ seeding into tenant: ${existing.id} (${existing.slug})`);
    return existing.id as string;
  }

  // Legacy path — find or create the default "mallin-demo" tenant
  const { data: existing } = await c
    .from("tenants")
    .select("id, slug, is_demo")
    .eq("slug", DEFAULT_TENANT_SLUG)
    .maybeSingle();

  if (existing) {
    if (!existing.is_demo) {
      const { error } = await c
        .from("tenants")
        .update({ is_demo: true })
        .eq("id", existing.id);
      if (error) throw new Error(`failed to flip is_demo: ${error.message}`);
      console.log(`↻ tenant existed but is_demo was false — flipped to true`);
    }
    console.log(`✓ tenant exists: ${existing.id} (${existing.slug})`);
    return existing.id as string;
  }

  const { data: created, error } = await c
    .from("tenants")
    .insert({
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      is_demo: true,
      crm_provider: "hubspot",
      enabled_sinks: ["slack"],
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(`tenant insert failed: ${error?.message}`);
  console.log(`+ tenant created: ${created.id} (${DEFAULT_TENANT_SLUG}, is_demo=true)`);
  return created.id as string;
}

async function seedHooliSubstrate(c: ReturnType<typeof client>, tenantId: string) {
  // ── account ──
  const { data: acct, error: acctErr } = await c
    .from("accounts")
    .upsert(
      {
        tenant_id: tenantId,
        name: HOOLI_HOLDINGS.deal.name,
        industry: "Industrial holding company",
        size_descriptor: "~$1.4B revenue · 9 subsidiaries",
        headquarters: null,
        website: null,
        strategic_priority: null,
        source_system: "manual",
        source_external_id: "acct_hooli_holdings",
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr) throw new Error(`account upsert: ${acctErr.message}`);
  console.log(`  ✓ account: ${acct.id}`);

  // ── opportunity ──
  const { data: opp, error: oppErr } = await c
    .from("opportunities")
    .upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        name: HOOLI_HOLDINGS.deal.name + " — TMS evaluation",
        stage_label: HOOLI_HOLDINGS.deal.crmStageLabel.split(" · ")[0] ?? "Negotiation",
        stage_position: 4,
        total_stages: 5,
        amount: HOOLI_HOLDINGS.deal.arr,
        currency: "USD",
        close_date: HOOLI_HOLDINGS.deal.closeDateTarget,
        owner_id: "demo_user_placeholder",
        deal_posture: "at_risk",
        methodology_type: "MEDDPICC",
        methodology_surface_mode: "full",
        last_activity_at: HOOLI_HOLDINGS.calls[HOOLI_HOLDINGS.calls.length - 1]?.date ?? null,
        source_system: "manual",
        source_external_id: "opp_hooli_holdings",
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr) throw new Error(`opportunity upsert: ${oppErr.message}`);
  console.log(`  ✓ opportunity: ${opp.id}`);

  // ── stakeholders ──
  const roleMap: Record<string, string> = {
    champion: "champion",
    economic_buyer: "economic_buyer",
    user: "user",
    procurement: "influencer",
    technical: "technical_buyer",
  };
  for (const s of HOOLI_HOLDINGS.stakeholders) {
    const ext = `sth_hooli_${s.name.toLowerCase().replace(/\s+/g, "_")}`;
    const { error } = await c
      .from("stakeholders")
      .upsert(
        {
          tenant_id: tenantId,
          account_id: acct.id,
          name: s.name,
          email:
            s.name.toLowerCase().replace(/\s+/g, ".") +
            "@hooli-holdings.example",
          title: s.title,
          company: HOOLI_HOLDINGS.deal.name,
          party: "external",
          committee_role: roleMap[s.role] ?? "unknown",
          created_via: "manual",
          source_system: "manual",
          source_external_id: ext,
        },
        { onConflict: "tenant_id,source_system,source_external_id" },
      );
    if (error) console.warn(`  ⚠ stakeholder ${s.name}: ${error.message}`);
  }
  console.log(`  ✓ stakeholders: ${HOOLI_HOLDINGS.stakeholders.length}`);

  // ── internal participants ──
  const internal = [
    { name: "Demo Rep", title: "Account Executive", role: "user" },
    { name: "Demo SE", title: "Solutions Engineer", role: "technical_buyer" },
  ];
  for (const p of internal) {
    const ext = `int_demo_${p.name.toLowerCase().replace(/\s+/g, "_")}`;
    const { error } = await c
      .from("internal_participants")
      .upsert(
        {
          tenant_id: tenantId,
          opportunity_id: opp.id,
          account_id: acct.id,
          name: p.name,
          email: p.name.toLowerCase().replace(/\s+/g, ".") + "@mallin.io",
          title: p.title,
          company: "Mallin",
          party: "internal",
          committee_role: p.role,
          source_system: "manual",
          source_external_id: ext,
        },
        { onConflict: "tenant_id,source_system,source_external_id" },
      );
    if (error) console.warn(`  ⚠ internal ${p.name}: ${error.message}`);
  }
  console.log(`  ✓ internal participants: ${internal.length}`);

  // ── calls ──
  for (const cl of HOOLI_HOLDINGS.calls) {
    const ext = `call_hooli_${cl.id}`;
    const startedAt = new Date(`${cl.date}T10:00:00Z`).toISOString();
    const summary = [
      cl.summary,
      "",
      "Key excerpts:",
      ...cl.excerpts.map((e) => `  [${e.speaker}] "${e.quote}"`),
    ].join("\n");
    const { error } = await c
      .from("calls")
      .upsert(
        {
          tenant_id: tenantId,
          account_id: acct.id,
          opportunity_id: opp.id,
          provider: "gong",
          title: cl.title,
          started_at: startedAt,
          duration_seconds: cl.durationMin * 60,
          direction: "outbound",
          party_emails: cl.attendees.map(
            (a) =>
              a.name.toLowerCase().replace(/\s+/g, ".") +
              (a.name === "Rep" || a.name === "SE"
                ? "@mallin.io"
                : "@hooli-holdings.example"),
          ),
          summary,
          key_moments: [],
          transcript: null,
          topics: [],
          triggers: [],
          source_system: "manual",
          source_external_id: ext,
        },
        { onConflict: "tenant_id,source_system,source_external_id" },
      );
    if (error) console.warn(`  ⚠ call ${cl.title}: ${error.message}`);
  }
  console.log(`  ✓ calls: ${HOOLI_HOLDINGS.calls.length}`);

  // ── Pass 4 execution_artifact (the risk-analysis surface) ──
  const artifactPath = resolve(PASS4_FIXTURE);
  if (existsSync(artifactPath)) {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

    // Mark any prior current artifact for this opp as not current,
    // then insert the new one with is_current=true. Matches the
    // per-deal seed pattern so the cockpit always
    // reads the latest.
    await c
      .from("execution_artifacts")
      .update({ is_current: false })
      .eq("opportunity_id", opp.id)
      .eq("is_current", true);

    const { error: artifactErr } = await c
      .from("execution_artifacts")
      .insert({
        tenant_id: tenantId,
        opportunity_id: opp.id,
        artifact,
        prompt_version: artifact.metadata?.prompt_version ?? null,
        model: artifact.metadata?.model ?? null,
        generated_at:
          artifact.metadata?.generated_at ?? new Date().toISOString(),
        is_current: true,
      });

    if (artifactErr) {
      console.warn(`  ⚠ pass4 artifact: ${artifactErr.message}`);
    } else {
      console.log(`  ✓ pass4 artifact inserted (is_current=true)`);
    }
  } else {
    console.warn(`  ⚠ pass4 fixture not found at ${artifactPath}`);
  }

  return { account_id: acct.id, opportunity_id: opp.id };
}

async function main() {
  const c = client();
  console.log(`\n→ Seeding Mallin demo tenant (Hooli Holdings substrate)\n`);

  const tenantId = await ensureDemoTenant(c);
  const { account_id, opportunity_id } = await seedHooliSubstrate(c, tenantId);

  const effectiveSlug = TENANT_SLUG_OVERRIDE ?? DEFAULT_TENANT_SLUG;
  console.log(`\n✓ Seed complete.`);
  console.log(`\nIDs:`);
  console.log(`  tenant_id      = ${tenantId}`);
  console.log(`  tenant_slug    = ${effectiveSlug}`);
  console.log(`  account_id     = ${account_id}`);
  console.log(`  opportunity_id = ${opportunity_id}`);
  if (!TENANT_SLUG_OVERRIDE) {
    console.log(`\nNext step: provision a Clerk user mapped to org "${effectiveSlug}".`);
    console.log(`See: docs/setup/demo-account.md\n`);
  } else {
    console.log("");
  }
}

main().catch((err) => {
  console.error(`\n✗ Seed failed: ${err.message}`);
  process.exit(1);
});
