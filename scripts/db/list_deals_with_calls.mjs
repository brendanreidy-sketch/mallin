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
const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Deals + call counts + does the deal have a closed outcome?
const r = await c.query(`
  SELECT
    o.id,
    o.name AS deal_name,
    a.name AS account_name,
    o.stage_label,
    o.deal_posture,
    o.amount,
    o.close_date,
    (SELECT COUNT(*) FROM calls c WHERE c.opportunity_id = o.id) AS call_count,
    (SELECT COUNT(*) FROM calls c WHERE c.opportunity_id = o.id AND c.summary IS NOT NULL AND length(c.summary) > 100) AS calls_with_summary,
    (SELECT MIN(started_at) FROM calls c WHERE c.opportunity_id = o.id) AS first_call,
    (SELECT MAX(started_at) FROM calls c WHERE c.opportunity_id = o.id) AS last_call
  FROM opportunities o
  LEFT JOIN accounts a ON a.id = o.account_id
  ORDER BY (SELECT COUNT(*) FROM calls c WHERE c.opportunity_id = o.id) DESC, o.name
`);
console.log("Deal".padEnd(50) + "  Calls  Span                Stage              Outcome");
console.log("─".repeat(110));
for (const row of r.rows) {
  const span = row.first_call && row.last_call
    ? `${row.first_call.toISOString().slice(0,10)} → ${row.last_call.toISOString().slice(0,10)}`
    : "—".padEnd(23);
  const dealLabel = `${row.deal_name || ""} (${(row.account_name || "").slice(0,20)})`.slice(0,48);
  console.log(
    `${dealLabel.padEnd(50)}  ${String(row.call_count).padStart(5)}  ${span.padEnd(20)} ${(row.stage_label || "—").slice(0,18).padEnd(18)} ${row.deal_posture || ""}`
  );
}
await c.end();
