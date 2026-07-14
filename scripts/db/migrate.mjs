#!/usr/bin/env node
/**
 * Minimal migration runner for supabase/migrations/*.sql.
 *
 * Why this exists: migrations were applied by hand-written one-off scripts and
 * nothing tracked what had run against prod — so a migration could be forgotten
 * while its code (and even a blog post) shipped. This gives one command, with a
 * record of what's applied.
 *
 *   npm run db:status    → list every migration as APPLIED / PENDING
 *   npm run db:migrate   → apply every PENDING migration, in order, each in its
 *                          own transaction, recording it when it succeeds
 *   npm run db:baseline  → record ALL current migrations as applied WITHOUT
 *                          running them. One-time adoption step for a DB that
 *                          was already hand-migrated (assumes prod is current).
 *
 * Tracking table: schema_migrations(version text pk, applied_at timestamptz).
 * `version` is the full filename, so duplicate numeric prefixes (e.g. two 037_*)
 * stay distinct. Uses DATABASE_URL — run with --env-file=.env.local.
 */
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const MIG_DIR = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "migrations",
);

const files = () =>
  readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();

async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL not set (run with --env-file=.env.local)");
    process.exit(1);
  }
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`create table if not exists schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  )`);
  return c;
}

const appliedSet = async (c) =>
  new Set((await c.query("select version from schema_migrations")).rows.map((r) => r.version));

async function status(c) {
  const done = await appliedSet(c);
  const all = files();
  let pending = 0;
  for (const f of all) {
    const ok = done.has(f);
    if (!ok) pending++;
    console.log(`${ok ? "✓ applied" : "• PENDING"}  ${f}`);
  }
  console.log(`\n${all.length} migrations · ${all.length - pending} applied · ${pending} pending`);
}

async function up(c) {
  const done = await appliedSet(c);
  const pending = files().filter((f) => !done.has(f));
  if (!pending.length) return console.log("Up to date — nothing to apply.");
  for (const f of pending) {
    process.stdout.write(`applying ${f} … `);
    try {
      await c.query("begin");
      await c.query(readFileSync(join(MIG_DIR, f), "utf8"));
      await c.query("insert into schema_migrations(version) values ($1)", [f]);
      await c.query("commit");
      console.log("ok");
    } catch (e) {
      await c.query("rollback");
      console.log("FAILED");
      console.error(e.message);
      process.exit(1);
    }
  }
  console.log(`\nApplied ${pending.length} migration(s).`);
}

async function baseline(c) {
  const all = files();
  for (const f of all) {
    await c.query(
      "insert into schema_migrations(version) values ($1) on conflict do nothing", [f]);
  }
  console.log(`Baselined ${all.length} migration(s) as applied (no SQL run).`);
  console.log("Assumes prod is already current — run this once when adopting the runner.");
}

const cmd = process.argv[2];
const c = await connect();
try {
  if (cmd === "status") await status(c);
  else if (cmd === "up") await up(c);
  else if (cmd === "baseline") await baseline(c);
  else {
    console.error("usage: migrate.mjs <status|up|baseline>");
    process.exit(1);
  }
} finally {
  await c.end();
}
