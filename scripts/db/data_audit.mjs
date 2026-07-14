import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';

const opp = await c.query(`SELECT * FROM opportunities WHERE id = $1`, [dealId]);
console.log('=== Opportunity columns present ===');
for (const k of Object.keys(opp.rows[0] ?? {})) {
  const v = opp.rows[0][k];
  const display = v == null ? '(null)' : typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100);
  console.log(`  ${k.padEnd(28)} = ${display}`);
}

console.log('\n=== Counts on Stockbridge ===');
for (const t of ['touches','activities','calls','emails','stakeholders','internal_participants','execution_artifacts']) {
  const where = t === 'stakeholders' ? 'account_id = (SELECT account_id FROM opportunities WHERE id = $1)' : 'opportunity_id = $1';
  const r = await c.query(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`, [dealId]);
  console.log(`  ${t.padEnd(25)} ${r.rows[0].n}`);
}

await c.end();
