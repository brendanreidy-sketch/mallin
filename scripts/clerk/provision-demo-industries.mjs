/**
 * Provisions the toggleable industry demo: ONE demo login that owns four
 * industry orgs, each backed by its own demo tenant + seeded book of business.
 *
 * Adapted from provision-demo-partner.mjs, with two deliberate differences:
 *   • NO Vercel allowlist edit and NO production redeploy (pure provisioning).
 *   • Seeds each industry via scripts/db/seed-demo-pipeline.ts (industry mode),
 *     not the single-tenant Hooli substrate.
 *
 * Per invocation, creates (all idempotent):
 *   1. Clerk user (strong generated password, email pre-verified)
 *   2. Four Clerk organizations — "Mallin Demo · {Industry}"
 *   3. Membership: user → each org as org:admin
 *   4. Each industry's deals seeded into its tenant — the seeder
 *      (scripts/db/seed-demo-pipeline.ts) creates the is_demo tenant with
 *      slug=<clerk_org_id> via the Supabase client, so this script needs no
 *      direct DB connection (only CLERK_SECRET_KEY).
 *   5. Clerk sign-in token (one-click bypass URL, 1h expiry)
 *
 * The single login (from the user's seat) lands in one industry; the in-app
 * picker (Slice 2) flips between them via setActive({ organization }). The
 * FIRST industry below is created first, so it tends to be the default landing.
 *
 * Usage:
 *   node scripts/clerk/provision-demo-industries.mjs \
 *     --email demo@mallin.io --name "Demo Mallín"
 *
 * Run from project root so .env.local resolves. See
 * docs/demo-industry-instances.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

// First entry is the default landing industry. Keys MUST match
// lib/demo/industries/*.key so the seeder resolves each book.
const INDUSTRIES = [
  { key: "saas", label: "SaaS" },
  { key: "meddevices", label: "Med Devices" },
  { key: "logistics", label: "Logistics" },
  { key: "realestate", label: "Real Estate" },
];

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}

const USER_EMAIL = arg("email");
const USER_NAME = arg("name");

if (!USER_EMAIL || !USER_NAME) {
  console.error(
    '✗ Usage: node scripts/clerk/provision-demo-industries.mjs --email <email> --name "<Name>"',
  );
  process.exit(1);
}

const [USER_FIRST, ...rest] = USER_NAME.split(" ");
const USER_LAST = rest.join(" ") || "Demo";

// Load env from .env.local
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    // Strip a trailing CR and any matching surrounding quotes, so quoted
    // values (e.g. NEXT_PUBLIC_SUPABASE_URL="https://…") pass to the seeder
    // subprocess clean rather than with literal quotes baked in.
    process.env[m[1]] = m[2].replace(/\r$/, "").replace(/^(['"])(.*)\1$/, "$2");
  }
}

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error("✗ CLERK_SECRET_KEY missing (populate it in .env.local)");
  process.exit(1);
}
// Same doctrine as provision-demo-partner: Mallin runs on ONE live Clerk
// instance. A sk_test_* key creates users that can never sign in to mallin.io.
if (!SECRET.startsWith("sk_live_")) {
  console.error("✗ CLERK_SECRET_KEY must start with sk_live_*");
  console.error(`  found: ${SECRET.slice(0, 8)}…`);
  process.exit(1);
}

const BASE = "https://api.clerk.com/v1";
const H = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

function generatePassword() {
  const u = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = "abcdefghjkmnpqrstuvwxyz";
  const d = "23456789";
  const s = "@#$%&*-+=?";
  const all = u + l + d + s;
  const b = randomBytes(24);
  let pw = u[b[0] % u.length] + l[b[1] % l.length] + d[b[2] % d.length] + s[b[3] % s.length];
  for (let i = 4; i < 24; i++) pw += all[b[i] % all.length];
  return pw;
}

async function verifyPrimaryEmail(userId) {
  const r = await api("GET", `/users/${userId}`);
  if (!r.ok || !r.json) return;
  const primary =
    r.json.email_addresses?.find((e) => e.id === r.json.primary_email_address_id) ??
    r.json.email_addresses?.[0];
  if (!primary || primary.verification?.status === "verified") return;
  const v = await api("POST", `/email_addresses/${primary.id}/verify`, { strategy: "admin" });
  if (v.ok) return;
  await api("PATCH", `/email_addresses/${primary.id}`, { verified: true });
}

async function findOrCreateUser() {
  const list = await api("GET", `/users?email_address=${encodeURIComponent(USER_EMAIL)}`);
  if (list.ok && Array.isArray(list.json) && list.json.length > 0) {
    const ex = list.json[0];
    await verifyPrimaryEmail(ex.id);
    const password = generatePassword();
    const upd = await api("PATCH", `/users/${ex.id}`, {
      password,
      sign_out_of_other_sessions: true,
      skip_password_checks: false,
    });
    if (!upd.ok) throw new Error(`pw reset: ${upd.status} ${upd.text}`);
    console.log(`↻ user exists: ${ex.id} (${USER_EMAIL}) — password reset`);
    return { id: ex.id, password };
  }
  const password = generatePassword();
  const created = await api("POST", "/users", {
    email_address: [USER_EMAIL],
    password,
    first_name: USER_FIRST,
    last_name: USER_LAST,
  });
  if (!created.ok) throw new Error(`user create: ${created.status} ${created.text}`);
  console.log(`+ user created: ${created.json.id} (${USER_EMAIL})`);
  await verifyPrimaryEmail(created.json.id);
  return { id: created.json.id, password };
}

async function findOrCreateOrg(userId, orgName) {
  const list = await api("GET", `/organizations?query=${encodeURIComponent(orgName)}&limit=10`);
  if (list.ok && Array.isArray(list.json?.data)) {
    const ex = list.json.data.find((o) => o.name === orgName);
    if (ex) {
      console.log(`✓ org exists: ${ex.id} (${ex.name})`);
      return ex.id;
    }
  }
  const created = await api("POST", "/organizations", { name: orgName, created_by: userId });
  if (!created.ok) throw new Error(`org create: ${created.status} ${created.text}`);
  console.log(`+ org created: ${created.json.id} (${created.json.name})`);
  return created.json.id;
}

async function ensureMembership(orgId, userId) {
  const list = await api("GET", `/organizations/${orgId}/memberships?limit=100`);
  if (list.ok && Array.isArray(list.json?.data)) {
    const ex = list.json.data.find((m) => m.public_user_data?.user_id === userId);
    if (ex) {
      console.log(`✓ membership exists (${ex.role})`);
      return;
    }
  }
  const c = await api("POST", `/organizations/${orgId}/memberships`, {
    user_id: userId,
    role: "org:admin",
  });
  if (!c.ok) throw new Error(`membership: ${c.status} ${c.text}`);
  console.log(`+ membership created (org:admin)`);
}

function seedIndustry(industryKey, tenantSlug) {
  // The seeder ensures the is_demo tenant (slug=tenantSlug) via the Supabase
  // client, then upserts the industry's book. No direct DB connection here.
  console.log(`\n→ Seeding '${industryKey}' book into tenant ${tenantSlug}…\n`);
  const r = spawnSync(
    "npx",
    ["tsx", "scripts/db/seed-demo-pipeline.ts", "--industry", industryKey, "--tenant", tenantSlug],
    { stdio: "inherit", cwd: process.cwd(), env: process.env },
  );
  if (r.status !== 0) throw new Error(`seed '${industryKey}' failed (exit ${r.status})`);
}

async function makeSignInToken(userId) {
  const r = await api("POST", "/sign_in_tokens", { user_id: userId, expires_in_seconds: 3600 });
  if (!r.ok) throw new Error(`signin token: ${r.status} ${r.text}`);
  return r.json.token;
}

async function main() {
  console.log(`\n→ Provisioning industry demo: ${USER_NAME} <${USER_EMAIL}>\n`);

  const { id: userId, password } = await findOrCreateUser();

  const provisioned = [];
  for (const ind of INDUSTRIES) {
    const orgName = `Mallin Demo · ${ind.label}`;
    console.log(`\n── ${ind.label} ──`);
    const orgId = await findOrCreateOrg(userId, orgName);
    await ensureMembership(orgId, userId);
    seedIndustry(ind.key, orgId);
    provisioned.push({ ...ind, orgId });
  }

  const token = await makeSignInToken(userId);
  const signInUrl = `https://mallin.io/sign-in?__clerk_ticket=${token}`;

  console.log(`\n✓ Provisioning complete.\n`);
  console.log("─".repeat(72));
  console.log(`  Login:       ${USER_EMAIL}`);
  console.log(`  Clerk user:  ${userId}`);
  console.log(`  Default:     ${provisioned[0].label} (first org created)`);
  console.log("─".repeat(72));
  for (const p of provisioned) {
    console.log(`  ${p.label.padEnd(12)}  org=${p.orgId}`);
  }
  console.log("─".repeat(72));
  console.log(`\n  ONE-CLICK SIGN-IN URL (1h expiry):`);
  console.log(`\n  ${signInUrl}\n`);
  console.log(`  STANDARD CREDENTIALS (for return visits):`);
  console.log(`    Email:     ${USER_EMAIL}`);
  console.log(`    Password:  ${password}`);
  console.log(`    Sign-in:   https://mallin.io/sign-in`);
  console.log("");
  console.log(`  NOTE: production gates /prep deal views behind DEMO_ALLOWED_DEAL_IDS.`);
  console.log(`  To view these deals on prod, add each industry's opp UUIDs to that`);
  console.log(`  Vercel env var (this script does NOT touch Vercel or redeploy).`);
  console.log("");
}

main().catch((err) => {
  console.error(`\n✗ Provisioning failed: ${err.message}`);
  process.exit(1);
});
