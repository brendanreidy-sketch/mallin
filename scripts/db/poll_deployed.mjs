import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';
const start = Date.now();
const targetTouchExt = await c.query(`SELECT id, created_at FROM touches WHERE source_external_id LIKE 'touch_%' AND opportunity_id = $1 ORDER BY created_at DESC LIMIT 1`, [dealId]);
console.log('Latest touch:', targetTouchExt.rows[0]);

while (Date.now() - start < 240000) {
  const r = await c.query(`
    SELECT generated_at,
           LEFT(artifact->'top_line'->>'text', 250) AS top_text
    FROM execution_artifacts
    WHERE opportunity_id = $1 AND is_current = true
    ORDER BY generated_at DESC LIMIT 1
  `, [dealId]);
  const row = r.rows[0];
  const elapsed = Math.round((Date.now() - start) / 1000);
  const artTime = new Date(row?.generated_at).getTime();
  const touchTime = new Date(targetTouchExt.rows[0]?.created_at).getTime();
  if (artTime > touchTime) {
    console.log(`\n[${elapsed}s] DEPLOYED REGEN DONE`);
    console.log(`  artifact generated: ${row.generated_at}`);
    console.log(`  top_text: ${row.top_text}`);
    break;
  }
  process.stdout.write(`[${elapsed}s] waiting on Vercel regen…\r`);
  await new Promise(r => setTimeout(r, 5000));
}
await c.end();
