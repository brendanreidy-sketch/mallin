/**
 * Founder snapshot of the B2B pilot pipeline (npm run pilots).
 *
 * Reads pilot_signups — the leads from the /pilot form. Read-only. Mirror of
 * `npm run metrics` (B2C usage) so you can read both funnels the same way.
 */
import pg from "pg";

function day(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}
function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set — run with --env-file=.env.local");
    process.exit(1);
  }
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const { rows } = await c.query(`
    SELECT name, email, company, role, team_size,
           coalesce(array_length(current_stack, 1), 0) AS stack_n,
           trigger, source, status, created_at, contacted_at, pilot_started_at
    FROM pilot_signups
    ORDER BY created_at DESC
  `);
  await c.end();

  const total = rows.length;
  const byStatus = (s: string) => rows.filter((r) => r.status === s).length;
  const last7 = rows.filter(
    (r) => r.created_at && Date.now() - new Date(r.created_at).getTime() < 7 * 864e5,
  ).length;

  console.log("\n  MALLIN — B2B pilot pipeline  (pilot_signups)\n");
  if (total === 0) {
    console.log("  No pilot leads yet. The /pilot form writes here (and emails you).\n");
    return;
  }
  console.log(`  Leads (all-time):  ${total}   ·   last 7d: ${last7}`);
  console.log(
    `  Status:  new ${byStatus("new")}  ·  contacted ${byStatus("contacted")}  ·  pilot_started ${byStatus("pilot_started")}`,
  );

  console.log(
    "\n  " +
      pad("COMPANY", 22) +
      pad("WHO", 20) +
      pad("ROLE", 18) +
      pad("TEAM", 9) +
      pad("STACK", 7) +
      pad("STATUS", 14) +
      "WHEN",
  );
  console.log("  " + "─".repeat(98));
  for (const r of rows) {
    console.log(
      "  " +
        pad(r.company || "—", 22) +
        pad(r.name || "—", 20) +
        pad(r.role || "—", 18) +
        pad(r.team_size || "—", 9) +
        pad(String(r.stack_n), 7) +
        pad(r.status || "new", 14) +
        day(r.created_at),
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
