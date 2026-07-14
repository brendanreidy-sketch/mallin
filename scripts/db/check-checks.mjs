import pg from "pg";
const { Client } = pg;
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(`
  SELECT
    conname AS constraint_name,
    conrelid::regclass::text AS table_name,
    pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
  WHERE contype = 'c'
    AND connamespace = 'public'::regnamespace
    AND conname LIKE '%source_system%'
  ORDER BY conrelid::regclass::text;
`);
for (const r of rows) {
  console.log(r.table_name + " | " + r.constraint_name);
  console.log("  " + r.definition);
}
await c.end();
