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
  resolve(process.cwd(), "supabase/migrations/003_gmail_oauth_tokens.sql"),
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
    "SELECT count(*) FROM information_schema.columns WHERE table_name = 'gmail_oauth_tokens'",
  );
  const idx = await client.query(
    "SELECT count(*) FROM pg_indexes WHERE tablename = 'gmail_oauth_tokens'",
  );
  const rls = await client.query(
    "SELECT polname FROM pg_policy WHERE polrelid = 'gmail_oauth_tokens'::regclass",
  );
  console.log(`columns: ${cols.rows[0].count}, indexes: ${idx.rows[0].count}`);
  console.log(`RLS policies: ${rls.rows.map((r) => r.polname).join(", ")}`);
} finally {
  await client.end();
}
