/**
 * Provisions the Mallin demo account in Clerk + maps it to the demo
 * tenant in Supabase.
 *
 * Creates (idempotent):
 *   1. User: email_address="demo@mallin.io" (Clerk)
 *   2. Organization: name="Mallin Demo" (Clerk — no slug; the instance
 *      has org slugs disabled, so we use the org_id as the identifier)
 *   3. Membership: user → org, role="org:admin" (Clerk)
 *   4. UPDATE tenants SET slug = <clerk_org_id> WHERE slug='mallin-demo'
 *      (Supabase — so getCurrentTenant's slug-lookup resolves)
 *
 * Reads CLERK_SECRET_KEY + Supabase env from .env.local. Never prints
 * any secret. Prints the user password ONCE at the end.
 *
 * Usage:
 *   node scripts/clerk/provision-demo-user.mjs
 *
 * Re-runnable: finds existing user/org/membership before creating.
 * If --reset-password is passed, regenerates and prints a new password
 * for an existing user.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";

const RESET_PASSWORD = process.argv.includes("--reset-password");

// Load .env.local into process.env
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error("✗ CLERK_SECRET_KEY missing from .env.local");
  process.exit(1);
}

const BASE = "https://api.clerk.com/v1";
const HEADERS = {
  Authorization: `Bearer ${SECRET}`,
  "Content-Type": "application/json",
};

const ORG_NAME = "Mallin Demo";
const TENANT_SLUG_BEFORE = "mallin-demo"; // current slug in Supabase
const USER_EMAIL = "demo@mallin.io";
const USER_FIRST = "Mallin";
const USER_LAST = "Demo";

async function apiCall(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

function generatePassword() {
  // 24-char strong password — alphanumeric + symbols to satisfy Clerk's
  // password complexity rules without including chars that confuse copy-paste.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
  const lower = "abcdefghjkmnpqrstuvwxyz";  // no i, l, o
  const digit = "23456789";                   // no 0, 1
  const sym = "@#$%&*-+=?";
  const all = upper + lower + digit + sym;
  const bytes = randomBytes(24);
  let pw = "";
  // Guarantee at least one of each class
  pw += upper[bytes[0] % upper.length];
  pw += lower[bytes[1] % lower.length];
  pw += digit[bytes[2] % digit.length];
  pw += sym[bytes[3] % sym.length];
  for (let i = 4; i < 24; i++) pw += all[bytes[i] % all.length];
  return pw;
}

async function findOrCreateOrg(userId) {
  // Look up by name — Clerk's list endpoint uses query param against
  // name/slug. We match by exact name to find our org.
  const list = await apiCall(
    "GET",
    `/organizations?query=${encodeURIComponent(ORG_NAME)}&limit=10`,
  );
  if (list.ok && Array.isArray(list.json?.data)) {
    const existing = list.json.data.find((o) => o.name === ORG_NAME);
    if (existing) {
      console.log(`✓ org exists: ${existing.id} (${existing.name})`);
      return existing.id;
    }
  }

  // Create without slug — instance has org_slugs_disabled. The org_id
  // becomes the canonical identifier used by getCurrentTenant().
  const created = await apiCall("POST", "/organizations", {
    name: ORG_NAME,
    created_by: userId,
  });
  if (!created.ok) {
    throw new Error(`org create failed: ${created.status} ${created.text}`);
  }
  console.log(`+ org created: ${created.json.id} (${created.json.name})`);
  return created.json.id;
}

/**
 * Marks a user's primary email as verified via Clerk Backend API.
 * Default behavior when creating users programmatically is unverified
 * emails — which forces email-OTP at sign-in. Demo accounts use email
 * addresses we don't operate an inbox for, so we mark verified at
 * provision time.
 */
async function verifyPrimaryEmail(userId) {
  const userRes = await apiCall("GET", `/users/${userId}`);
  if (!userRes.ok || !userRes.json) {
    console.warn(`  ⚠ could not load user to verify email: ${userRes.status}`);
    return;
  }
  const emails = userRes.json.email_addresses ?? [];
  const primary =
    emails.find((e) => e.id === userRes.json.primary_email_address_id) ??
    emails[0];
  if (!primary) {
    console.warn(`  ⚠ user has no email addresses`);
    return;
  }
  if (primary.verification?.status === "verified") {
    console.log(`  ✓ email already verified: ${primary.email_address}`);
    return;
  }
  // Clerk's Backend API supports verifying an email via the email
  // addresses endpoint with the "admin" strategy (since we're using
  // the secret key, we're acting as admin).
  const verify = await apiCall(
    "POST",
    `/email_addresses/${primary.id}/verify`,
    { strategy: "admin" },
  );
  if (verify.ok) {
    console.log(`  + email verified (admin): ${primary.email_address}`);
    return;
  }
  // Fall back: some Clerk plan tiers don't expose the verify endpoint
  // and require PATCHing the email_address directly.
  const patch = await apiCall("PATCH", `/email_addresses/${primary.id}`, {
    verified: true,
  });
  if (patch.ok) {
    console.log(`  + email verified (patch): ${primary.email_address}`);
    return;
  }
  console.warn(
    `  ⚠ email verification failed via both /verify and PATCH endpoints. Verify path: ${verify.status} ${verify.text.slice(0, 200)}. Patch path: ${patch.status} ${patch.text.slice(0, 200)}`,
  );
}

