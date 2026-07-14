import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT artifact->'pre_mortem_paths'->0 AS p
  FROM execution_artifacts
  WHERE opportunity_id = 'cc103c04-62cc-420a-94e3-d5b1e54119d5'
    AND is_current = true
`);
const p = r.rows[0]?.p;
if (p) {
  console.log('failure_path:', p.failure_path);
  console.log();
  console.log('if_no_action:', p.if_no_action);
  console.log();
  console.log('forcing_move:', p.forcing_move);
}
await c.end();
