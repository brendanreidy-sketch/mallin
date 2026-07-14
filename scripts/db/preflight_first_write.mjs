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
const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// CHECK 1: active link for the deal we'll write to
const linkQ = await c.query(
  `SELECT id, opportunity_id, sf_opp_id, sf_instance_url, confirmed_at, unlinked_at, notes
   FROM sf_opportunity_links
   WHERE unlinked_at IS NULL
   ORDER BY confirmed_at DESC`,
);
console.log("=== CHECK 1: active sf_opportunity_links rows ===");
if (linkQ.rows.length === 0) {
  console.log("✗ NO active links. Need to confirm one before writing.");
} else {
  for (const r of linkQ.rows) {
    console.log(
      `  link_id=${r.id.slice(0, 8)}... | substrate_deal=${r.opportunity_id.slice(0, 8)}... | sf_opp=${r.sf_opp_id} | confirmed=${r.confirmed_at.toISOString().slice(0, 16)} | notes="${r.notes || ""}"`,
    );
  }
}
await c.end();
