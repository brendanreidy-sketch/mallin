/**
 * Realized-ROI snapshot — computed from logged deal outcomes (npm run roi).
 *
 * Only deals with a recorded outcome count (you can't realize ROI on open
 * deals). Read-only, excludes demo tenants. The attribution flags
 * (risk_materialized / move_taken) turn "we think we helped" into a defensible
 * per-deal story.
 */
import pg from "pg";

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
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
    SELECT
      o.outcome, o.closed_at, o.amount, o.risk_materialized, o.move_taken,
      (SELECT min(started_at) FROM calls cc WHERE cc.opportunity_id = o.opportunity_id) AS first_call_at
    FROM deal_outcomes o
    JOIN tenants t ON t.id = o.tenant_id
    WHERE t.is_demo = false
  `);
  await c.end();

  const total = rows.length;
  const won = rows.filter((r) => r.outcome === "won");
  const lost = rows.filter((r) => r.outcome === "lost");
  const decided = won.length + lost.length;

  // Cycle time: first call → close, for decided deals that have both.
  const cycles = rows
    .filter((r) => r.first_call_at && r.closed_at && r.outcome !== "no_decision")
    .map((r) => (new Date(r.closed_at).getTime() - new Date(r.first_call_at).getTime()) / 864e5)
    .filter((d) => d >= 0);
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null;

  // Deals saved: Mallin flagged a real risk, the rep ran the move, and it won.
  const saved = won.filter((r) => r.risk_materialized === true && r.move_taken === true).length;
  // Attribution.
  const flaggedReal = rows.filter((r) => r.risk_materialized === true).length;
  const flaggedAnswered = rows.filter((r) => r.risk_materialized !== null).length;
  const moveTaken = rows.filter((r) => r.move_taken === true).length;
  const moveAnswered = rows.filter((r) => r.move_taken !== null).length;
  const wonRevenue = won.reduce((a, r) => a + (Number(r.amount) || 0), 0);

  console.log("\n  MALLIN — realized ROI  (deals with a recorded outcome)\n");
  if (total === 0) {
    console.log("  No outcomes logged yet. Mark deals closed on the brief to start the loop.\n");
    return;
  }
  console.log(`  Closed deals:     ${total}  (won ${won.length} · lost ${lost.length} · no-decision ${rows.length - decided})`);
  console.log(`  Win rate:         ${pct(won.length, decided)}  (of decided deals)`);
  console.log(`  Avg cycle time:   ${avgCycle === null ? "—" : `${avgCycle} days`}  (first call → close, n=${cycles.length})`);
  console.log(`  Deals saved:      ${saved}  (flagged risk was real + ran the move + won)`);
  console.log(`  $ won:            ${wonRevenue.toLocaleString()}`);
  console.log("");
  console.log("  Attribution:");
  console.log(`    Risk was real:  ${flaggedReal}/${flaggedAnswered} answered  (${pct(flaggedReal, flaggedAnswered)} — was Mallin's read right?)`);
  console.log(`    Move was taken: ${moveTaken}/${moveAnswered} answered  (${pct(moveTaken, moveAnswered)})`);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
