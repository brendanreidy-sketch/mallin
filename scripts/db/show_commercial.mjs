import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT artifact->'pre_mortem_paths' AS paths
  FROM execution_artifacts
  WHERE opportunity_id = 'cc103c04-62cc-420a-94e3-d5b1e54119d5' AND is_current = true
`);
const paths = r.rows[0]?.paths ?? [];
for (let i = 0; i < paths.length; i++) {
  const p = paths[i];
  console.log(`\n=== Path ${i+1}: ${p.actor_name} (${p.primary_driver}) ===`);
  console.log(`severity: ${p.severity} · likelihood: ${p.likelihood}`);
  console.log(`\nfailure_path: ${p.failure_path}`);
  console.log(`\nif_no_action: ${p.if_no_action}`);
  console.log(`\nforcing_move: ${p.forcing_move}`);
}
await c.end();