async function findOrCreateUser() {
  // Clerk supports email_address[] query param to find existing users
  const list = await apiCall(
    "GET",
    `/users?email_address[]=${encodeURIComponent(USER_EMAIL)}`,
  );
  if (list.ok && Array.isArray(list.json) && list.json.length > 0) {
    const existing = list.json[0];
    // Always (re-)verify the email — cheap, idempotent, and the most
    // common cause of "stuck at email OTP" during demo testing.
    await verifyPrimaryEmail(existing.id);
    if (RESET_PASSWORD) {
      const password = generatePassword();
      const updated = await apiCall("PATCH", `/users/${existing.id}`, {
        password,
        sign_out_of_other_sessions: true,
        skip_password_checks: false,
      });
      if (!updated.ok) {
        throw new Error(`password reset failed: ${updated.status} ${updated.text}`);
      }
      console.log(`↻ user exists: ${existing.id} (password reset)`);
      return { id: existing.id, isNew: true, password };
    }
    console.log(`✓ user exists: ${existing.id} (${USER_EMAIL})`);
    return { id: existing.id, isNew: false, password: null };
  }

  const password = generatePassword();
  const created = await apiCall("POST", "/users", {
    email_address: [USER_EMAIL],
    password,
    first_name: USER_FIRST,
    last_name: USER_LAST,
    skip_password_checks: false,
    skip_password_requirement: false,
  });
  if (!created.ok) {
    throw new Error(`user create failed: ${created.status} ${created.text}`);
  }
  console.log(`+ user created: ${created.json.id} (${USER_EMAIL})`);
  // Mark email verified so the demo user can sign in with password
  // only (no email OTP). Demo accounts use email addresses we don't
  // operate an inbox for.
  await verifyPrimaryEmail(created.json.id);
  return { id: created.json.id, isNew: true, password };
}

async function ensureMembership(orgId, userId) {
  // Check existing memberships first
  const list = await apiCall(
    "GET",
    `/organizations/${orgId}/memberships?limit=100`,
  );
  if (list.ok && Array.isArray(list.json?.data)) {
    const existing = list.json.data.find(
      (m) => m.public_user_data?.user_id === userId,
    );
    if (existing) {
      console.log(`✓ membership exists: user → org (${existing.role})`);
      return;
    }
  }

  const created = await apiCall("POST", `/organizations/${orgId}/memberships`, {
    user_id: userId,
    role: "org:admin",
  });
  if (!created.ok) {
    throw new Error(`membership create failed: ${created.status} ${created.text}`);
  }
  console.log(`+ membership created: user → org (org:admin)`);
}

async function updateTenantSlug(clerkOrgId) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "DATABASE_URL missing — cannot update tenants.slug. The Clerk org exists but won't resolve to a tenant yet.",
    );
  }
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    // First check current state
    const before = await client.query(
      `SELECT id, slug, is_demo FROM tenants WHERE slug = $1 OR slug = $2 LIMIT 1`,
      [TENANT_SLUG_BEFORE, clerkOrgId],
    );
    if (before.rowCount === 0) {
      throw new Error(
        `No tenant found with slug '${TENANT_SLUG_BEFORE}' or '${clerkOrgId}'. Run seed-demo-tenant.ts first.`,
      );
    }
    const row = before.rows[0];
    if (row.slug === clerkOrgId) {
      console.log(`✓ tenant slug already maps to org: ${clerkOrgId}`);
      return;
    }
    // Update slug to match the Clerk org_id
    const upd = await client.query(
      `UPDATE tenants SET slug = $1 WHERE id = $2 RETURNING slug`,
      [clerkOrgId, row.id],
    );
    if (upd.rowCount !== 1) {
      throw new Error(`tenant slug update affected ${upd.rowCount} rows`);
    }
    console.log(
      `+ tenant slug updated: '${TENANT_SLUG_BEFORE}' → '${clerkOrgId}'`,
    );
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(`\n→ Provisioning Mallin demo account in Clerk + Supabase\n`);

  // Create user first (Clerk requires created_by for orgs)
  const { id: userId, isNew, password } = await findOrCreateUser();

  // Then create or find the org
  const orgId = await findOrCreateOrg(userId);

  await ensureMembership(orgId, userId);

  // Wire the Clerk org_id into Supabase's tenants.slug so the tenant
  // context lookup resolves. Idempotent — skips if already mapped.
  await updateTenantSlug(orgId);

  console.log(`\n✓ Provisioning complete.\n`);
  console.log(`Credentials:`);
  console.log(`  Login URL: https://mallin.io/sign-in`);
  console.log(`  Email:     ${USER_EMAIL}`);
  if (isNew && password) {
    console.log(`  Password:  ${password}`);
    console.log(`\n  ⚠ This password is shown only once. Copy it now.`);
    console.log(`  You can reset it any time from the Clerk dashboard.`);
  } else {
    console.log(`  Password:  (user already existed — unchanged)`);
    console.log(`\n  If you forgot it, reset via Clerk dashboard or use`);
    console.log(`  the password reset flow at /sign-in.`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(`\n✗ Provisioning failed: ${err.message}`);
  process.exit(1);
});
