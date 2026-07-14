/**
 * Issue rep credentials — the canonical "give me sign-in info to email
 * to a design partner" command.
 *
 * Doctrine: the rep's REAL work email is their Clerk identity. No
 * brendan+<name>@mallin.io impersonation. Brendan emails the rep
 * directly with their credentials; the rep signs in/out on their own
 * at mallin.io/sign-in.
 *
 * Usage — for an existing rep (look up by current email):
 *   LIVE_CLERK_SECRET=... node scripts/clerk/issue-rep-credentials.mjs \
 *     --current-email brendan+jessica@mallin.io \
 *     --new-email     jessica.janes@macerich.com
 *
 * Usage — for an existing rep where email is already correct:
 *   LIVE_CLERK_SECRET=... node scripts/clerk/issue-rep-credentials.mjs \
 *     --current-email jessica.janes@macerich.com
 *
 * Usage — by user id:
 *   LIVE_CLERK_SECRET=... node scripts/clerk/issue-rep-credentials.mjs \
 *     --user-id user_3E4woCwexxgJtQx8Qtx3hCDVhWJ
 *
 * What it does:
 *   1. Find the user by --user-id or --current-email
 *   2. If --new-email provided AND different from current primary:
 *      - Add the new email to the user (admin-verified)
 *      - Set it as primary
 *      - Remove any other email addresses (clean identity)
 *   3. Generate a fresh strong password
 *   4. Reset the user's password
 *   5. Print credentials + a copy-paste email template
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

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

const USER_ID = arg("user-id");
const CURRENT_EMAIL = arg("current-email");
const NEW_EMAIL = arg("new-email");

if (!USER_ID && !CURRENT_EMAIL) {
  console.error("✗ provide either --user-id or --current-email");
  process.exit(1);
}

// Read live secret from LIVE_CLERK_SECRET first, then CLERK_SECRET_KEY
// (which is sk_live_* after Phase 1's .env.local swap). Hard-fail if
// either is sk_test_* — this script can only run against live Clerk.
const SECRET = process.env.LIVE_CLERK_SECRET ?? process.env.CLERK_SECRET_KEY;
if (!SECRET?.startsWith("sk_live_")) {
  console.error("✗ live Clerk secret missing (need LIVE_CLERK_SECRET or sk_live_* CLERK_SECRET_KEY)");
  if (SECRET?.startsWith("sk_test_")) {
    console.error("  Found sk_test_* — script refuses to run against dev instance.");
  }
  process.exit(1);
}

const CH = { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

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
  // 20 chars, mixed; avoid characters that look ambiguous in email
  // (no quotes, no backslash, no spaces, no $) so copy-paste is safe.
  const u = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = "abcdefghjkmnpqrstuvwxyz";
  const d = "23456789";
  const sym = "@#%&*-+=?";
  const all = u + l + d + sym;
  const b = randomBytes(20);
  let pw = u[b[0] % u.length] + l[b[1] % l.length] + d[b[2] % d.length] + sym[b[3] % sym.length];
  for (let i = 4; i < 20; i++) pw += all[b[i] % all.length];
  return pw;
}

function primaryEmail(user) {
  const p = user.email_addresses?.find((e) => e.id === user.primary_email_address_id);
  return p?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
}

// ─── 1. find user ─────────────────────────────────────────────────────────
let user;
if (USER_ID) {
  const r = await clerk("GET", `/users/${USER_ID}`);
  if (!r.ok) { console.error(`✗ get user: ${r.status} ${r.text}`); process.exit(1); }
  user = r.json;
} else {
  const r = await clerk("GET", `/users?email_address=${encodeURIComponent(CURRENT_EMAIL)}`);
  if (!r.ok || !Array.isArray(r.json) || r.json.length === 0) {
    console.error(`✗ user not found by email: ${CURRENT_EMAIL}`);
    process.exit(1);
  }
  user = r.json[0];
}
console.log(`✓ found user: ${user.id} (${primaryEmail(user)})`);

// ─── 2. email migration (if --new-email and different) ────────────────────
if (NEW_EMAIL && NEW_EMAIL.toLowerCase() !== primaryEmail(user)?.toLowerCase()) {
  console.log(`\n→ Migrating primary email → ${NEW_EMAIL}`);

  // Add new email
  const addRes = await clerk("POST", "/email_addresses", {
    user_id: user.id,
    email_address: NEW_EMAIL,
    verified: true,
    primary: false, // we'll set primary in a second step after admin-verify
  });
  let newEmailId;
  if (addRes.ok) {
    newEmailId = addRes.json.id;
    console.log(`  + added: ${NEW_EMAIL} (id=${newEmailId})`);
  } else if (addRes.status === 422) {
    // Already exists on this user — find it
    const refreshed = await clerk("GET", `/users/${user.id}`);
    user = refreshed.json;
    const existing = user.email_addresses?.find(
      (e) => e.email_address.toLowerCase() === NEW_EMAIL.toLowerCase(),
    );
    if (!existing) {
      console.error(`✗ email add failed: ${addRes.text}`);
      process.exit(1);
    }
    newEmailId = existing.id;
    console.log(`  ↻ already on user: ${NEW_EMAIL} (id=${newEmailId})`);
  } else {
    console.error(`✗ email add failed: ${addRes.status} ${addRes.text}`);
    process.exit(1);
  }

  // Admin-verify the new email (so the rep can sign in without needing
  // to verify ownership of the address — they already do, it's theirs)
  await clerk("POST", `/email_addresses/${newEmailId}/verify`, { strategy: "admin" });
  await clerk("PATCH", `/email_addresses/${newEmailId}`, { verified: true });
  console.log(`  ✓ admin-verified`);

  // Set as primary
  const setPrimary = await clerk("PATCH", `/users/${user.id}`, {
    primary_email_address_id: newEmailId,
  });
  if (!setPrimary.ok) {
    console.error(`✗ set primary: ${setPrimary.status} ${setPrimary.text}`);
    process.exit(1);
  }
  console.log(`  ✓ set as primary`);

  // Remove other emails — clean identity, one email per rep
  const refreshed = await clerk("GET", `/users/${user.id}`);
  user = refreshed.json;
  const stale = user.email_addresses?.filter((e) => e.id !== newEmailId) ?? [];
  for (const e of stale) {
    const del = await clerk("DELETE", `/email_addresses/${e.id}`);
    if (del.ok) console.log(`  - removed: ${e.email_address}`);
    else console.warn(`  ⚠ couldn't remove ${e.email_address}: ${del.status}`);
  }
}

// ─── 3. reset password ────────────────────────────────────────────────────
const password = generatePassword();
const pwRes = await clerk("PATCH", `/users/${user.id}`, {
  password,
  sign_out_of_other_sessions: true,
  skip_password_checks: false,
});
if (!pwRes.ok) {
  console.error(`✗ password reset: ${pwRes.status} ${pwRes.text}`);
  process.exit(1);
}

// ─── 4. fresh user state + output ─────────────────────────────────────────
const finalRes = await clerk("GET", `/users/${user.id}`);
const finalUser = finalRes.json;
const finalEmail = primaryEmail(finalUser);
const firstName = finalUser.first_name?.trim() ?? "there";

console.log(`\n${"=".repeat(72)}`);
console.log(`  CREDENTIALS — forward this email to the rep`);
console.log(`${"=".repeat(72)}`);
console.log(`
Subject: Your Mallin access

Hi ${firstName},

You can sign in to Mallin here:

  https://mallin.io/sign-in

Email:    ${finalEmail}
Password: ${password}

You'll be asked to verify your email on first sign-in — a 6-digit code
will be sent to ${finalEmail}. After that, your session persists.

Reset your password any time at https://mallin.io/sign-in (use "forgot
password").

— Brendan
`);
console.log(`${"=".repeat(72)}`);
console.log(`  user_id:   ${finalUser.id}`);
console.log(`  email:     ${finalEmail}`);
console.log(`  password:  ${password}`);
console.log(`${"=".repeat(72)}\n`);
