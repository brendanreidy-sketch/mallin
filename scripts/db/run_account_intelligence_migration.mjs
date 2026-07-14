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
  resolve(process.cwd(), "supabase/migrations/010_account_intelligence.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration 010 applied");

  const cols = await client.query(
    `SELECT count(*) FROM information_schema.columns WHERE table_name = 'account_intelligence_artifacts'`,
  );
  const idx = await client.query(
    `SELECT count(*) FROM pg_indexes WHERE tablename = 'account_intelligence_artifacts'`,
  );
  console.log(
    `account_intelligence_artifacts: ${cols.rows[0].count} columns, ${idx.rows[0].count} indexes`,
  );
} finally {
  await client.end();
}
