import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT generated_at, is_current, 
         artifact->'top_line'->>'posture' as posture,
         LEFT(artifact->'top_line'->>'text', 120) as top_text,
         artifact->'metadata'->>'model' as model
  FROM execution_artifacts 
  WHERE opportunity_id = 'cc103c04-62cc-420a-94e3-d5b1e54119d5'
  ORDER BY generated_at DESC, is_current DESC
  LIMIT 5
`);
console.log("Stockbridge artifacts (current state):");
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
