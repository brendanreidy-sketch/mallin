import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';
const start = Date.now();
let prevText = null;
while (Date.now() - start < 240000) { // 4-min ceiling
  const r = await c.query(`
    SELECT generated_at,
           LEFT(artifact->'top_line'->>'text', 200) as top_text,
           is_current
    FROM execution_artifacts
    WHERE opportunity_id = $1 AND is_current = true
    ORDER BY generated_at DESC LIMIT 1
  `, [dealId]);
  const row = r.rows[0];
  const elapsed = Math.round((Date.now() - start) / 1000);
  if (prevText === null) {
    console.log(`[${elapsed}s] current artifact generated_at=${row?.generated_at}`);
    console.log(`[${elapsed}s] text: ${row?.top_text?.slice(0, 100)}...`);
    prevText = row?.top_text;
  }
  // Check if a touch newer than artifact still exists (in-flight)
  const t = await c.query(`
    SELECT created_at FROM touches
    WHERE opportunity_id = $1
    ORDER BY created_at DESC LIMIT 1
  `, [dealId]);
  const touchTime = new Date(t.rows[0]?.created_at).getTime();
  const artTime = new Date(row?.generated_at).getTime();
  if (artTime > touchTime) {
    console.log(`[${elapsed}s] DONE — artifact (${row?.generated_at}) > latest touch (${t.rows[0]?.created_at})`);
    console.log(`[${elapsed}s] new top_text: ${row?.top_text}`);
    break;
  }
  process.stdout.write(`[${elapsed}s] waiting... touch=${t.rows[0]?.created_at} art=${row?.generated_at}\r`);
  await new Promise(r => setTimeout(r, 5000));
}
await c.end();
