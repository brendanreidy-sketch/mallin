import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const opps = await c.query(`
  SELECT o.id, o.name, o.stage_label, o.deal_posture, o.last_activity_at, a.name AS account_name
  FROM opportunities o
  LEFT JOIN accounts a ON o.account_id = a.id
  ORDER BY o.last_activity_at DESC NULLS LAST
  LIMIT 12
`);
console.log("opportunities (top 12):");
for (const r of opps.rows) {
  console.log(`  ${r.id}  ${(r.deal_posture ?? '-').padEnd(14)}  ${(r.account_name ?? '-').padEnd(38)}  ${r.name}`);
}
await c.end();
