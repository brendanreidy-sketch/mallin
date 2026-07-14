import pg from "pg";
const { Client } = pg;
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Check opportunities column constraints
const { rows: cols } = await c.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'opportunities'
  ORDER BY ordinal_position;
`);
console.log("=== opportunities columns ===");
for (const r of cols) {
  console.log(`  ${r.column_name.padEnd(30)} ${r.data_type.padEnd(25)} nullable=${r.is_nullable} default=${r.column_default ?? ""}`);
}

console.log("\n=== sample existing opportunity ===");
const { rows: sample } = await c.query(
  "SELECT * FROM opportunities WHERE owner_id IS NOT NULL LIMIT 1"
);
if (sample.length === 0) {
  console.log("  (no rows with owner_id set)");
} else {
  for (const [k, v] of Object.entries(sample[0])) {
    console.log(`  ${k.padEnd(28)} = ${typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`);
  }
}

console.log("\n=== owner_id FK target ===");
const { rows: fks } = await c.query(`
  SELECT
    conname,
    pg_get_constraintdef(oid) as def
  FROM pg_constraint
  WHERE contype = 'f'
    AND conrelid = 'public.opportunities'::regclass
    AND conname ILIKE '%owner%';
`);
for (const r of fks) console.log("  " + r.conname + " :: " + r.def);

await c.end();
