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
  resolve(process.cwd(), "scripts/db/slack_interactions_migration.sql"),
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

  // Sanity: count columns + indexes
  const cols = await client.query(
    "SELECT count(*) FROM information_schema.columns WHERE table_name = 'slack_interactions'",
  );
  const idx = await client.query(
    "SELECT count(*) FROM pg_indexes WHERE tablename = 'slack_interactions'",
  );
  const enumVals = await client.query(
    "SELECT unnest(enum_range(NULL::slack_interaction_status))::text AS v",
  );
  console.log(`columns: ${cols.rows[0].count}, indexes: ${idx.rows[0].count}`);
  console.log(`enum values: ${enumVals.rows.map((r) => r.v).join(", ")}`);
} finally {
  await client.end();
}
