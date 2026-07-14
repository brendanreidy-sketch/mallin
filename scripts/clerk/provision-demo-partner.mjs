/**
 * Provisions a multi-tenant demo account for a design partner.
 *
 * Per invocation, creates (all idempotent):
 *   1. Clerk user (with strong generated password, email pre-verified)
 *   2. Clerk organization named "Mallin Demo · {Name}"
 *   3. Clerk membership: user → org as org:admin
 *   4. Supabase tenant with is_demo=true, slug=<clerk_org_id>
 *   5. Hooli Holdings substrate seeded into the new tenant (own copy)
 *   6. Vercel DEMO_ALLOWED_DEAL_IDS env var updated with the new opp UUID
 *   7. Vercel production redeploy triggered
 *   8. Clerk sign-in token (one-click bypass URL, 1h expiry)
 *
 * Usage:
 *   node scripts/clerk/provision-demo-partner.mjs \
 *     --email gianna@northwind.com --name "Gianna Donadio"
 *
 * Output: a clean credentials block including the sign-in URL.
 * Run from project root so .env.local + vercel CLI resolve.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import pg from "pg";

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}

const USER_EMAIL = arg("email");
const USER_NAME = arg("name");
const NO_SEED = process.argv.includes("--no-seed");

if (!USER_EMAIL || !USER_NAME) {
  console.error(
    "✗ Usage: node scripts/clerk/provision-demo-partner.mjs --email <email> --name \"<Name>\" [--no-seed]",
  );
  console.error("");
  console.error("  --no-seed   Skip Hooli substrate seed. Creates a blank");
  console.error("              tenant for cases where you'll manually load");
  console.error("              transcripts via the pipeline afterwards.");
  process.exit(1);
}

const [USER_FIRST, ...rest] = USER_NAME.split(" ");
const USER_LAST = rest.join(" ") || "Partner";
const ORG_NAME = `Mallin Demo · ${USER_NAME}`;

// Load env from .env.local
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SECRET = process.env.CLERK_SECRET_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
if (!SECRET) {
  console.error("✗ CLERK_SECRET_KEY missing");
  process.exit(1);
}
// Phase 1 doctrine: Mallin runs on ONE Clerk instance (live). Provisioning
// against sk_test_* creates users in the dev instance that can never sign
// in to mallin.io (which serves the live instance at clerk.mallin.io).
// This footgun bit every design partner before May 22 2026. Hard-fail at
// startup if the key isn't live.
if (!SECRET.startsWith("sk_live_")) {
  console.error("✗ CLERK_SECRET_KEY must start with sk_live_*");
  console.error(`  found: ${SECRET.slice(0, 8)}…`);
  console.error("  See: phase 1 audit / .env.local should point at live Clerk.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL missing");
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
  try { json = text ? JSON.parse(text) : null; } catch {}
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
  const v = await api("POST", `/email_addresses/${primary.id}/verify`, {
    strategy: "admin",
  });
  if (v.ok) return;
  await api("PATCH", `/email_addresses/${primary.id}`, { verified: true });
}

async function findOrCreateUser() {
  const list = await api(
    "GET",
    `/users?email_address=${encodeURIComponent(USER_EMAIL)}`,
  );
  if (list.ok && Array.isArray(list.json) && list.json.length > 0) {
    const ex = list.json[0];
    await verifyPrimaryEmail(ex.id);
    // Reset password so the caller always gets a fresh one
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

async function findOrCreateOrg(userId) {
  const list = await api(
    "GET",
    `/organizations?query=${encodeURIComponent(ORG_NAME)}&limit=10`,
  );
  if (list.ok && Array.isArray(list.json?.data)) {
    const ex = list.json.data.find((o) => o.name === ORG_NAME);
    if (ex) {
      console.log(`✓ org exists: ${ex.id} (${ex.name})`);
      return ex.id;
    }
  }
  const created = await api("POST", "/organizations", {
    name: ORG_NAME,
    created_by: userId,
  });
  if (!created.ok) throw new Error(`org create: ${created.status} ${created.text}`);
  console.log(`+ org created: ${created.json.id} (${created.json.name})`);
  return created.json.id;
}

async function ensureMembership(orgId, userId) {
  const list = await api(
    "GET",
    `/organizations/${orgId}/memberships?limit=100`,
  );
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

async function ensureTenant(orgId) {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const ex = await client.query(
      `SELECT id, slug, is_demo FROM tenants WHERE slug = $1 LIMIT 1`,
      [orgId],
    );
    if (ex.rowCount > 0) {
      console.log(`✓ tenant exists: ${ex.rows[0].id} (slug=${orgId})`);
      return ex.rows[0].id;
    }
    const ins = await client.query(
      `INSERT INTO tenants (slug, name, is_demo, crm_provider, enabled_sinks)
       VALUES ($1, $2, true, 'hubspot', ARRAY['slack'])
       RETURNING id`,
      [orgId, ORG_NAME],
    );
    console.log(`+ tenant created: ${ins.rows[0].id} (slug=${orgId}, is_demo=true)`);
    return ins.rows[0].id;
  } finally {
    await client.end();
  }
}

async function seedSubstrate(tenantSlug) {
  console.log(`\n→ Seeding Hooli Holdings substrate into tenant '${tenantSlug}'…\n`);
  const r = spawnSync(
    "npx",
    ["tsx", "scripts/db/seed-demo-tenant.ts", tenantSlug],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (r.status !== 0) throw new Error(`seed-demo-tenant failed (exit ${r.status})`);
}

async function getOpportunityId(tenantId) {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT id FROM opportunities
        WHERE tenant_id = $1 AND source_external_id = 'opp_hooli_holdings'
        LIMIT 1`,
      [tenantId],
    );
    if (r.rowCount === 0) throw new Error(`No Hooli opp in tenant ${tenantId}`);
    return r.rows[0].id;
  } finally {
    await client.end();
  }
}

async function updateVercelAllowlist(oppId) {
  // Use Vercel REST API directly — `vercel env add` via CLI was
  // dropping the value (Vercel CLI doesn't accept piped stdin reliably
  // for multi-value env vars). REST is unambiguous.
  const authPath =
    "/Users/br/Library/Application Support/com.vercel.cli/auth.json";
  const projPath = resolve(process.cwd(), ".vercel/project.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8"));
  const proj = JSON.parse(readFileSync(projPath, "utf8"));
  const TOKEN = auth.token;
  const PROJECT_ID = proj.projectId;
  const TEAM_ID = proj.orgId;

  const vBase = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env`;
  const teamQ = `teamId=${TEAM_ID}`;

  // Read current value
  const listRes = await fetch(`${vBase}?${teamQ}&decrypt=true`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const listData = await listRes.json();
  const existing = listData.envs?.find((e) => e.key === "DEMO_ALLOWED_DEAL_IDS");

  const currentIds = existing?.value
    ? existing.value.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (currentIds.includes(oppId)) {
    console.log(`✓ DEMO_ALLOWED_DEAL_IDS already includes ${oppId}`);
    return false;
  }

  const newIds = [...currentIds, oppId];
  const newValue = newIds.join(",");

  // Delete existing if present, then create new
  if (existing) {
    const delRes = await fetch(`${vBase}/${existing.id}?${teamQ}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!delRes.ok) {
      throw new Error(`Vercel env delete failed: ${delRes.status}`);
    }
  }

  const createRes = await fetch(
    `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?${teamQ}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "DEMO_ALLOWED_DEAL_IDS",
        value: newValue,
        type: "encrypted",
        target: ["production"],
      }),
    },
  );
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Vercel env create failed: ${createRes.status} ${errText}`);
  }
  console.log(`+ DEMO_ALLOWED_DEAL_IDS updated via REST API (${newIds.length} ids)`);
  return true;
}

async function redeployProduction() {
  console.log(`\n→ Triggering Vercel production redeploy…`);
  execSync(`vercel deploy --prod --yes`, { stdio: "inherit" });
}

async function makeSignInToken(userId) {
  const r = await api("POST", "/sign_in_tokens", {
    user_id: userId,
    expires_in_seconds: 3600,
  });
  if (!r.ok) throw new Error(`signin token: ${r.status} ${r.text}`);
  return r.json.token;
}

async function main() {
  console.log(`\n→ Provisioning demo partner: ${USER_NAME} <${USER_EMAIL}>\n`);

  const { id: userId, password } = await findOrCreateUser();
  const orgId = await findOrCreateOrg(userId);
  await ensureMembership(orgId, userId);
  const tenantId = await ensureTenant(orgId);

  let oppId = null;
  if (!NO_SEED) {
    await seedSubstrate(orgId);
    oppId = await getOpportunityId(tenantId);

    const envChanged = await updateVercelAllowlist(oppId);
    if (envChanged) {
      await redeployProduction();
    } else {
      console.log(`✓ Vercel env unchanged — no redeploy needed`);
    }
  } else {
    console.log(`\n→ --no-seed: skipping Hooli substrate, allowlist, redeploy`);
    console.log(`  Tenant is blank. Load transcripts via the pipeline next.`);
  }

  const token = await makeSignInToken(userId);
  const signInUrl = `https://mallin.io/sign-in?__clerk_ticket=${token}`;

  console.log(`\n✓ Provisioning complete.\n`);
  console.log("─".repeat(72));
  console.log(`  Partner:     ${USER_NAME} <${USER_EMAIL}>`);
  console.log(`  Clerk user:  ${userId}`);
  console.log(`  Clerk org:   ${orgId}`);
  console.log(`  Tenant ID:   ${tenantId}`);
  if (oppId) console.log(`  Opp ID:      ${oppId}`);
  else console.log(`  Opp ID:      (none — blank canvas, no substrate seeded)`);
  console.log("─".repeat(72));
  console.log(`\n  ONE-CLICK SIGN-IN URL (1h expiry):`);
  console.log(`\n  ${signInUrl}\n`);
  console.log(`  STANDARD CREDENTIALS (for return visits):`);
  console.log(`    Email:     ${USER_EMAIL}`);
  console.log(`    Password:  ${password}`);
  console.log(`    Sign-in:   https://mallin.io/sign-in`);
  console.log("");
  console.log(`  Note: standard sign-in requires an email verification code on`);
  console.log(`  the dev Clerk instance. Code is delivered to ${USER_EMAIL}.`);
  console.log(`  The one-click URL above bypasses both password AND code.`);
  console.log("");
}

main().catch((err) => {
  console.error(`\n✗ Provisioning failed: ${err.message}`);
  process.exit(1);
});
