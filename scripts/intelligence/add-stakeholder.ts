/**
 * Adds a stakeholder to the current Account Intelligence artifact.
 *
 * The building block for any flow that introduces a new attendee:
 *   - Today: rep / brendan runs this manually after seeing the
 *     calendar invite ("Sarah Chen just got added to the Flow demo")
 *   - Tomorrow: the calendar-OAuth integration calls this same merge
 *     logic on every newly-added invitee. See memory:
 *     calendar_invite_to_stakeholders.md for the V1 architecture.
 *
 * Source-tags the new stakeholder with `calendar_invite` so the rep
 * sees clear provenance ("this person was pulled from the invite, not
 * confirmed by another source — verify before the call").
 *
 * Usage:
 *   npx tsx scripts/intelligence/add-stakeholder.ts \
 *     --tenant b4373f37-b52d-4f5b-9708-56422ed19793 \
 *     --account 3ac8657f-53ed-4d29-9523-d4b73a353c0e \
 *     --name "Sarah Chen" \
 *     --email sarah.chen@flow.life \
 *     [--title "VP Finance"] \
 *     [--linkedin https://www.linkedin.com/in/sarahchen/] \
 *     [--role-in-deal operator]
 *
 * If --name omitted but --email given, the name is derived from the
 * email's local-part ("sarah.chen" → "Sarah Chen") as a low-confidence
 * placeholder until the rep confirms.
 *
 * If --title not given, it's left empty — the rep should fill it in
 * after web-verification (click the name in the brief to open LinkedIn).
 *
 * Idempotent: if a stakeholder with the same name already exists in
 * the current artifact, this script EXITS without modifying anything.
 * To update an existing stakeholder, use a different refresh script
 * (e.g. refresh-stakeholder-from-ninjapear.ts when the API is wired).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
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
let fullName = arg("name");
const email = arg("email");
const title = arg("title");
const linkedinUrl = arg("linkedin");
const roleInDealRaw = arg("role-in-deal", "unknown") ?? "unknown";

const VALID_ROLES = [
  "champion",
  "economic_buyer",
  "operator",
  "procurement",
  "technical_evaluator",
  "user",
  "unknown",
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

if (!tenantId || !accountId) {
  console.error(
    "Usage: add-stakeholder --tenant <id> --account <id>\n" +
      "  one of:  --name <full-name>  OR  --email <email>\n" +
      "  optional: --title <title>\n" +
      "  optional: --linkedin <url>\n" +
      "  optional: --role-in-deal <champion|economic_buyer|operator|procurement|technical_evaluator|user|unknown>",
  );
  process.exit(1);
}
if (!fullName && !email) {
  console.error("✗ Need --name or --email (or both)");
  process.exit(1);
}
if (!VALID_ROLES.includes(roleInDealRaw as ValidRole)) {
  console.error(
    `✗ Invalid --role-in-deal "${roleInDealRaw}". Valid: ${VALID_ROLES.join(" | ")}`,
  );
  process.exit(1);
}
const roleInDeal = roleInDealRaw as ValidRole;

// Derive name from email local-part when not provided.
function nameFromEmail(e: string): string {
  const local = e.split("@")[0] ?? "";
  return local
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
}
if (!fullName && email) fullName = nameFromEmail(email);
if (!fullName) {
  console.error("✗ Could not derive a name");
  process.exit(1);
}

function domainFromEmail(e: string | null): string | undefined {
  if (!e) return undefined;
  const at = e.indexOf("@");
  if (at < 0) return undefined;
  return e.slice(at + 1).toLowerCase();
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
  console.log(`\n→ Adding stakeholder to current artifact`);
  console.log(`    name:     ${fullName}`);
  if (email) console.log(`    email:    ${email}`);
  if (title) console.log(`    title:    ${title}`);
  if (linkedinUrl) console.log(`    linkedin: ${linkedinUrl}`);
  console.log(`    role:     ${roleInDeal}\n`);

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
  const exists = current.stakeholders.some(
    (s) => s.name.toLowerCase() === fullName!.toLowerCase(),
  );
  if (exists) {
    console.log(
      `  ⚠ "${fullName}" already exists in the artifact — exiting without changes.`,
    );
    console.log(
      `    To update an existing stakeholder, use a refresh script instead.`,
    );
    process.exit(0);
  }

  const NOW = new Date().toISOString();
  const domain = domainFromEmail(email);

  // Inferred-company fact lives in background so the rep sees provenance.
  const bgParts: string[] = [];
  if (title && domain) {
    bgParts.push(
      `Calendar invite shows ${fullName} on the meeting; email domain @${domain} suggests employment there. Title self-reported as "${title}" — verify on LinkedIn.`,
    );
  } else if (domain) {
    bgParts.push(
      `Calendar invite shows ${fullName} on the meeting; email domain @${domain} suggests employment there. Title not yet captured — click the name to verify on LinkedIn.`,
    );
  } else {
    bgParts.push(
      `Added from calendar invite. No email captured — verify name + employer in conversation or via LinkedIn.`,
    );
  }

  const newStakeholder: StakeholderIntel = {
    name: fullName!,
    title: title
      ? {
          value: title,
          source: "calendar_invite",
          source_url: linkedinUrl ?? undefined,
          captured_at: NOW,
          confidence: "low",
          confidence_note:
            "Title came from the calendar invite metadata or rep entry — click the name above to verify on LinkedIn before the call.",
        }
      : undefined,
    role_in_deal: {
      value: roleInDeal,
      confidence: "low",
      rationale:
        "Calendar-invite provenance only. Mark as 'unknown' or operator until confirmed in conversation. Don't infer authority from invite presence alone.",
    },
    background: {
      value: bgParts.join(" "),
      source: "calendar_invite",
      source_url: linkedinUrl ?? undefined,
      captured_at: NOW,
      confidence: "low",
    },
    visible_priorities: [],
    rapport_hooks: [],
    watch_for: [
      "Confirm exact title + role in the deal in the first 60 seconds of the call",
      "Listen for who introduces them ('this is Sarah from finance, she'll be evaluating the workflow side') — that reveals their lane",
      "If they're added late to the invite, that often signals their stakeholder weight just changed — ask the existing contact 'what's bringing Sarah into this?' before the call",
    ],
    linkedin_url: linkedinUrl ?? undefined,
  };

  const finalStakeholders = [...current.stakeholders, newStakeholder];

  const newArtifact: AccountIntelligenceArtifact = {
    ...current,
    stakeholders: finalStakeholders,
    metadata: {
      ...current.metadata,
      generated_at: NOW,
      sources_used: Array.from(
        new Set([...current.metadata.sources_used, "calendar_invite" as const]),
      ),
    },
  };

  // Mark old as not-current, insert new.
  await c
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .eq("is_current", true);

  const { data: inserted, error: insertErr } = await c
    .from("account_intelligence_artifacts")
    .insert({
      tenant_id: tenantId,
      account_id: accountId,
      opportunity_id: null,
      artifact: newArtifact,
      primary_source: "mixed",
      is_current: true,
      generated_at: newArtifact.metadata.generated_at,
    })
    .select("id")
    .single();

  if (insertErr) throw new Error(`insert: ${insertErr.message}`);

  console.log(`✓ Added "${fullName}" to artifact ${inserted.id} (is_current=true)`);
  console.log(`  → Provenance: calendar_invite (low confidence)`);
  console.log(`  → Rep verification cue baked into watch_for + title note.`);
}

main().catch((err) => {
  console.error(`\n✗ Failed: ${err.message}`);
  process.exit(1);
});
