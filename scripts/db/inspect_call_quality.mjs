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
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const candidates = ["Cipher Mining", "GK Management", "WS Development", "Clenera", "Montecito Medical"];
for (const namePrefix of candidates) {
  const r = await c.query(
    `SELECT c.title, c.started_at, c.duration_seconds, length(c.summary) AS summary_len, substring(c.summary, 1, 200) AS preview
     FROM calls c
     JOIN opportunities o ON o.id = c.opportunity_id
     WHERE o.name ILIKE $1
     ORDER BY c.started_at`,
    [namePrefix + "%"]
  );
  console.log(`\n=== ${namePrefix} (${r.rows.length} calls) ===`);
  for (const row of r.rows) {
    const date = row.started_at ? row.started_at.toISOString().slice(0,10) : "?";
    const dur = row.duration_seconds ? `${Math.round(row.duration_seconds/60)}m` : "?";
    console.log(`  ${date} · ${dur} · ${(row.summary_len || 0).toString().padStart(5)}ch · ${(row.title || "").slice(0,50)}`);
  }
}
await c.end();
