/**
 * Cloudflare DNS helper — generic interface for adding/listing/deleting
 * DNS records on mallin.io (and other Cloudflare-managed zones).
 *
 * Reads CLOUDFLARE_API_TOKEN from .env.local. The token only needs
 * Zone:DNS:Edit scope; create or roll one at:
 *   https://dash.cloudflare.com/profile/api-tokens
 *
 * Commands:
 *
 *   node scripts/dns/cf.mjs list [--zone mallin.io]
 *   node scripts/dns/cf.mjs add  --type TXT --name @ --content "v=spf1 ..." [--zone mallin.io] [--ttl 3600]
 *   node scripts/dns/cf.mjs del  --id <record_id> [--zone mallin.io]
 *   node scripts/dns/cf.mjs verify --type TXT --name mallin.io --contains "v=spf1"
 *
 * verify polls dig until the record is visible (or 90s timeout).
 *
 * Designed to be used directly OR composed by other scripts (e.g. a
 * future provision-domain.mjs that sets up SPF + DKIM + DMARC for a
 * new tenant's mail-sending domain).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!TOKEN) {
  console.error("✗ CLOUDFLARE_API_TOKEN missing from .env.local");
  console.error("  Roll a Zone:DNS:Edit token at:");
  console.error("    https://dash.cloudflare.com/profile/api-tokens");
  process.exit(1);
}

const CF = "https://api.cloudflare.com/client/v4";
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return dflt;
}

async function cf(method, path, body) {
  const r = await fetch(`${CF}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!data.success) {
    const errs = data.errors?.map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`${method} ${path} → ${errs || r.status}`);
  }
  return data.result;
}

async function zoneId(name) {
  const zones = await cf("GET", `/zones?name=${encodeURIComponent(name)}`);
  if (!zones || zones.length === 0) throw new Error(`zone not found: ${name}`);
  return zones[0].id;
}

const cmd = process.argv[2];
const zone = arg("zone", "mallin.io");

if (cmd === "list") {
  const id = await zoneId(zone);
  const records = await cf("GET", `/zones/${id}/dns_records?per_page=100`);
  console.log(`${zone} (${records.length} records)`);
  console.log("─".repeat(78));
  for (const r of records) {
    const content = r.content.length > 60 ? r.content.slice(0, 57) + "…" : r.content;
    console.log(`${r.type.padEnd(7)} ${r.name.padEnd(28)} ${content}`);
    console.log(`         id=${r.id}`);
  }
} else if (cmd === "add") {
  const type = arg("type");
  const name = arg("name");
  const content = arg("content");
  const ttl = parseInt(arg("ttl", "3600"), 10);
  if (!type || !name || !content) {
    console.error("✗ usage: cf.mjs add --type TXT --name @ --content 'v=spf1 ...'");
    process.exit(1);
  }
  const id = await zoneId(zone);
  const created = await cf("POST", `/zones/${id}/dns_records`, {
    type,
    name,
    content,
    ttl,
    proxied: false,
  });
  console.log(`✓ added ${type} ${created.name} → ${created.content}`);
  console.log(`  id: ${created.id}`);
} else if (cmd === "del") {
  const recordId = arg("id");
  if (!recordId) {
    console.error("✗ usage: cf.mjs del --id <record_id>");
    process.exit(1);
  }
  const id = await zoneId(zone);
  await cf("DELETE", `/zones/${id}/dns_records/${recordId}`);
  console.log(`✓ deleted record ${recordId}`);
} else if (cmd === "verify") {
  const type = arg("type", "TXT");
  const name = arg("name", zone);
  const contains = arg("contains", "");
  console.log(`→ Polling dig for ${type} ${name} containing "${contains}"…`);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const out = execSync(`dig +short ${type} ${name}`, { encoding: "utf8" });
      if (out.includes(contains)) {
        console.log(`✓ DNS propagated:\n${out.trim()}`);
        process.exit(0);
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error("✗ timeout — record not visible within 90s");
  process.exit(1);
} else {
  console.error("✗ unknown command. usage:");
  console.error("    cf.mjs list");
  console.error("    cf.mjs add  --type TXT --name @ --content 'v=spf1 ...'");
  console.error("    cf.mjs del  --id <record_id>");
  console.error("    cf.mjs verify --type TXT --name mallin.io --contains 'v=spf1'");
  process.exit(1);
}
