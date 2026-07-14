/**
 * Outbound prospecting — internal GTM tool (agentic_sdr_fork.md: internal-first).
 *
 *   npx tsx scripts/prospect.ts                          # 8 prospects, Mallin config
 *   npx tsx scripts/prospect.ts --count 12
 *   npx tsx scripts/prospect.ts --like "Ramp"            # find companies LIKE this seed
 *   npx tsx scripts/prospect.ts --like "Ramp" --website ramp.com
 *   npx tsx scripts/prospect.ts --industry Fintech       # focus one industry
 *   npx tsx scripts/prospect.ts --persona RevOps         # focus one persona
 *   npx tsx scripts/prospect.ts --exclude "Acme,Globex"  # skip known companies
 *
 * Runs the company-agnostic sourcing engine against a config (MALLIN_OUTBOUND
 * here — a future customer supplies their own). Prints a ranked summary and
 * writes a review-ready markdown file to .prospects/ (gitignored — real
 * people's contact info never gets committed).
 *
 * HONEST SCOPE: no email verification (no paid service), no auto-send. Emails
 * are pattern guesses; LinkedIn is the safer first touch. Send from a warmed
 * inbox, low volume, human-approved. See the footer it prints.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sourceProspects, type Prospect } from "../lib/sdr/outbound/sourcing-agent";
import { MALLIN_OUTBOUND } from "../lib/sdr/outbound/config";
import { deriveLookalikeConfig } from "../lib/sdr/outbound/lookalike-agent";

// ── env (repo convention: load .env.local manually) ──────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set (expected in .env.local)");
  process.exit(1);
}

// ── args ─────────────────────────────────────────────────────────────────────
function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
let config = MALLIN_OUTBOUND;
const count = Number(arg("count") ?? 8);
const like = arg("like"); // seed company → derive a lookalike ICP, then source
const seedWebsite = arg("website") ?? undefined;
const offering = arg("offering") ?? undefined; // override what "a fit" means; default: Mallin's
const company = arg("company") ?? undefined; // whose pipeline this is (the customer) — default: Mallin
const focus = { industry: arg("industry") ?? undefined, persona: arg("persona") ?? undefined };
const exclude = (arg("exclude") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const RANK: Record<Prospect["confidence"], number> = { strong: 0, plausible: 1, weak: 2 };

async function main() {
  // Lookalike mode: research the seed company → derive its ICP → source against it.
  if (like) {
    console.log(`\n🧭 Deriving a lookalike ICP from "${like}"${seedWebsite ? ` (${seedWebsite})` : ""}…`);
    const derived = await deriveLookalikeConfig({
      seedCompany: like,
      seedWebsite,
      offering: offering ?? MALLIN_OUTBOUND.offering,
      companyName: company ?? MALLIN_OUTBOUND.company_name,
    });
    config = derived.config;
    console.log(`   seed:  ${derived.seedProfile}`);
    console.log(`   axes:  ${derived.rationale}`);
    console.log(`   → industries: ${config.industries.map((i) => i.name).join(", ") || "(none)"}`);
    console.log(`   (${derived.searchCount} searches · ${(derived.latencyMs / 1000).toFixed(0)}s)\n`);
  }

  const focusNote = [focus.industry && `industry=${focus.industry}`, focus.persona && `persona=${focus.persona}`]
    .filter(Boolean)
    .join(" · ");
  console.log(`\n🔎 Sourcing ${count} prospects for ${config.company_name}${focusNote ? `  (${focusNote})` : ""}…`);
  console.log(`   industries: ${config.industries.map((i) => i.name).join(", ")}`);
  console.log(`   personas:   ${config.personas.map((p) => p.role).join(", ")}\n`);

  const { prospects, search_count, latency_ms } = await sourceProspects(config, { count, focus, exclude });
  const ranked = [...prospects].sort((a, b) => RANK[a.confidence] - RANK[b.confidence]);

  for (const p of ranked) {
    const badge = p.confidence === "strong" ? "🟢" : p.confidence === "plausible" ? "🟡" : "⚪";
    const seg = [p.matched_industry, p.matched_persona].filter(Boolean).join(" · ");
    console.log(`${badge} ${p.company}${p.website ? `  ·  ${p.website}` : ""}${seg ? `   [${seg}]` : ""}`);
    console.log(`   ${p.contact.name} — ${p.contact.role}`);
    if (p.contact.linkedin_url) console.log(`   in: ${p.contact.linkedin_url}`);
    console.log(`   trigger: ${p.trigger_event}`);
    console.log(`   why:     ${p.why_fit}`);
    console.log("");
  }
  console.log(
    `${ranked.length} prospects · ${ranked.filter((p) => p.confidence === "strong").length} strong · ${search_count} searches · ${(latency_ms / 1000).toFixed(0)}s\n`,
  );

  const outDir = resolve(process.cwd(), ".prospects");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(outDir, `prospects-${stamp}.md`);
  writeFileSync(outPath, toMarkdown(ranked, { search_count, latency_ms }));
  console.log(`📝 Review list → ${outPath}`);
  console.log(
    `\n⚠️  Emails are unverified guesses. Reach out on LinkedIn or from a warmed inbox,\n    low volume, one at a time. Nothing here is auto-sent.\n`,
  );
}

function toMarkdown(prospects: Prospect[], meta: { search_count: number; latency_ms: number }): string {
  const lines: string[] = [];
  lines.push(`# Prospects — ${new Date().toISOString().slice(0, 10)} · ${config.company_name}`);
  lines.push("");
  lines.push(`_${prospects.length} prospects · ${meta.search_count} web searches · ${(meta.latency_ms / 1000).toFixed(0)}s_`);
  lines.push("");
  lines.push(`> Emails are unverified pattern guesses — no verification service is wired. LinkedIn is the safer first touch. Send from a warmed inbox, low volume, human-approved. Nothing here was auto-sent.`);
  lines.push("");
  for (const p of prospects) {
    const badge = p.confidence === "strong" ? "🟢 strong" : p.confidence === "plausible" ? "🟡 plausible" : "⚪ weak";
    const seg = [p.matched_industry, p.matched_persona].filter(Boolean).join(" · ");
    lines.push(`## ${p.company}  —  ${badge}${seg ? `  ·  _${seg}_` : ""}`);
    if (p.website) lines.push(`${p.website}`);
    lines.push("");
    lines.push(`**${p.contact.name}** · ${p.contact.role}`);
    if (p.contact.linkedin_url) lines.push(`LinkedIn: ${p.contact.linkedin_url}`);
    if (p.contact.email_guess) {
      lines.push(`Email (unverified · ${p.contact.email_confidence ?? "unknown"}): ${p.contact.email_guess}`);
    }
    lines.push("");
    lines.push(`- **Trigger:** ${p.trigger_event}`);
    lines.push(`- **Why fit:** ${p.why_fit}`);
    lines.push(`- **Hook:** ${p.outreach_hook}`);
    lines.push("");
    lines.push(`**First touch (draft):**`);
    lines.push("");
    lines.push("```");
    lines.push(p.first_touch);
    lines.push("```");
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

main().catch((e) => {
  console.error("\n❌ Sourcing failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
