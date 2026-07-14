/**
 * Reprovision a design partner against the LIVE Clerk instance.
 *
 * The Mallin app has historically had two Clerk instances:
 *   - dev (sk_test_*) which provision-demo-partner.mjs wrote to via .env.local
 *   - live (sk_live_*) which production mallin.io serves
 *
 * Sign-in tickets from dev never validated against live. This script
 * is the bridge: given a rep that was previously created in dev, it
 * creates them fresh in live and points their existing Supabase
 * tenant at the new live org_id.
 *
 * After Phase 1's .env.local swap, the standard provision-demo-partner.mjs
 * script writes directly to live and this bridge stops being needed
 * for NEW partners. Existing dev-only partners still need to run
 * through this once.
 *
 * Usage:
 *   LIVE_CLERK_SECRET="sk_live_..." node scripts/clerk/reprovision-rep-live.mjs \
 *     --email gianna.donadio@gmail.com \
 *     --name "Gianna Donadio" \
 *     --tenant-id b4373f37-b52d-4f5b-9708-56422ed19793 \
 *     [--org-name "Mallin Demo · Gianna Donadio"]
 *
 * Idempotent: finds-or-creates user + org, ensures membership,
 * generates a fresh sign-in token each run.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}

const USER_EMAIL = arg("email");
const USER_NAME = arg("name");
const TENANT_ID = arg("tenant-id");
const ORG_NAME_OVERRIDE = arg("org-name");

if (!USER_EMAIL || !USER_NAME || !TENANT_ID) {
  console.error(
    "✗ Usage: LIVE_CLERK_SECRET=... node scripts/clerk/reprovision-rep-live.mjs \\",
  );
  console.error(
    "       --email <email> --name \"<Full Name>\" --tenant-id <uuid> [--org-name \"...\"]",
  );
  process.exit(1);
}

const [USER_FIRST, ...rest] = USER_NAME.split(" ");
const USER_LAST = rest.join(" ") || "Partner";
const ORG_NAME = ORG_NAME_OVERRIDE ?? `Mallin Demo · ${USER_NAME}`;

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL missing in .env.local");
  process.exit(1);
}

const LIVE_SECRET = process.env.LIVE_CLERK_SECRET;
if (!LIVE_SECRET?.startsWith("sk_live_")) {
  console.error(
    "✗ LIVE_CLERK_SECRET env var missing or not sk_live_*",
  );
  process.exit(1);
}

const CH = { Authorization: `Bearer ${LIVE_SECRET}`, "Content-Type": "application/json" };

async function clerk(method, path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: CH,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, json, text };
}

function generatePassword() {
  const u = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = "abcdefghjkmnpqrstuvwxyz";
  const d = "23456789";
  const sym = "@#$%&*-+=?";
  const all = u + l + d + sym;
  const b = randomBytes(24);
  let pw = u[b[0] % u.length] + l[b[1] % l.length] + d[b[2] % d.length] + sym[b[3] % sym.length];
  for (let i = 4; i < 24; i++) pw += all[b[i] % all.length];
  return pw;
}

async function verifyPrimaryEmail(userId) {
  const r = await clerk("GET", `/users/${userId}`);
  if (!r.ok || !r.json) return;
  const primary =
    r.json.email_addresses?.find((e) => e.id === r.json.primary_email_address_id) ??
    r.json.email_addresses?.[0];
  if (!primary || primary.verification?.status === "verified") return;
  const v = await clerk("POST", `/email_addresses/${primary.id}/verify`, { strategy: "admin" });
  if (v.ok) return;
  await clerk("PATCH", `/email_addresses/${primary.id}`, { verified: true });
}

// ─── 1. user ──────────────────────────────────────────────────────────────
console.log(`\n→ Finding/creating user ${USER_EMAIL} in LIVE Clerk…`);
let userId, password;
{
  const list = await clerk("GET", `/users?email_address=${encodeURIComponent(USER_EMAIL)}`);
  if (list.ok && Array.isArray(list.json) && list.json.length > 0) {
    userId = list.json[0].id;
    await verifyPrimaryEmail(userId);
    password = generatePassword();
    const upd = await clerk("PATCH", `/users/${userId}`, {
      password,
      sign_out_of_other_sessions: true,
      skip_password_checks: false,
    });
    if (!upd.ok) {
      console.error(`✗ pw reset: ${upd.status} ${upd.text}`);
      process.exit(1);
    }
    console.log(`↻ user exists: ${userId} — password reset`);
  } else {
    password = generatePassword();
    const c = await clerk("POST", "/users", {
      email_address: [USER_EMAIL],
      password,
      first_name: USER_FIRST,
      last_name: USER_LAST,
    });
    if (!c.ok) {
      console.error(`✗ user create: ${c.status} ${c.text}`);
      process.exit(1);
    }
    userId = c.json.id;
    console.log(`+ user created: ${userId}`);
    await verifyPrimaryEmail(userId);
  }
}

// ─── 2. org ───────────────────────────────────────────────────────────────
console.log(`\n→ Finding/creating org "${ORG_NAME}" in LIVE Clerk…`);
let orgId;
{
  const list = await clerk("GET", `/organizations?query=${encodeURIComponent(ORG_NAME)}&limit=10`);
  if (list.ok && Array.isArray(list.json?.data)) {
    const ex = list.json.data.find((o) => o.name === ORG_NAME);
    if (ex) {
      orgId = ex.id;
      console.log(`✓ org exists: ${orgId}`);
    }
  }
  if (!orgId) {
    const c = await clerk("POST", "/organizations", { name: ORG_NAME, created_by: userId });
    if (!c.ok) {
      console.error(`✗ org create: ${c.status} ${c.text}`);
      process.exit(1);
    }
    orgId = c.json.id;
    console.log(`+ org created: ${orgId}`);
  }
}

// ─── 3. membership ────────────────────────────────────────────────────────
console.log(`\n→ Ensuring membership…`);
{
  const list = await clerk("GET", `/organizations/${orgId}/memberships?limit=100`);
  let exists = false;
  if (list.ok && Array.isArray(list.json?.data)) {
    exists = list.json.data.some((m) => m.public_user_data?.user_id === userId);
  }
  if (exists) {
    console.log(`✓ membership exists`);
  } else {
    const c = await clerk("POST", `/organizations/${orgId}/memberships`, {
      user_id: userId,
      role: "org:admin",
    });
    if (!c.ok) {
      console.error(`✗ membership: ${c.status} ${c.text}`);
      process.exit(1);
    }
    console.log(`+ membership created (org:admin)`);
  }
}

// ─── 4. tenant.slug update ────────────────────────────────────────────────
console.log(`\n→ Updating Supabase tenant.slug to live org_id…`);
{
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const before = await client.query(
      `SELECT id, slug FROM tenants WHERE id = $1 LIMIT 1`,
      [TENANT_ID],
    );
    if (before.rowCount === 0) {
      console.error(`✗ tenant ${TENANT_ID} not found`);
      process.exit(1);
    }
    console.log(`  before: slug=${before.rows[0].slug}`);
    const upd = await client.query(
      `UPDATE tenants SET slug = $1 WHERE id = $2 RETURNING slug`,
      [orgId, TENANT_ID],
    );
    console.log(`  after:  slug=${upd.rows[0].slug}`);
  } finally {
    await client.end();
  }
}

// ─── 5. sign-in token ─────────────────────────────────────────────────────
console.log(`\n→ Generating 24h sign-in token…`);
const tok = await clerk("POST", "/sign_in_tokens", { user_id: userId, expires_in_seconds: 86400 });
if (!tok.ok) {
  console.error(`✗ sign-in token: ${tok.status} ${tok.text}`);
  process.exit(1);
}
const ticket = tok.json.token;

// ─── 6. output ────────────────────────────────────────────────────────────
console.log(`\n✓ DONE.\n${"─".repeat(72)}`);
console.log(`  Rep:              ${USER_NAME} <${USER_EMAIL}>`);
console.log(`  Live Clerk user:  ${userId}`);
console.log(`  Live Clerk org:   ${orgId}`);
console.log(`  Supabase tenant:  ${TENANT_ID}`);
console.log(`${"─".repeat(72)}\n`);
console.log(`SIGN-IN URL (24h, single-use):\n`);
console.log(`https://mallin.io/sign-in?__clerk_ticket=${ticket}\n`);
console.log(`STANDARD CREDENTIALS:`);
console.log(`  Email:    ${USER_EMAIL}`);
console.log(`  Password: ${password}\n`);
