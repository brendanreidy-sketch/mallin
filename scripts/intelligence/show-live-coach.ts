/**
 * Founder admin: print Live Coach conversation history for a deal.
 *
 * Uses the service role key (bypasses RLS) so the founder can read
 * across tenants without being a member of the design partner's
 * Clerk org. This is the v0 admin path — a proper admin UI lives
 * behind a build gate (≥3 design partners + verbal request for the
 * UI surface; until then the CLI is enough).
 *
 * Usage:
 *   npx tsx scripts/intelligence/show-live-coach.ts --deal <opp_id>
 *
 *   Optional:
 *     --tenant <id>       filter to one tenant (useful if multiple
 *                         tenants share an opp_id — shouldn't happen
 *                         but defense-in-depth)
 *     --since <iso>       only turns at or after this timestamp
 *     --group             group turns into sessions (gap > 30 min
 *                         = new session)
 *
 * Output: chronological list of (timestamp, role, content), with
 * session groupings if --group is passed.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const dealId = arg("deal");
const tenantId = arg("tenant");
const since = arg("since");
const group = flag("group");

if (!dealId) {
  console.error(
    "Usage: show-live-coach --deal <opp_id> [--tenant <id>] [--since <iso>] [--group]",
  );
  process.exit(1);
}

// ANSI color codes for terminal output. Soft colors so user/assistant
// turns are easy to distinguish without screaming.
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

interface Turn {
  id: string;
  tenant_id: string;
  opportunity_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const SESSION_GAP_MS = 30 * 60 * 1000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    process.exit(1);
  }
  const c = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let q = c
    .from("live_coach_turns")
    .select("id, tenant_id, opportunity_id, user_id, role, content, created_at")
    .eq("opportunity_id", dealId!)
    .order("created_at", { ascending: true });

  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (since) q = q.gte("created_at", since);

  const { data, error } = await q;
  if (error) {
    console.error(`✗ query failed: ${error.message}`);
    process.exit(1);
  }

  const turns = (data ?? []) as Turn[];
  if (turns.length === 0) {
    console.log("(no turns recorded for this deal)");
    return;
  }

  // Resolve opportunity → account/tenant for context header.
  const { data: opp } = await c
    .from("opportunities")
    .select("id, name, tenant_id, account_id")
    .eq("id", dealId!)
    .maybeSingle();
  let accountName: string | null = null;
  let tenantName: string | null = null;
  if (opp) {
    const { data: acct } = await c
      .from("accounts")
      .select("name")
      .eq("id", opp.account_id)
      .maybeSingle();
    accountName = acct?.name ?? null;
    const { data: t } = await c
      .from("tenants")
      .select("name")
      .eq("id", opp.tenant_id)
      .maybeSingle();
    tenantName = t?.name ?? null;
  }

  console.log(C.bold + "─".repeat(72) + C.reset);
  if (opp) {
    console.log(`  ${C.bold}${opp.name}${C.reset}  ${C.dim}(${accountName ?? "?"} · ${tenantName ?? "?"})${C.reset}`);
  } else {
    console.log(`  ${C.bold}opp ${dealId}${C.reset}`);
  }
  console.log(`  ${C.dim}${turns.length} turn(s) across ${new Set(turns.map((t) => t.user_id)).size} user(s)${C.reset}`);
  console.log(C.bold + "─".repeat(72) + C.reset);

  let lastTs = 0;
  let sessionNum = 0;
  for (const t of turns) {
    const ts = new Date(t.created_at).getTime();
    if (group && (sessionNum === 0 || ts - lastTs > SESSION_GAP_MS)) {
      sessionNum += 1;
      const date = new Date(t.created_at);
      console.log(
        `\n${C.gray}── Session ${sessionNum} · ${date.toLocaleString()} ──${C.reset}`,
      );
    }
    lastTs = ts;
    const tsLabel = new Date(t.created_at).toLocaleString();
    const roleLabel =
      t.role === "user"
        ? `${C.cyan}REP${C.reset}`
        : `${C.yellow}MALLIN${C.reset}`;
    const userTag =
      t.role === "user" ? ` ${C.dim}(${t.user_id.slice(0, 12)})${C.reset}` : "";
    console.log(`\n${C.dim}${tsLabel}${C.reset}  ${roleLabel}${userTag}`);
    console.log(t.content.split("\n").map((l) => `  ${l}`).join("\n"));
  }
  console.log();
}

main().catch((err) => {
  console.error(`\n✗ Failed: ${err.message}`);
  process.exit(1);
});
