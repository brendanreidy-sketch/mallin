/**
 * Apply a SQL migration file via direct postgres connection (DATABASE_URL).
 * Uses the service-role connection — bypasses RLS.
 *
 * Usage: npx tsx scripts/db/apply-migration.ts <path-to-sql-file>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx scripts/db/apply-migration.ts <sql-file>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = readFileSync(resolve(path), "utf-8");
  console.log(`Applying ${path} (${sql.length} chars)…`);

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Supabase pooler uses SSL
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("✓ migration applied");
  } catch (e) {
    console.error("✗ migration failed:", (e as Error).message);
    process.exit(2);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
