#!/usr/bin/env node
/**
 * Runs scripts/db/sf_opportunity_links_migration.sql against the Supabase
 * project pointed to by NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node scripts/db/run_sf_links_migration.mjs           # apply
 *   node scripts/db/run_sf_links_migration.mjs --dry-run # print SQL only
 *
 * Idempotent: uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS,
 * so re-running is safe.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// Load .env.local (cheap parser, avoids extra deps)
const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n")
  .reduce((acc, line) => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = env.DATABASE_URL;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), "scripts/db/sf_opportunity_links_migration.sql");
const sql = readFileSync(sqlPath, "utf8");

const isDryRun = process.argv.includes("--dry-run");

if (isDryRun) {
  console.log("=== DRY RUN — no SQL will be executed ===\n");
  console.log(sql);
  console.log("\n=== End dry run. To apply, re-run without --dry-run. ===");
  process.exit(0);
}

console.log(`Applying migration to: ${url}`);
console.log(`SQL file: ${sqlPath}`);

const supa = createClient(url, key);

// Direct Postgres path (preferred). Requires DATABASE_URL — the pooled
// or direct connection string from Supabase project settings → Database.
if (!dbUrl) {
  console.error("");
  console.error("DATABASE_URL is missing in .env.local — can't apply via pg.");
  console.error("Either:");
  console.error("  (a) Add DATABASE_URL to .env.local, OR");
  console.error("  (b) Run the SQL manually in the Supabase SQL editor:");
  console.error(`      paste contents of ${sqlPath}`);
  process.exit(2);
}

const client = new pg.Client({
  connectionString: dbUrl,
  // Supabase pooler uses a self-signed cert in some plans; allow it.
  ssl: dbUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query(sql);
  console.log("Migration applied successfully.");
} catch (e) {
  console.error("Failed to apply migration:", e.message);
  console.error("");
  console.error("Fallback: paste the SQL into the Supabase SQL editor and run it manually.");
  console.error(`  File: ${sqlPath}`);
  process.exit(3);
} finally {
  await client.end();
}

// Sanity check: confirm the table exists.
const { data, error } = await supa
  .from("sf_opportunity_links")
  .select("id")
  .limit(0);
if (error) {
  console.error("Post-migration check failed:", error.message);
  process.exit(3);
}
console.log("Post-migration check: sf_opportunity_links table is queryable. ✓");
