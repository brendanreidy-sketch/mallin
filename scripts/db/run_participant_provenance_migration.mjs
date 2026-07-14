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
  resolve(process.cwd(), "supabase/migrations/012_participant_provenance.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration applied: 012_participant_provenance");

  for (const table of ["stakeholders", "internal_participants"]) {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = $1
         AND column_name IN ('discovery_source','discovery_confidence','discovery_reasoning','first_seen_at','first_seen_call_id')
       ORDER BY column_name`,
      [table],
    );
    console.log(
      `  ${table}: ${cols.rows.map((r) => r.column_name).join(", ")}`,
    );
  }
} finally {
  await client.end();
}
