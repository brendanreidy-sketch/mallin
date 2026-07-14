import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'touches' ORDER BY ordinal_position");
console.log("columns:", cols.rows.map(r => r.column_name));
const r = await c.query("SELECT * FROM touches ORDER BY created_at DESC LIMIT 5");
console.log("rows:", JSON.stringify(r.rows, null, 2));
await c.end();
