/**
 * Pressure-test the cold brief generator (same call as /try).
 *
 *   npx tsx scripts/test-brief.ts --company "Ramp"
 *   npx tsx scripts/test-brief.ts --company "Ramp" --product "what you sell to them"
 *   npx tsx scripts/test-brief.ts --company "Ramp" --who "VP Sales, RevOps lead"
 *
 * Runs runIntakeSubstrate in pre_call mode (no transcript) and prints the
 * brief so we can judge quality + grounding against the Macerich bar.
 * Defaults product_context to Mallín's own offering (so it's "Mallín selling
 * to <company>"), overridable with --product.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runIntakeSubstrate } from "@/lib/agents/intake-substrate-agent";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath))
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const company = arg("company");
if (!company) {
  console.error('Usage: npx tsx scripts/test-brief.ts --company "<name>" [--product "<what you sell>"] [--who "<titles>"]');
  process.exit(1);
}
const product =
  arg("product") ??
  "Mallín — governed AI for revenue teams. It reads each live deal, surfaces the one risk a rep can't hold in their head mid-call, and drafts the CRM update + follow-up for one-click approval. Sold to VP Sales / RevOps / CRO at B2B companies running complex, multi-stakeholder deals.";
const who = (arg("who") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  const t0 = Date.now();
  console.log(`\n══════ PRESSURE TEST · ${company} ══════`);
  console.log(`(cold pre-call brief — no transcript, same path as /try)\n`);
  const r = await runIntakeSubstrate({
    mode: "pre_call",
    transcript: "",
    product_context: product,
    account_name_hint: company!,
    stakeholder_hints: who,
  } as unknown as Parameters<typeof runIntakeSubstrate>[0]);

  const a = r.artifact;
  const b = a.pre_call_brief as {
    primary_objective?: string;
    opening_angle?: string;
    questions_to_qualify?: Array<{ question?: string; rationale?: string }>;
    landmines?: string[];
  } | null;

  console.log(`✓ ${Math.round((Date.now() - t0) / 1000)}s · ${r.search_count} web searches · account="${r.account_name}"`);
  console.log(`  confidence=${a.metadata?.confidence_overall ?? "?"} · ${a.stakeholders?.length ?? 0} stakeholders · ${a.recent_events?.length ?? 0} events\n`);

  console.log("─ STRATEGIC PRIORITIES ─");
  (a.account.strategic_priorities || []).forEach((p: { value?: string }) => console.log("  • " + (p.value ?? p)));
  console.log("\n─ PRIMARY OBJECTIVE ─\n  " + (b?.primary_objective ?? "—"));
  console.log("\n─ OPENING ANGLE ─\n  " + (b?.opening_angle ?? "—"));
  console.log("\n─ QUESTIONS (→ what the answer reveals) ─");
  (b?.questions_to_qualify || []).forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.question}`);
    console.log(`     → ${q.rationale}`);
  });
  console.log("\n─ LANDMINES ─");
  (b?.landmines || []).forEach((l) => console.log("  • " + l));
  console.log("\n─ NEWS → RELEVANCE ─");
  (a.recent_events || []).slice(0, 4).forEach((e: { headline?: string; relevance?: string }) => {
    console.log("  • " + e.headline);
    console.log("    → " + (e.relevance ?? ""));
  });
  console.log("\n─ STAKEHOLDERS ─");
  (a.stakeholders || []).slice(0, 6).forEach((s: { name?: string; title?: { value?: string } | string }) => {
    const title = typeof s.title === "object" ? s.title?.value : s.title;
    console.log("  • " + s.name + " — " + (title ?? "?"));
  });
  console.log("");
}
main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
