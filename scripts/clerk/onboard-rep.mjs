/**
 * Onboard a rep end-to-end: provision in live Clerk + send a branded
 * Mallin welcome email with sign-in credentials.
 *
 * STATUS: temporary-password onboarding v1.
 *
 * Acceptable for design-partner phase. NOT the long-term doctrine —
 * future iterations (in order):
 *   v2  magic-link-only welcome (no password in email at all)
 *   v3  Google SSO ("Continue with Google" on /sign-in)
 *   v4  passkey enrollment on first sign-in
 *   v5  SCIM provisioning for enterprise tenants
 *
 * See memory: onboarding_doctrine.md
 *
 * Doctrine for v1: the rep's real work email is their Clerk identity.
 * Brendan doesn't intermediate the email; Resend sends it directly to
 * the rep. Temporary password is burned after first sign-in (rep
 * rotates under their profile).
 *
 * Usage — fresh rep (most common):
 *
 *   node scripts/clerk/onboard-rep.mjs \
 *     --email jessica.janes@macerich.com \
 *     --name "Jessica Janes" \
 *     --deal-url "https://mallin.io/prep?dealId=..." \
 *     --send
 *
 * Default is --dry-run (writes the email HTML to scripts/_tmp/ for
 * preview, doesn't actually send). Add --send to deliver via Resend.
 *
 * Other flags:
 *   --current-email <email>   migrate an existing rep's primary email
 *   --org-name <name>         override default org name "Mallin Demo · <Name>"
 *   --no-provision            skip Clerk + Supabase provisioning, just
 *                             send the email (requires --password)
 *   --password <value>        use a specific password instead of
 *                             generating one (use with --no-provision)
 *   --from <email>            override sender (defaults to RESEND_FROM_EMAIL,
 *                             then to no-reply@mallin.io)
 *   --cc <email>              CC yourself on the welcome email
 *
 * Provisioning chain (when not --no-provision):
 *   1. Clerk user (real email as primary, admin-verified)
 *   2. Clerk org (default "Mallin Demo · <Name>")
 *   3. Membership: user → org as org:admin
 *   4. Supabase tenants row (slug = clerk org_id, is_demo=true)
 *   5. Password reset
 *   6. Branded welcome email via Resend
 *
 * After this completes, the rep can sign in at /sign-in, land on
 * /cockpit, resolve to their tenant, and see the empty "workspace is
 * ready" state (or a deal if seeded). No "infinite redirect" / no
 * orgId-missing failure mode.
 *
 * Requires in env (.env.local):
 *   CLERK_SECRET_KEY        (sk_live_*)
 *   DATABASE_URL            (Supabase postgres connection string)
 *   RESEND_API_KEY          (re_*)
 *   RESEND_FROM_EMAIL       (optional override)
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
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
const NAME = arg("name");
const CURRENT_EMAIL = arg("current-email");
const ORG_NAME_OVERRIDE = arg("org-name");
const PASSWORD_OVERRIDE = arg("password");
const DEAL_URL = arg("deal-url");
const FROM_OVERRIDE = arg("from");
const CC = arg("cc");
const DRY_RUN = flag("dry-run") || !flag("send");
const NO_PROVISION = flag("no-provision");

const ORG_NAME = ORG_NAME_OVERRIDE ?? `Mallin Demo · ${NAME ?? ""}`;

if (!EMAIL || !NAME) {
  console.error("✗ Usage: onboard-rep.mjs --email <email> --name \"<Full Name>\" [flags]");
  console.error("  See script header for full flag list. Default is --dry-run; add --send to deliver.");
  process.exit(1);
}

const CLERK = process.env.LIVE_CLERK_SECRET ?? process.env.CLERK_SECRET_KEY;
if (!NO_PROVISION && !CLERK?.startsWith("sk_live_")) {
  console.error("✗ live Clerk secret required (sk_live_* in CLERK_SECRET_KEY or LIVE_CLERK_SECRET)");
  process.exit(1);
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!NO_PROVISION && !DATABASE_URL) {
  console.error("✗ DATABASE_URL missing — needed for Supabase tenant creation");
  process.exit(1);
}
const RESEND = process.env.RESEND_API_KEY;
if (!DRY_RUN && !RESEND) {
  console.error("✗ RESEND_API_KEY missing — set in .env.local to send. Use --dry-run to preview.");
  process.exit(1);
}

const FROM = FROM_OVERRIDE ?? process.env.RESEND_FROM_EMAIL ?? "no-reply@mallin.io";
const FIRST_NAME = NAME.split(" ")[0];

// ─── Clerk helpers ────────────────────────────────────────────────────────
const CH = { Authorization: `Bearer ${CLERK}`, "Content-Type": "application/json" };
async function clerk(method, path, body) {
  const r = await fetch(`https://api.clerk.com/v1${path}`, {
    method, headers: CH, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, json, text };
}
function generatePassword() {
  // 20 chars; no spaces, no quotes, no backslash, no $ — safe for copy-paste in email
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
function primaryEmail(u) {
  const p = u.email_addresses?.find((e) => e.id === u.primary_email_address_id);
  return p?.email_address ?? u.email_addresses?.[0]?.email_address ?? null;
}

// ─── 1. provision (unless --no-provision) ─────────────────────────────────
let password = PASSWORD_OVERRIDE;
let userId = null;
let finalEmail = EMAIL;

if (!NO_PROVISION) {
  console.log(`→ Provisioning ${NAME} <${EMAIL}> in live Clerk…`);

  // Find existing user by either CURRENT_EMAIL (migration) or EMAIL
  const lookupEmail = CURRENT_EMAIL ?? EMAIL;
  let user;
  const list = await clerk("GET", `/users?email_address=${encodeURIComponent(lookupEmail)}`);
  if (list.ok && Array.isArray(list.json) && list.json.length > 0) {
    user = list.json[0];
    userId = user.id;
    console.log(`  ↻ exists: ${userId}`);
  } else {
    const [firstName, ...rest] = NAME.split(" ");
    const tempPw = generatePassword();
    const c = await clerk("POST", "/users", {
      email_address: [EMAIL],
      password: tempPw,
      first_name: firstName,
      last_name: rest.join(" ") || "Partner",
    });
    if (!c.ok) { console.error(`✗ user create: ${c.status} ${c.text}`); process.exit(1); }
    user = c.json;
    userId = user.id;
    console.log(`  + created: ${userId}`);
    // admin-verify primary
    const primary = user.email_addresses?.[0];
    if (primary) {
      await clerk("POST", `/email_addresses/${primary.id}/verify`, { strategy: "admin" });
      await clerk("PATCH", `/email_addresses/${primary.id}`, { verified: true });
    }
  }

  // Migrate email if --current-email and --email differ
  if (CURRENT_EMAIL && CURRENT_EMAIL.toLowerCase() !== EMAIL.toLowerCase()) {
    if (primaryEmail(user)?.toLowerCase() !== EMAIL.toLowerCase()) {
      console.log(`  → Migrating primary email → ${EMAIL}`);
      const addRes = await clerk("POST", "/email_addresses", {
        user_id: userId, email_address: EMAIL, verified: true, primary: false,
      });
      let newEmailId;
      if (addRes.ok) {
        newEmailId = addRes.json.id;
        await clerk("POST", `/email_addresses/${newEmailId}/verify`, { strategy: "admin" });
        await clerk("PATCH", `/email_addresses/${newEmailId}`, { verified: true });
      } else if (addRes.status === 422) {
        const refreshed = await clerk("GET", `/users/${userId}`);
        user = refreshed.json;
        newEmailId = user.email_addresses?.find(
          (e) => e.email_address.toLowerCase() === EMAIL.toLowerCase(),
        )?.id;
      }
      if (newEmailId) {
        await clerk("PATCH", `/users/${userId}`, { primary_email_address_id: newEmailId });
        const refreshed = await clerk("GET", `/users/${userId}`);
        const stale = refreshed.json.email_addresses?.filter((e) => e.id !== newEmailId) ?? [];
        for (const e of stale) await clerk("DELETE", `/email_addresses/${e.id}`);
        console.log(`  ✓ primary = ${EMAIL}, removed ${stale.length} old emails`);
      }
    }
  }

  // Reset password unless overridden
  if (!password) {
    password = generatePassword();
    const pw = await clerk("PATCH", `/users/${userId}`, {
      password, sign_out_of_other_sessions: true, skip_password_checks: false,
    });
    if (!pw.ok) { console.error(`✗ pw reset: ${pw.status} ${pw.text}`); process.exit(1); }
    console.log(`  ✓ password reset`);
  }

  // ── Clerk org ──────────────────────────────────────────────────────────
  console.log(`\n→ Provisioning Clerk org "${ORG_NAME}"…`);
  let orgId;
  {
    const list = await clerk("GET", `/organizations?query=${encodeURIComponent(ORG_NAME)}&limit=10`);
    if (list.ok && Array.isArray(list.json?.data)) {
      const ex = list.json.data.find((o) => o.name === ORG_NAME);
      if (ex) {
        orgId = ex.id;
        console.log(`  ↻ exists: ${orgId}`);
      }
    }
    if (!orgId) {
      const c = await clerk("POST", "/organizations", { name: ORG_NAME, created_by: userId });
      if (!c.ok) { console.error(`✗ org create: ${c.status} ${c.text}`); process.exit(1); }
      orgId = c.json.id;
      console.log(`  + created: ${orgId}`);
    }
  }

  // ── Membership: user → org as org:admin ────────────────────────────────
  console.log(`\n→ Ensuring membership (org:admin)…`);
  {
    const list = await clerk("GET", `/organizations/${orgId}/memberships?limit=100`);
    const exists = list.ok && Array.isArray(list.json?.data) &&
      list.json.data.some((m) => m.public_user_data?.user_id === userId);
    if (exists) {
      console.log(`  ↻ exists`);
    } else {
      const c = await clerk("POST", `/organizations/${orgId}/memberships`, {
        user_id: userId, role: "org:admin",
      });
      if (!c.ok) { console.error(`✗ membership: ${c.status} ${c.text}`); process.exit(1); }
      console.log(`  + created (org:admin)`);
    }
  }

  // ── Supabase tenant row ────────────────────────────────────────────────
  console.log(`\n→ Provisioning Supabase tenant (slug = ${orgId})…`);
  let tenantId;
  {
    const client = new pg.Client({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      const ex = await client.query(
        `SELECT id, slug FROM tenants WHERE slug = $1 LIMIT 1`,
        [orgId],
      );
      if (ex.rowCount > 0) {
        tenantId = ex.rows[0].id;
        console.log(`  ↻ exists: ${tenantId}`);
      } else {
        const ins = await client.query(
          `INSERT INTO tenants (slug, name, is_demo, crm_provider, enabled_sinks)
           VALUES ($1, $2, true, 'hubspot', ARRAY['slack'])
           RETURNING id`,
          [orgId, ORG_NAME],
        );
        tenantId = ins.rows[0].id;
        console.log(`  + created: ${tenantId} (slug=${orgId}, is_demo=true)`);
      }

      // Integrity check — verify the tenant exists + slug matches before
      // we report success. Per integrity_preserving_friction doctrine:
      // verification belongs as a step in the operation, not separate.
      const verify = await client.query(
        `SELECT id, slug FROM tenants WHERE slug = $1 LIMIT 1`,
        [orgId],
      );
      if (verify.rowCount === 0 || verify.rows[0].id !== tenantId) {
        console.error(`✗ tenant verification failed`);
        process.exit(1);
      }
      console.log(`  ✓ verified`);
    } finally {
      await client.end();
    }
  }

  // Track for the final output block
  globalThis.__onboard_orgId = orgId;
  globalThis.__onboard_tenantId = tenantId;
} else {
  if (!password) {
    console.error("✗ --no-provision requires --password (we need to know what to put in the email)");
    process.exit(1);
  }
  console.log(`→ Skipping provision; composing email with provided password`);
}

// ─── 2. Render Mallin-branded HTML email ──────────────────────────────────
const SIGN_IN_URL = "https://mallin.io/sign-in";
const html = renderEmailHtml({
  firstName: FIRST_NAME,
  email: finalEmail,
  password,
  signInUrl: SIGN_IN_URL,
  dealUrl: DEAL_URL,
});
const text = renderEmailText({
  firstName: FIRST_NAME,
  email: finalEmail,
  password,
  signInUrl: SIGN_IN_URL,
  dealUrl: DEAL_URL,
});
const subject = `Your Mallin access${DEAL_URL ? " — call prep ready" : ""}`;

// ─── 3. Send or preview ───────────────────────────────────────────────────
const orgId = globalThis.__onboard_orgId;
const tenantId = globalThis.__onboard_tenantId;

if (DRY_RUN) {
  mkdirSync("scripts/_tmp", { recursive: true });
  const slug = EMAIL.replace(/[^a-z0-9]/gi, "_");
  const previewPath = `scripts/_tmp/email-preview-${slug}.html`;
  writeFileSync(previewPath, html);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  DRY-RUN — no email sent`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  to:         ${EMAIL}`);
  console.log(`  from:       ${FROM}`);
  console.log(`  subject:    ${subject}`);
  console.log(`  preview:    ${previewPath}`);
  console.log(`  password:   ${password}`);
  if (userId)   console.log(`  user_id:    ${userId}`);
  if (orgId)    console.log(`  org_id:     ${orgId}`);
  if (tenantId) console.log(`  tenant_id:  ${tenantId}`);
  console.log(`${"=".repeat(72)}`);
  console.log(`\nOpen the preview in a browser:`);
  console.log(`  open ${previewPath}\n`);
  console.log(`When ready to actually send, re-run with --send.\n`);
} else {
  console.log(`\n→ Sending via Resend to ${EMAIL}…`);
  const body = { from: FROM, to: [EMAIL], subject, html, text };
  if (CC) body.cc = [CC];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { console.error(`✗ Resend: ${r.status} ${JSON.stringify(data)}`); process.exit(1); }
  console.log(`✓ sent — Resend id: ${data.id}`);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ONBOARDING COMPLETE`);
  console.log(`${"=".repeat(72)}`);
  console.log(`  to:         ${EMAIL}`);
  console.log(`  from:       ${FROM}`);
  if (CC)       console.log(`  cc:         ${CC}`);
  if (userId)   console.log(`  user_id:    ${userId}`);
  if (orgId)    console.log(`  org_id:     ${orgId}`);
  if (tenantId) console.log(`  tenant_id:  ${tenantId}`);
  console.log(`  password:   ${password}  (rep should rotate after first sign-in)`);
  console.log(`${"=".repeat(72)}\n`);
}

// ─── Email renderers ──────────────────────────────────────────────────────

function renderEmailHtml({ firstName, email, password, signInUrl, dealUrl }) {
  // Mallin brand: dark surface (#0e0e11), panels (#131318), text (#e8e8ed
  // primary / #9898a3 muted), accent (#f4a261). Inter typeface with
  // system fallback. Email-safe — no external stylesheet, no images,
  // table-based layout for client compatibility.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Mallin access</title>
</head>
<body style="margin:0;padding:0;background:#0e0e11;color:#e8e8ed;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0e0e11;">
  <tr><td align="center" style="padding:40px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#131318;border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;">

      <!-- Header -->
      <tr><td style="padding:32px 36px 18px;border-bottom:0.5px solid rgba(255,255,255,0.06);">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;">
            <span style="display:inline-block;width:18px;height:18px;background:#f4a261;border-radius:4px;vertical-align:middle;"></span>
            <span style="font-size:18px;font-weight:700;letter-spacing:-0.015em;margin-left:10px;vertical-align:middle;color:#e8e8ed;">Mallin</span>
          </td>
        </tr></table>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:30px 36px 8px;">
        <h1 style="margin:0 0 14px;font-size:22px;font-weight:600;letter-spacing:-0.018em;line-height:1.3;color:#e8e8ed;">Your account is ready, ${escapeHtml(firstName)}.</h1>
        <p style="margin:0 0 24px;font-size:14.5px;line-height:1.6;color:#9898a3;">
          You can sign in at <a href="${signInUrl}" style="color:#f4a261;text-decoration:none;">mallin.io/sign-in</a> using the credentials below.
        </p>
      </td></tr>

      <!-- Credentials -->
      <tr><td style="padding:0 36px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f12;border:0.5px solid rgba(255,255,255,0.1);border-radius:10px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;font-size:10.5px;color:#6a6a76;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Email</div>
            <div style="font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;font-size:14px;color:#e8e8ed;word-break:break-all;margin-bottom:18px;">${escapeHtml(email)}</div>
            <div style="font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;font-size:10.5px;color:#6a6a76;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Temporary password</div>
            <div style="font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;font-size:14px;color:#f4a261;word-break:break-all;">${escapeHtml(password)}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="padding:14px 36px 8px;" align="left">
        <a href="${signInUrl}" style="display:inline-block;padding:11px 22px;background:rgba(244,162,97,0.12);border:0.5px solid rgba(244,162,97,0.45);border-radius:7px;color:#f4a261;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;font-weight:600;letter-spacing:0.04em;text-decoration:none;">Sign in &rarr;</a>
      </td></tr>

      <!-- First-sign-in note -->
      <tr><td style="padding:20px 36px 8px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#9898a3;">
          On first sign-in, Mallin will send a 6-digit code to <span style="color:#c8c8d3;">${escapeHtml(email)}</span> to verify it&rsquo;s you. After that, your session lasts about a week. Please change the password under your profile once you&rsquo;re in.
        </p>
      </td></tr>

      ${dealUrl ? `
      <!-- Deal context -->
      <tr><td style="padding:18px 36px 0;">
        <div style="border-top:0.5px dashed rgba(255,255,255,0.08);padding-top:20px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;color:#6a6a76;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Your call prep</div>
          <p style="margin:0 0 12px;font-size:13.5px;line-height:1.6;color:#e8e8ed;">
            We&rsquo;ve loaded the pre-call brief for your upcoming meeting.
          </p>
          <a href="${dealUrl}" style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;color:#f4a261;text-decoration:none;word-break:break-all;">${escapeHtml(dealUrl)}</a>
        </div>
      </td></tr>
      ` : ""}

      <!-- Footer -->
      <tr><td style="padding:28px 36px 32px;">
        <div style="border-top:0.5px dashed rgba(255,255,255,0.08);padding-top:16px;display:flex;justify-content:space-between;font-size:12px;color:#6a6a76;">
          <span>Questions? <a href="mailto:hello@mallin.io" style="color:#c8c8d3;text-decoration:underline;">hello@mallin.io</a></span>
        </div>
      </td></tr>

    </table>
    <p style="font-size:11px;color:#5a5a66;margin:18px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;">
      Mallin &middot; the operational layer of the revenue organization
    </p>
  </td></tr>
</table>
</body>
</html>`;
}

function renderEmailText({ firstName, email, password, signInUrl, dealUrl }) {
  return `Your account is ready, ${firstName}.

Sign in at ${signInUrl}

  Email:    ${email}
  Password: ${password}

On first sign-in, Mallin will send a 6-digit code to ${email} to verify
it's you. After that, your session lasts about a week. Please change
the password under your profile once you're in.
${dealUrl ? `\nYour call prep is loaded:\n  ${dealUrl}\n` : ""}
Questions? hello@mallin.io

— Mallin · the operational layer of the revenue organization
`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
