import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const cols = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'execution_artifacts' ORDER BY ordinal_position");
console.log("execution_artifacts cols:", cols.rows);
const r = await c.query("SELECT id, opportunity_id, prompt_version, model, generated_at, is_current FROM execution_artifacts WHERE opportunity_id = 'cc103c04-62cc-420a-94e3-d5b1e54119d5' ORDER BY generated_at DESC LIMIT 5");
console.log("rows:", JSON.stringify(r.rows, null, 2));
await c.end();
