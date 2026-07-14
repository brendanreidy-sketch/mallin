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
  resolve(process.cwd(), "supabase/migrations/011_live_coach_turns.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration 011 applied (live_coach_turns)");

  const cols = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'live_coach_turns' ORDER BY ordinal_position`,
  );
  for (const r of cols.rows) {
    console.log(`  ${r.column_name.padEnd(18)} ${r.data_type}`);
  }
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'live_coach_turns'`,
  );
  console.log(`\n  indexes: ${idx.rows.map((r) => r.indexname).join(", ")}`);
} finally {
  await client.end();
}
