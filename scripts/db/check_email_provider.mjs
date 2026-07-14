import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`
  SELECT pg_get_constraintdef(oid) AS def, conname
  FROM pg_constraint
  WHERE conrelid = 'emails'::regclass AND contype = 'c'
`);
for (const row of r.rows) console.log(row.conname, '→', row.def);
await c.end();
