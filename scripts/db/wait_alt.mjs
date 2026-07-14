import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';
const start = Date.now();
while (Date.now() - start < 240000) {
  const r = await c.query(`SELECT generated_at, artifact->'metadata'->>'declared_altitude' AS dec FROM execution_artifacts WHERE opportunity_id = $1 AND is_current = true LIMIT 1`, [dealId]);
  const elapsed = Math.round((Date.now() - start)/1000);
  if (r.rows[0]?.dec === 'commercial') {
    console.log(`[${elapsed}s] commercial regen landed: ${r.rows[0].generated_at}`);
    break;
  }
  process.stdout.write(`[${elapsed}s] current alt=${r.rows[0]?.dec}, waiting...\r`);
  await new Promise(r => setTimeout(r, 5000));
}
await c.end();
