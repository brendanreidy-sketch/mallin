/**
 * Review cockpit_events for the most recent demo session(s).
 *
 * After a design-partner session, run this to see the four trust-
 * formation interactions in order:
 *
 *   node scripts/db/review-cockpit-events.mjs
 *   node scripts/db/review-cockpit-events.mjs --user demo@mallin.io
 *   node scripts/db/review-cockpit-events.mjs --since "2026-05-12"
 *   node scripts/db/review-cockpit-events.mjs --session <session_id>
 *
 * Output is grouped by session, ordered by ms_since_load. Designed
 * to be read by a human, not piped to anything.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n")
  .reduce((a, l) => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) a[m[1]] = m[2];
    return a;
  }, {});

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const userFilter = arg("user");
const sessionFilter = arg("session");
const since = arg("since");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  // Build query dynamically based on filters
  const where = [];
  const params = [];
  if (userFilter) {
    // user could be an email or Clerk user_id — match against both
    params.push(userFilter);
    where.push(`(user_id = $${params.length} OR user_id ILIKE $${params.length})`);
  }
  if (sessionFilter) {
    params.push(sessionFilter);
    where.push(`session_id = $${params.length}`);
  }
  if (since) {
    params.push(since);
    where.push(`occurred_at >= $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const r = await client.query(
    `SELECT session_id, user_id, event_type, event_data, ms_since_load, occurred_at
       FROM cockpit_events
       ${whereSql}
       ORDER BY occurred_at DESC
       LIMIT 200`,
    params,
  );

  if (r.rowCount === 0) {
    console.log("\nNo events found.\n");
    process.exit(0);
  }

  // Group by session
  const sessions = new Map();
  for (const row of r.rows) {
    if (!sessions.has(row.session_id)) sessions.set(row.session_id, []);
    sessions.get(row.session_id).push(row);
  }

  for (const [sid, events] of sessions.entries()) {
    const sorted = [...events].sort(
      (a, b) => (a.ms_since_load ?? 0) - (b.ms_since_load ?? 0),
    );
    const first = sorted[0];
    console.log("");
    console.log("─".repeat(72));
    console.log(`  session ${sid}`);
    console.log(`  user    ${first.user_id}`);
    console.log(`  started ${new Date(first.occurred_at).toLocaleString()}`);
    console.log(`  events  ${sorted.length}`);
    console.log("─".repeat(72));
    for (const e of sorted) {
      const ms = String(e.ms_since_load ?? 0).padStart(6, " ");
      const type = e.event_type.padEnd(20, " ");
      const data = JSON.stringify(e.event_data ?? {}).slice(0, 100);
      console.log(`  ${ms}ms  ${type}  ${data}`);
    }
  }
  console.log("");
} finally {
  await client.end();
}
