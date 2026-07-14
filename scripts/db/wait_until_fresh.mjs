import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';
const startTime = Date.now();
const targetAfter = startTime - 5000; // artifact must be created in the last 5s window
while (Date.now() - startTime < 240000) {
  const r = await c.query(`
    SELECT generated_at FROM execution_artifacts
    WHERE opportunity_id = $1 AND is_current = true
    ORDER BY generated_at DESC LIMIT 1
  `, [dealId]);
  const artTime = new Date(r.rows[0]?.generated_at).getTime();
  const elapsed = Math.round((Date.now() - startTime)/1000);
  if (artTime > targetAfter) {
    console.log(`\n[${elapsed}s] new artifact landed: ${r.rows[0]?.generated_at}`);
    break;
  }
  process.stdout.write(`[${elapsed}s] waiting on regen…\r`);
  await new Promise(r => setTimeout(r, 5000));
}
await c.end();
