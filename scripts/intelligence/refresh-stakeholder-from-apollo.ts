/**
 * Refreshes a stakeholder's intel via Apollo and merges into the
 * current Account Intelligence artifact.
 *
 * Usage:
 *   npx tsx scripts/intelligence/refresh-stakeholder-from-apollo.ts \
 *     --tenant b4373f37-b52d-4f5b-9708-56422ed19793 \
 *     --account 3ac8657f-53ed-4d29-9523-d4b73a353c0e \
 *     --name "Kevin Lagarenne" \
 *     --org "Flow" \
 *     --linkedin https://www.linkedin.com/in/kevinlagarenne/
 *
 * Requires APOLLO_API_KEY in .env.local. Sign up at apollo.io for a
 * free-tier key (50 credits/month).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  fetchApolloPerson,
  apolloPersonToStakeholderIntel,
} from "@/lib/intelligence/sources/apollo";
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
const orgName = arg("org");
const linkedinUrl = arg("linkedin");

if (!tenantId || !accountId || !fullName) {
  console.error(
    "Usage: refresh-stakeholder-from-apollo --tenant <id> --account <id> --name <full-name> [--org <name>] [--linkedin <url>]",
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

async function main() {
  console.log(`\n→ Fetching Apollo data for: ${fullName} @ ${orgName ?? "(no org)"}\n`);

  const [firstName, ...rest] = (fullName || "").split(" ");
  const lastName = rest.join(" ");

  const person = await fetchApolloPerson({
    firstName,
    lastName,
    fullName: fullName ?? undefined,
    organizationName: orgName ?? undefined,
    linkedinUrl: linkedinUrl ?? undefined,
  });

  if (!person) {
    console.error(
      "✗ Apollo returned no match (or APOLLO_API_KEY missing). See lib/intelligence/sources/apollo.ts for setup instructions.",
    );
    process.exit(1);
  }

  console.log(`  ✓ matched: ${person.name ?? `${person.first_name} ${person.last_name}`}`);
  if (person.title) console.log(`    title: ${person.title}`);
  if (person.organization?.name)
    console.log(`    org: ${person.organization.name}`);
  if (person.linkedin_url) console.log(`    linkedin: ${person.linkedin_url}`);

  const newIntel = apolloPersonToStakeholderIntel(person);
  console.log(`\n  → mapped to StakeholderIntel:`);
  console.log(`    confidence: ${newIntel.background.confidence}`);
  console.log(`    background: ${newIntel.background.value.slice(0, 120)}…`);

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
    console.error(`✗ No current artifact for account ${accountId}`);
    process.exit(1);
  }

  const current = row.artifact as AccountIntelligenceArtifact;

  // Merge: find stakeholder by name, replace title + background +
  // linkedin_url with Apollo data. Preserve manually-set role_in_deal +
  // watch_for + rapport_hooks (manual edits trump Apollo defaults).
  const updatedStakeholders: StakeholderIntel[] = current.stakeholders.map(
    (s) => {
      if (s.name.toLowerCase() === fullName!.toLowerCase()) {
        return {
          ...s,
          title: newIntel.title ?? s.title,
          background: newIntel.background,
          linkedin_url: newIntel.linkedin_url ?? s.linkedin_url,
          // Preserve manual role_in_deal + watch_for + rapport_hooks
          // role_in_deal: keep manual
          // watch_for: keep manual + append Apollo's freshness warning
          watch_for: [
            ...s.watch_for,
            "Apollo data is automated and may be stale — verify title + employer in the first call.",
          ],
        };
      }
      return s;
    },
  );

  // If stakeholder doesn't exist, add them
  const exists = current.stakeholders.some(
    (s) => s.name.toLowerCase() === fullName!.toLowerCase(),
  );
  const finalStakeholders = exists
    ? updatedStakeholders
    : [...updatedStakeholders, newIntel];

  // Build new artifact + mark old as not-current + insert new
  const newArtifact: AccountIntelligenceArtifact = {
    ...current,
    stakeholders: finalStakeholders,
    metadata: {
      ...current.metadata,
      generated_at: new Date().toISOString(),
      sources_used: Array.from(
        new Set([...current.metadata.sources_used, "apollo" as const]),
      ),
    },
  };

  // Mark old as not-current
  await c
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("is_current", true);

  // Insert new
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

  console.log(`\n✓ Artifact updated with Apollo enrichment.`);
}

main().catch((err) => {
  console.error(`\n✗ Refresh failed: ${err.message}`);
  process.exit(1);
});
