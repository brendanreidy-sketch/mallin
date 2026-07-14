import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const dealId = 'cc103c04-62cc-420a-94e3-d5b1e54119d5';
const r = await c.query(`
  SELECT generated_at,
         artifact->'metadata'->>'declared_altitude' AS dec_alt,
         jsonb_array_length(COALESCE(artifact->'pre_mortem_paths','[]'::jsonb)) AS pmp,
         artifact->'pre_mortem_paths' AS paths
  FROM execution_artifacts
  WHERE opportunity_id = $1 ORDER BY generated_at DESC LIMIT 3
`, [dealId]);
for (const row of r.rows) {
  console.log(`\n=== ${new Date(row.generated_at).toISOString()} (alt=${row.dec_alt || 'inferred'}, paths=${row.pmp}) ===`);
  for (const p of (row.paths || [])) {
    console.log(`  driver: ${p.primary_driver} (${p.actor_name})`);
    console.log(`  forcing: ${p.forcing_move}`);
  }
}
await c.end();
