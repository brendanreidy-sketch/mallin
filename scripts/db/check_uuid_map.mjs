import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query("SELECT id, name, source_system, source_external_id FROM opportunities WHERE id = 'cc103c04-62cc-420a-94e3-d5b1e54119d5'");
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
