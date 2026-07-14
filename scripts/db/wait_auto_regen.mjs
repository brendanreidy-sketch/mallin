import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';
const startTime = Date.now();
let lastTouch;
const t = await c.query(`SELECT created_at FROM touches WHERE opportunity_id = $1 ORDER BY created_at DESC LIMIT 1`, [dealId]);
lastTouch = new Date(t.rows[0].created_at).getTime();
console.log(`Latest touch at: ${new Date(lastTouch).toISOString()}`);
console.log('Waiting for auto-regen to complete...');
while (Date.now() - startTime < 240000) {
  const r = await c.query(`SELECT generated_at FROM execution_artifacts WHERE opportunity_id = $1 AND is_current = true LIMIT 1`, [dealId]);
  const artTime = new Date(r.rows[0].generated_at).getTime();
  const elapsed = Math.round((Date.now() - startTime)/1000);
  if (artTime > lastTouch) {
    console.log(`[${elapsed}s] Auto-regen complete: ${r.rows[0].generated_at}`);
    break;
  }
  process.stdout.write(`[${elapsed}s] waiting...\r`);
  await new Promise(r => setTimeout(r, 5000));
}
await c.end();
