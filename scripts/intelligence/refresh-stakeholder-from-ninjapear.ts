/**
 * Refreshes a stakeholder's intel via NinjaPear and merges into the
 * current Account Intelligence artifact.
 *
 * NinjaPear is the successor to Proxycurl (which shut down 2025-07-04
 * after losing a LinkedIn lawsuit). NinjaPear does NOT accept LinkedIn
 * URLs as input — lookup is by name+employer-domain or work email.
 * We still pass a LinkedIn URL through to the artifact for human
 * reference only (rep clicks through to verify).
 *
 * Usage:
 *   npx tsx scripts/intelligence/refresh-stakeholder-from-ninjapear.ts \
 *     --tenant b4373f37-b52d-4f5b-9708-56422ed19793 \
 *     --account 3ac8657f-53ed-4d29-9523-d4b73a353c0e \
 *     --name "Kevin Lagarenne" \
 *     --employer flow.life \
 *     [--linkedin https://www.linkedin.com/in/kevinlagarenne/]
 *
 * Or with a work email (most accurate):
 *     --email kevin@flow.life
 *
 * Or with role + employer (last-resort fallback):
 *     --role "VP of Finance" --employer flow.life
 *
 * Requires NINJAPEAR_API_KEY in .env.local. Sign up at
 * https://nubela.co (3-day trial, 10 free credits).
 * Profile lookup costs 3 credits (~$0.03–$0.05 depending on plan).
 *
 * Preserves manually-set fields (role_in_deal, watch_for, rapport_hooks)
 * on refresh — NinjaPear only overwrites what it can populate
 * authoritatively (title, background, location, education hook).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  fetchNinjaPearProfile,
  ninjaPearProfileToStakeholderIntel,
} from "@/lib/intelligence/sources/ninjapear";
import type {
  AccountIntelligenceArtifact,
  StakeholderIntel,
} from "@/lib/intelligence/types";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function arg(name: string, fallback: string | null = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const tenantId = arg("tenant");
const accountId = arg("account");
const fullName = arg("name");
const employerWebsite = arg("employer");
const workEmail = arg("email");
const role = arg("role");
const linkedinForReference = arg("linkedin");

if (!tenantId || !accountId) {
  console.error(
    "Usage: refresh-stakeholder-from-ninjapear --tenant <id> --account <id>\n" +
      "  + one of: --email <work-email>\n" +
      "  or:       --name <full-name> --employer <domain>\n" +
      "  or:       --role <role> --employer <domain>\n" +
      "  optional: --linkedin <url>  (for human reference only)",
  );
  process.exit(1);
}
if (!workEmail && !(fullName && employerWebsite) && !(role && employerWebsite)) {
  console.error(
    "✗ Need at least one of:\n" +
      "  --email <work-email>\n" +
      "  --name <full-name> --employer <domain>\n" +
      "  --role <role> --employer <domain>",
  );
  process.exit(1);
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function splitName(s: string | null): { firstName?: string; lastName?: string } {
  if (!s) return {};
  const parts = s.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function main() {
  const { firstName, lastName } = splitName(fullName);

  console.log(`\n→ Fetching NinjaPear profile`);
  if (workEmail) console.log(`    by email:    ${workEmail}`);
  if (firstName && employerWebsite)
    console.log(`    by name:     ${fullName} @ ${employerWebsite}`);
  if (role && employerWebsite)
    console.log(`    by role:     ${role} @ ${employerWebsite}`);
  if (linkedinForReference)
    console.log(`    reference:   ${linkedinForReference}\n`);

  const profile = await fetchNinjaPearProfile({
    workEmail: workEmail ?? undefined,
    firstName,
    lastName,
    role: role ?? undefined,
    employerWebsite: employerWebsite ?? undefined,
  });

  if (!profile) {
    console.error(
      "\n✗ NinjaPear returned no profile (or NINJAPEAR_API_KEY missing).",
    );
    console.error("  Sign up at https://nubela.co (3-day trial, 10 free credits)");
    console.error("  and add NINJAPEAR_API_KEY=<key> to .env.local + Vercel env.");
    process.exit(1);
  }

  const resolvedName =
    profile.full_name ?? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  console.log(`  ✓ matched: ${resolvedName}`);

  if (profile.bio) console.log(`    bio:        ${profile.bio.slice(0, 120)}…`);
  if (profile.work_experience && profile.work_experience.length > 0) {
    const current =
      profile.work_experience.find((e) => !e.ends_at || e.is_current === true) ??
      profile.work_experience[0];
    if (current) {
      console.log(
        `    current:    ${current.title ?? current.role ?? "?"} at ${current.company ?? "?"}`,
      );
    }
    console.log(`    history:    ${profile.work_experience.length} role(s)`);
  }
  if (profile.education && profile.education.length > 0) {
    console.log(`    education:  ${profile.education[0].school ?? "?"}`);
  }
  if (profile.city || profile.country) {
    console.log(
      `    location:   ${[profile.city, profile.state, profile.country].filter(Boolean).join(", ")}`,
    );
  }

  const newIntel = ninjaPearProfileToStakeholderIntel(profile, {
    linkedinUrlForReference: linkedinForReference ?? undefined,
  });

  console.log(`\n  → mapped to StakeholderIntel:`);
  console.log(`    confidence: ${newIntel.background.confidence}`);
  console.log(`    background: ${newIntel.background.value.slice(0, 200)}…`);

  // Load current artifact for this account
  const c = db();
  const { data: row, error } = await c
    .from("account_intelligence_artifacts")
    .select("id, artifact")
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("is_current", true)
    .maybeSingle();

  if (error || !row) {
    console.error(`\n✗ No current artifact for account ${accountId}`);
    process.exit(1);
  }

  const current = row.artifact as AccountIntelligenceArtifact;

  // Match by stakeholder name (case-insensitive). Replace authoritative
  // fields; preserve manually-set role_in_deal + watch_for additions.
  // Use the resolvedName from NinjaPear if the caller didn't provide --name.
  const matchName = (fullName ?? resolvedName).toLowerCase();

  const updatedStakeholders: StakeholderIntel[] = current.stakeholders.map(
    (s) => {
      if (s.name.toLowerCase() === matchName) {
        const watchForMerged = [
          ...s.watch_for.filter(
            (w) => !w.includes("NinjaPear") && !w.includes("Proxycurl"),
          ),
          "NinjaPear sources from public web (not LinkedIn) — current title/employer may lag reality by weeks. Verify in the first call.",
        ];
        return {
          ...s,
          title: newIntel.title ?? s.title,
          background: newIntel.background,
          linkedin_url: newIntel.linkedin_url ?? s.linkedin_url,
          rapport_hooks:
            newIntel.rapport_hooks.length > 0
              ? newIntel.rapport_hooks
              : s.rapport_hooks,
          visible_priorities:
            newIntel.visible_priorities.length > 0
              ? newIntel.visible_priorities
              : s.visible_priorities,
          watch_for: watchForMerged,
          // role_in_deal: preserve manual (NinjaPear can't infer this)
        };
      }
      return s;
    },
  );

  const exists = current.stakeholders.some(
    (s) => s.name.toLowerCase() === matchName,
  );
  const finalStakeholders = exists
    ? updatedStakeholders
    : [...updatedStakeholders, newIntel];

  const newArtifact: AccountIntelligenceArtifact = {
    ...current,
    stakeholders: finalStakeholders,
    metadata: {
      ...current.metadata,
      generated_at: new Date().toISOString(),
      sources_used: Array.from(
        new Set([...current.metadata.sources_used, "web_search" as const]),
      ),
    },
  };

  // Mark old as not-current, insert new
  await c
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("is_current", true);

  const { error: insertErr } = await c
    .from("account_intelligence_artifacts")
    .insert({
      tenant_id: tenantId,
      account_id: accountId,
      opportunity_id: null,
      artifact: newArtifact,
      primary_source: "mixed",
      is_current: true,
      generated_at: newArtifact.metadata.generated_at,
    });

  if (insertErr) throw new Error(`insert: ${insertErr.message}`);

  console.log(`\n✓ Artifact updated with NinjaPear enrichment.`);
}

main().catch((err) => {
  console.error(`\n✗ Refresh failed: ${err.message}`);
  process.exit(1);
});
