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
  resolve(process.cwd(), "supabase/migrations/007_action_queue.sql"),
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

  const cols = await client.query(
    `SELECT count(*) FROM information_schema.columns WHERE table_name = 'action_queue'`,
  );
  const idx = await client.query(
    `SELECT count(*) FROM pg_indexes WHERE tablename = 'action_queue'`,
  );
  console.log(`columns: ${cols.rows[0].count}, indexes: ${idx.rows[0].count}`);
} finally {
  await client.end();
}
