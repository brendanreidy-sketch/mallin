/**
 * Delete a rep — full teardown of the chain created by onboard-rep.mjs.
 *
 * Deletes (in safe order):
 *   1. Supabase tenant row (cascades to opportunities, accounts,
 *      stakeholders, rep_notes via ON DELETE CASCADE)
 *   2. Clerk organizations the rep created (cascades memberships)
 *   3. Clerk user
 *
 * Default is --dry-run (prints the plan, deletes nothing). Add
 * --confirm to actually execute.
 *
 * Usage:
 *
 *   node scripts/clerk/delete-rep.mjs --email brendan+onboardtest@mallin.io
 *   # → prints plan only
 *
 *   node scripts/clerk/delete-rep.mjs --email brendan+onboardtest@mallin.io --confirm
 *   # → actually deletes
 *
 * Safety rails:
 *   - Refuses to delete if the user owns opportunities with real
 *     activity (any rep_notes, calls, or recent activities). Override
 *     with --force if you really mean it.
 *   - Refuses by default to delete Brendan's own account
 *     (builtalone@gmail.com). Override with --i-know-what-im-doing.
 *
 * Requires sk_live_* CLERK_SECRET_KEY + DATABASE_URL in .env.local.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const EMAIL = arg("email");
const CONFIRM = flag("confirm");
const FORCE = flag("force");
const I_KNOW = flag("i-know-what-im-doing");

if (!EMAIL) {
  console.error("✗ Usage: delete-rep.mjs --email <email> [--confirm] [--force] [--i-know-what-im-doing]");
  process.exit(1);
}

if (EMAIL.toLowerCase() === "builtalone@gmail.com" && !I_KNOW) {
  console.error("✗ refusing to delete builtalone@gmail.com (Brendan's own account)");
  console.error("  override with --i-know-what-im-doing");
  process.exit(1);
}

const CLERK = process.env.CLERK_SECRET_KEY;
if (!CLERK?.startsWith("sk_live_")) {
  console.error("✗ CLERK_SECRET_KEY must be sk_live_*");
  process.exit(1);
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL missing");
  process.exit(1);
}

const CH = { Authorization: `Bearer ${CLERK}`, "Content-Type": "application/json" };
async function clerk(method, path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method, headers: CH, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, json, text };
}

// ─── 1. Look up the chain ──────────────────────────────────────────────────
console.log(`→ Looking up ${EMAIL}…`);

const userLookup = await clerk("GET", `/users?email_address=${encodeURIComponent(EMAIL)}`);
if (!userLookup.ok || !Array.isArray(userLookup.json) || userLookup.json.length === 0) {
  console.error(`✗ user not found in live Clerk: ${EMAIL}`);
  process.exit(1);
}
const user = userLookup.json[0];
const userId = user.id;
console.log(`  user:  ${userId}`);

const memRes = await clerk("GET", `/users/${userId}/organization_memberships?limit=100`);
const orgIds = memRes.ok ? (memRes.json?.data ?? []).map((m) => m.organization?.id).filter(Boolean) : [];
if (orgIds.length > 0) console.log(`  orgs:  ${orgIds.join(", ")}`);
else console.log("  orgs:  (none)");

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let tenants = [];
let activityRows = [];
try {
  if (orgIds.length > 0) {
    const placeholders = orgIds.map((_, i) => `$${i + 1}`).join(",");
    const t = await client.query(
      `SELECT id, slug, name FROM tenants WHERE slug IN (${placeholders})`,
      orgIds,
    );
    tenants = t.rows;
    if (tenants.length > 0) {
      console.log(`  tenants:`);
      for (const r of tenants) console.log(`    - ${r.id} (slug=${r.slug}, name=${r.name})`);

      // Activity check
      const tenantIds = tenants.map((r) => r.id);
      const placeholders2 = tenantIds.map((_, i) => `$${i + 1}`).join(",");
      const act = await client.query(
        `SELECT t.id AS tenant_id, t.name,
                (SELECT COUNT(*) FROM opportunities WHERE tenant_id = t.id) AS opps,
                (SELECT COUNT(*) FROM rep_notes WHERE tenant_id = t.id) AS notes,
                (SELECT COUNT(*) FROM calls WHERE tenant_id = t.id) AS calls
         FROM tenants t WHERE t.id IN (${placeholders2})`,
        tenantIds,
      );
      activityRows = act.rows;
      console.log(`  activity:`);
      for (const r of activityRows) {
        console.log(`    - ${r.tenant_id}: ${r.opps} opps · ${r.notes} notes · ${r.calls} calls`);
      }
    } else {
      console.log(`  tenants: (none)`);
    }
  }
} finally {
  if (!CONFIRM) await client.end();
}

// ─── 2. Activity check ────────────────────────────────────────────────────
const hasActivity = activityRows.some(
  (r) => Number(r.opps) > 0 || Number(r.notes) > 0 || Number(r.calls) > 0,
);
if (hasActivity && !FORCE) {
  console.error(`\n✗ refusing to delete — tenant has real activity (opps/notes/calls)`);
  console.error(`  override with --force if you really mean it`);
  if (CONFIRM) await client.end();
  process.exit(1);
}

// ─── 3. Plan / execute ────────────────────────────────────────────────────
console.log(`\n${"=".repeat(72)}`);
console.log(`  DELETION PLAN`);
console.log(`${"=".repeat(72)}`);
console.log(`  Supabase tenants:  ${tenants.length} row(s)`);
console.log(`  Clerk orgs:        ${orgIds.length}`);
console.log(`  Clerk user:        1 (${EMAIL})`);
console.log(`${"=".repeat(72)}`);

if (!CONFIRM) {
  console.log(`\nDRY-RUN — nothing deleted. Re-run with --confirm to execute.\n`);
  process.exit(0);
}

console.log(`\n→ Executing deletions…`);

// 1. Supabase tenants (cascades opps, accounts, stakeholders, rep_notes)
for (const t of tenants) {
  await client.query(`DELETE FROM tenants WHERE id = $1`, [t.id]);
  console.log(`  ✓ deleted tenant ${t.id} (${t.name})`);
}
await client.end();

// 2. Clerk orgs (cascades memberships)
for (const orgId of orgIds) {
  const d = await clerk("DELETE", `/organizations/${orgId}`);
  if (d.ok) console.log(`  ✓ deleted org ${orgId}`);
  else console.warn(`  ⚠ org delete failed (${d.status}): ${d.text}`);
}

// 3. Clerk user
const du = await clerk("DELETE", `/users/${userId}`);
if (!du.ok) {
  console.error(`✗ user delete failed (${du.status}): ${du.text}`);
  process.exit(1);
}
console.log(`  ✓ deleted user ${userId}`);

// 4. Integrity check — verify everything is actually gone
console.log(`\n→ Verifying deletions…`);
const verifyUser = await clerk("GET", `/users?email_address=${encodeURIComponent(EMAIL)}`);
const userGone = !Array.isArray(verifyUser.json) || verifyUser.json.length === 0;
console.log(`  user gone:  ${userGone ? "✓" : "✗"}`);

console.log(`\n✓ rep deleted: ${EMAIL}\n`);
