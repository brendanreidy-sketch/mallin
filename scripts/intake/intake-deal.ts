/**
 * ============================================================================
 *  Intake CLI — transcript → DB-backed substrate → cockpit URL
 * ============================================================================
 *
 * The first real ingestion surface between demo substrate and product
 * workflow. See memory: intake_primitive_doctrine.md
 *
 * What it does (end-to-end):
 *   1. Resolve rep → tenant + Clerk owner_id (by email)
 *   2. Extract transcript text from PDF/txt/md
 *   3. Run intake substrate agent (Claude + web_search) → AccountIntelligenceArtifact
 *   4. Upsert account row
 *   5. Upsert opportunity row
 *   6. Upsert stakeholder rows from participants[]
 *   7. Mark prior account_intelligence_artifacts as not-current
 *   8. Insert new artifact (is_current=true)
 *   9. Emit cockpit URL
 *
 * Replaces:
 *   - per-deal lib/intelligence/fixtures/<deal>-intelligence.ts files
 *   - per-deal scripts/db/seed-<deal>-for-<rep>.ts scripts
 *   - hand-editing TENANT_ID + OWNER_ID placeholders
 *   - manually adding opp_id to Vercel DEMO_ALLOWED_DEAL_IDS env var
 *     (gating is now tenant-membership at request time)
 *
 * Usage:
 *   npx tsx scripts/intake/intake-deal.ts \
 *     --rep rep@example.com \
 *     --transcript /path/to/transcript.pdf \
 *     --product-context "Northwind Platform (B2B software)" \
 *     [--account-name "Example Companies, LLC"] \
 *     [--opportunity-name "Example Companies — Northwind evaluation"] \
 *     [--dry-run]
 *
 * Idempotent: re-running with the same (tenant, account_name) upserts
 * the account, and the opp upsert uses source_external_id derived from
 * the account name to stay stable. Prior intelligence artifacts are
 * marked is_current=false before the new one lands.
 * ============================================================================
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { extractTranscript } from "@/lib/intelligence/extract-transcript";
import { saveDealTranscript } from "@/lib/deck/deck-transcripts";
import { resolveTenantByEmail } from "@/lib/auth/resolve-tenant-by-email";
import { runIntakeSubstrate } from "@/lib/agents/intake-substrate-agent";
import { sendPreCallBriefEmail } from "@/lib/email/summary-emails";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

// ─── Bootstrap env ────────────────────────────────────────────────────
function loadEnv() {
  for (const candidate of [
    resolve(process.cwd(), ".env.local"),
    "/Users/br/revops-autopilot/.env.local",
  ]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

// ─── Arg parsing ──────────────────────────────────────────────────────
function arg(name: string, fallback: string | null = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const REP_EMAIL = arg("rep");
const TRANSCRIPT_PATH = arg("transcript");
const PRODUCT_CONTEXT = arg("product-context");
const ACCOUNT_NAME_HINT = arg("account-name");
const OPP_NAME_OVERRIDE = arg("opportunity-name");
const DRY_RUN = flag("dry-run");

if (!REP_EMAIL || !TRANSCRIPT_PATH || !PRODUCT_CONTEXT) {
  console.error(
    "✗ Usage:\n  npx tsx scripts/intake/intake-deal.ts \\\n" +
      "    --rep <email> \\\n" +
      "    --transcript <path.pdf|.txt|.md> \\\n" +
      '    --product-context "<what the rep is selling>" \\\n' +
      '    [--account-name "<canonical name>"] \\\n' +
      '    [--opportunity-name "<opp name>"] \\\n' +
      "    [--dry-run]",
  );
  process.exit(1);
}

function dbClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Stable external id from account name (idempotent upsert key).
function externalId(prefix: string, accountName: string): string {
  const slug = accountName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return `${prefix}_${slug}`;
}

async function main() {
  console.log(`\n→ Intake: ${TRANSCRIPT_PATH}\n`);

  // ── 1. Resolve rep → tenant + owner ──────────────────────────────
  console.log(`  • Resolving rep "${REP_EMAIL}" → tenant`);
  const rep = await resolveTenantByEmail(REP_EMAIL!);
  console.log(
    `    ✓ tenant_id=${rep.tenantId}${rep.isDemo ? " (demo)" : ""}  owner=${rep.ownerId}  org=${rep.orgId}`,
  );

  // ── 2. Extract transcript text ───────────────────────────────────
  console.log(`  • Extracting transcript`);
  const transcript = await extractTranscript(TRANSCRIPT_PATH!);
  console.log(
    `    ✓ ${transcript.length} chars (${transcript.split(/\s+/).length} words)`,
  );

  // ── 3. Run substrate agent ───────────────────────────────────────
  console.log(`  • Running intake substrate agent (Claude + web_search)`);
  const t0 = Date.now();
  const result = await runIntakeSubstrate({
    transcript,
    product_context: PRODUCT_CONTEXT!,
    account_name_hint: ACCOUNT_NAME_HINT ?? undefined,
  });
  console.log(
    `    ✓ ${Math.round((Date.now() - t0) / 1000)}s · ${result.search_count} web searches · account="${result.account_name}"`,
  );

  // Light validation
  validateArtifact(result.artifact);
  console.log(
    `    ✓ artifact validates: ${result.artifact.stakeholders.length} stakeholders · ${result.artifact.recent_events.length} events`,
  );

  if (DRY_RUN) {
    console.log("\n⚠ --dry-run: skipping DB writes\n");
    console.log("Account:", result.account_name);
    console.log("Opportunity:", result.opportunity_name);
    console.log(
      "Participants:",
      result.participants.map((p) => p.name).join(", "),
    );
    console.log(
      "\nArtifact preview:",
      JSON.stringify(result.artifact, null, 2).slice(0, 2000),
      "...",
    );
    return;
  }

  // ── 4. Upsert account ────────────────────────────────────────────
  const c = dbClient();
  const accountName = result.account_name;
  const acctExtId = externalId("acct", accountName);

  console.log(`  • Upserting account "${accountName}"`);
  const { data: acct, error: acctErr } = await c
    .from("accounts")
    .upsert(
      {
        tenant_id: rep.tenantId,
        name: accountName,
        industry: result.artifact.account.industry.value,
        size_descriptor:
          result.artifact.account.headcount_range?.value ??
          result.artifact.account.revenue_estimate?.value ??
          null,
        headquarters: result.artifact.account.geography[0]?.value ?? null,
        website: result.artifact.account.domain
          ? `https://${result.artifact.account.domain}`
          : null,
        strategic_priority:
          result.artifact.account.strategic_priorities[0]?.value ?? null,
        source_system: "manual",
        source_external_id: acctExtId,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr) throw new Error(`account upsert: ${acctErr.message}`);
  console.log(`    ✓ account_id=${acct!.id}`);

  // ── 5. Upsert opportunity ────────────────────────────────────────
  const oppName = OPP_NAME_OVERRIDE ?? result.opportunity_name;
  const oppExtId = externalId("opp", accountName);

  console.log(`  • Upserting opportunity "${oppName}"`);
  const { data: opp, error: oppErr } = await c
    .from("opportunities")
    .upsert(
      {
        tenant_id: rep.tenantId,
        account_id: acct!.id,
        name: oppName,
        stage_label: "Discovery",
        stage_position: 1,
        total_stages: 7,
        amount: null,
        currency: "USD",
        close_date: null,
        owner_id: rep.ownerId,
        methodology_type: "MEDDPICC",
        methodology_surface_mode: "full",
        last_activity_at: new Date().toISOString(),
        source_system: "manual",
        source_external_id: oppExtId,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr) throw new Error(`opportunity upsert: ${oppErr.message}`);
  console.log(`    ✓ opportunity_id=${opp!.id}`);

  // ── 6. Upsert stakeholders ───────────────────────────────────────
  const stakeholderIdByName: Record<string, string> = {};
  for (const p of result.participants) {
    const isInternal = p.role === "rep" || p.role === "bdr";
    if (isInternal) {
      // Internal rep team — log as internal_participants
      const cleanInternalEmail =
        p.email && typeof p.email === "string" && p.email.trim()
          ? p.email.trim().toLowerCase()
          : null;
      const { error: ipErr } = await c.from("internal_participants").upsert(
        {
          tenant_id: rep.tenantId,
          opportunity_id: opp!.id,
          account_id: acct!.id,
          name: p.name,
          email: cleanInternalEmail,
          title: p.role ?? null,
          company: null,
          party: "internal",
          committee_role: null,
          source_system: "manual",
          source_external_id: externalId("int", `${accountName}_${p.name}`),
        },
        {
          onConflict: "tenant_id,account_id,source_system,source_external_id",
        },
      );
      if (ipErr) console.warn(`    ⚠ internal participant ${p.name}: ${ipErr.message}`);
      else console.log(`    ✓ internal: ${p.name}`);
      continue;
    }

    const committeeRole = mapRoleToCommittee(p.role);
    const sthExtId = externalId("sth", `${accountName}_${p.name}`);
    // Coerce empty/whitespace emails to null. The agent sometimes emits
    // "" for unknown emails, which collides on idx_stakeholders_tenant_email
    // when more than one stakeholder is missing an email.
    const cleanEmail =
      p.email && typeof p.email === "string" && p.email.trim()
        ? p.email.trim().toLowerCase()
        : null;
    const { data: sth, error: sthErr } = await c
      .from("stakeholders")
      .upsert(
        {
          tenant_id: rep.tenantId,
          account_id: acct!.id,
          name: p.name,
          email: cleanEmail,
          title:
            result.artifact.stakeholders.find((s) => s.name === p.name)?.title
              ?.value ?? null,
          company: accountName,
          party: "external",
          committee_role: committeeRole,
          created_via: "manual",
          source_system: "manual",
          source_external_id: sthExtId,
        },
        {
          onConflict: "tenant_id,account_id,source_system,source_external_id",
        },
      )
      .select("id")
      .single();
    if (sthErr) {
      console.warn(`    ⚠ stakeholder ${p.name}: ${sthErr.message}`);
      continue;
    }
    stakeholderIdByName[p.name] = sth!.id;
    console.log(`    ✓ stakeholder: ${p.name} (${committeeRole})`);
  }

  // ── 6.5. Persist the raw transcript (source for the deck-copy step) ──
  // Non-fatal: if the deal_transcripts table isn't present, intake still
  // completes — the deck just won't have a generated narrative for this deal.
  const transcriptSaved = await saveDealTranscript({
    tenantId: rep.tenantId,
    opportunityId: opp!.id,
    accountId: acct!.id,
    source: TRANSCRIPT_PATH!,
    rawText: transcript,
  });
  console.log(
    transcriptSaved
      ? `    ✓ transcript stored for deck-copy`
      : `    ⚠ transcript not stored (deal_transcripts table?) — deck narrative will be skipped`,
  );

  // ── 7. Mark prior intelligence as not-current ────────────────────
  await c
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("tenant_id", rep.tenantId)
    .eq("account_id", acct!.id)
    .eq("is_current", true);

  // ── 8. Insert new intelligence artifact ──────────────────────────
  console.log(`  • Inserting account_intelligence_artifact`);
  const artifactWithIds: AccountIntelligenceArtifact = {
    ...result.artifact,
    stakeholders: result.artifact.stakeholders.map((s) =>
      stakeholderIdByName[s.name]
        ? { ...s, stakeholder_id: stakeholderIdByName[s.name] }
        : s,
    ),
  };

  const { data: intel, error: intelErr } = await c
    .from("account_intelligence_artifacts")
    .insert({
      tenant_id: rep.tenantId,
      account_id: acct!.id,
      opportunity_id: opp!.id,
      artifact: artifactWithIds,
      primary_source: "manual", // The agent transcript→substrate isn't an Apollo/Crunchbase source; "manual" is the closest enum value in the migration's CHECK constraint
      is_current: true,
      generated_at: artifactWithIds.metadata.generated_at,
    })
    .select("id")
    .single();
  if (intelErr) throw new Error(`intel artifact: ${intelErr.message}`);
  console.log(`    ✓ artifact_id=${intel!.id}`);

  // ── 9. Emit URL ──────────────────────────────────────────────────
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() || "https://mallin.io";
  const url = `${baseUrl}/prep?dealId=${opp!.id}`;

  console.log(`\n✓ Intake complete (${Math.round((Date.now() - t0) / 1000)}s end-to-end)\n`);
  console.log("─".repeat(72));
  console.log(`  Rep              ${rep.name ?? rep.email} (${rep.ownerId})`);
  console.log(`  Tenant           ${rep.tenantId}${rep.isDemo ? " (demo)" : ""}`);
  console.log(`  Account          ${accountName} (${acct!.id})`);
  console.log(`  Opportunity      ${opp!.id}`);
  console.log(`  Stakeholders     ${Object.keys(stakeholderIdByName).join(", ")}`);
  console.log(`  Artifact         ${intel!.id}`);
  console.log("─".repeat(72));
  console.log(`\n  Cockpit URL:\n    ${url}\n`);

  // ── 10. Email the rep their pre-call brief summary ───────────────
  // Self-notification to the rep this brief is for, so they have the
  // decision-that-matters-most + recent events before the call. Fail-safe:
  // a send failure never affects the intake outcome.
  if (REP_EMAIL) {
    const topEvents = [...(artifactWithIds.recent_events ?? [])]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map((e) => ({ date: e.date, headline: e.headline }));
    const sent = await sendPreCallBriefEmail(REP_EMAIL, {
      accountName,
      opportunityName: oppName,
      primaryObjective: artifactWithIds.pre_call_brief?.primary_objective ?? null,
      topEvents,
      cockpitUrl: url,
    });
    console.log(
      sent.ok
        ? `  • Brief summary emailed to ${REP_EMAIL}`
        : `  ⚠ Brief summary email skipped (${sent.error})`,
    );
  }
}

function mapRoleToCommittee(role?: string): string | null {
  switch (role) {
    case "champion":
      return "champion";
    case "economic_buyer":
      return "economic_buyer";
    case "procurement":
    case "operator":
    case "technical_evaluator":
    case "user":
      return "influencer";
    default:
      return null;
  }
}

function validateArtifact(a: AccountIntelligenceArtifact) {
  const errs: string[] = [];
  if (!a.account?.name) errs.push("account.name missing");
  if (!a.account?.one_line?.value) errs.push("account.one_line missing");
  if (!a.metadata?.product_context)
    errs.push("metadata.product_context missing (required for relevance anchor)");
  if (!a.metadata?.generated_at) errs.push("metadata.generated_at missing");
  if (!a.metadata?.confidence_overall) errs.push("metadata.confidence_overall missing");
  if (!a.pre_call_brief?.primary_objective)
    errs.push("pre_call_brief.primary_objective missing");
  if (!Array.isArray(a.stakeholders) || a.stakeholders.length === 0)
    errs.push("stakeholders empty");
  if (!Array.isArray(a.recent_events) || a.recent_events.length === 0)
    errs.push("recent_events empty");
  if (errs.length > 0) {
    throw new Error(`Artifact validation failed:\n  - ${errs.join("\n  - ")}`);
  }
}

main().catch((err) => {
  console.error(`\n✗ Intake failed: ${err.message}\n`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
