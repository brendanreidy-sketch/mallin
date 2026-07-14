/**
 * Phase 1 audit: enumerate users + orgs in both the dev (sk_test_*)
 * and live (sk_live_*) Clerk instances side-by-side.
 *
 *   LIVE_CLERK_SECRET="sk_live_..." node scripts/clerk/audit-instances.mjs
 *
 * Read-only. No mutations. Output is the migration plan.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const DEV = process.env.CLERK_SECRET_KEY;
const LIVE = process.env.LIVE_CLERK_SECRET;

if (!DEV?.startsWith("sk_test_")) {
  console.error("✗ .env.local CLERK_SECRET_KEY isn't sk_test_* — already migrated?");
  console.error(`  found: ${DEV?.slice(0, 8) ?? "(missing)"}…`);
  process.exit(1);
}
if (!LIVE?.startsWith("sk_live_")) {
  console.error("✗ LIVE_CLERK_SECRET env var missing or not sk_live_*");
  process.exit(1);
}

async function listUsers(secret) {
  const out = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `https://api.clerk.com/v1/users?limit=100&offset=${offset}&order_by=created_at`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const data = await r.json();
    if (!r.ok) throw new Error(`users: ${r.status} ${JSON.stringify(data)}`);
    out.push(...data);
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

async function listOrgs(secret) {
  const out = [];
  let offset = 0;
  while (true) {
    const r = await fetch(
      `https://api.clerk.com/v1/organizations?limit=100&offset=${offset}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const data = await r.json();
    if (!r.ok) throw new Error(`orgs: ${r.status} ${JSON.stringify(data)}`);
    out.push(...(data.data ?? data));
    const len = (data.data ?? data).length;
    if (len < 100) break;
    offset += 100;
  }
  return out;
}

function userEmail(u) {
  const primary =
    u.email_addresses?.find((e) => e.id === u.primary_email_address_id) ??
    u.email_addresses?.[0];
  return primary?.email_address ?? "(no email)";
}

function userName(u) {
  const f = (u.first_name ?? "").trim();
  const l = (u.last_name ?? "").trim();
  return `${f} ${l}`.trim() || u.username || "(no name)";
}

console.log("Fetching dev Clerk inventory…");
const [devUsers, devOrgs] = await Promise.all([listUsers(DEV), listOrgs(DEV)]);
console.log(`  dev:  ${devUsers.length} users, ${devOrgs.length} orgs`);

console.log("Fetching live Clerk inventory…");
const [liveUsers, liveOrgs] = await Promise.all([listUsers(LIVE), listOrgs(LIVE)]);
console.log(`  live: ${liveUsers.length} users, ${liveOrgs.length} orgs`);

console.log(`\n${"=".repeat(78)}`);
console.log("USERS — dev side");
console.log("=".repeat(78));
for (const u of devUsers) {
  const email = userEmail(u);
  const inLive = liveUsers.some((l) => userEmail(l).toLowerCase() === email.toLowerCase());
  console.log(`  ${inLive ? "✓ in live" : "✗ MISSING "} | ${email.padEnd(40)} | ${userName(u)}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log("USERS — live side (any not present in dev are new / safe to leave alone)");
console.log("=".repeat(78));
for (const u of liveUsers) {
  const email = userEmail(u);
  const inDev = devUsers.some((d) => userEmail(d).toLowerCase() === email.toLowerCase());
  console.log(`  ${inDev ? "(also dev)" : "(live only)"} | ${email.padEnd(40)} | ${userName(u)}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log("ORGS — dev side");
console.log("=".repeat(78));
for (const o of devOrgs) {
  const inLive = liveOrgs.some((l) => l.name === o.name);
  console.log(`  ${inLive ? "✓ in live" : "✗ MISSING "} | ${o.name}`);
}

console.log(`\n${"=".repeat(78)}`);
console.log("MIGRATION PLAN");
console.log("=".repeat(78));
const missing = devUsers.filter(
  (d) =>
    !liveUsers.some(
      (l) => userEmail(l).toLowerCase() === userEmail(d).toLowerCase(),
    ),
);
if (missing.length === 0) {
  console.log("  ✓ all dev users already exist in live — no user migration needed");
} else {
  console.log(`  ${missing.length} user(s) to migrate from dev → live:`);
  for (const u of missing) {
    console.log(`    - ${userEmail(u)}  (${userName(u)})`);
  }
}
console.log("");
