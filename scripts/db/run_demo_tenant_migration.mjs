import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n")
  .reduce((a, l) => {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) a[m[1]] = m[2];
    return a;
  }, {});

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/008_tenant_is_demo.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration applied");

  const col = await client.query(
    `SELECT column_name, data_type, column_default
       FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'is_demo'`,
  );
  if (col.rows.length === 0) {
    console.error("✗ is_demo column not found on tenants after migration");
    process.exit(1);
  }
  const idx = await client.query(
    `SELECT count(*) FROM pg_indexes
      WHERE tablename = 'tenants' AND indexname = 'idx_tenants_is_demo'`,
  );
  console.log(
    `is_demo column: ${col.rows[0].data_type} default ${col.rows[0].column_default} · partial index present: ${idx.rows[0].count === "1"}`,
  );
} finally {
  await client.end();
}
