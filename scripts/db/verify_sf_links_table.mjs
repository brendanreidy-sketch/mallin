import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
  .split("\n").reduce((a,l)=>{const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)a[m[1]]=m[2];return a;},{});
const c = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
// Verify table
const t = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'sf_opportunity_links' ORDER BY ordinal_position");
console.log("Columns:");
t.rows.forEach(r => console.log(`  ${r.column_name.padEnd(18)} ${r.data_type.padEnd(28)} nullable=${r.is_nullable}`));
// Verify indexes
const i = await c.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sf_opportunity_links'");
console.log("\nIndexes:");
i.rows.forEach(r => console.log(`  ${r.indexname}\n    ${r.indexdef}`));
// Verify FK
const fk = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'sf_opportunity_links'::regclass AND contype = 'f'`);
console.log("\nForeign keys:");
fk.rows.forEach(r => console.log(`  ${r.conname}: ${r.def}`));
// Row count
const c2 = await c.query("SELECT count(*) FROM sf_opportunity_links");
console.log(`\nRow count: ${c2.rows[0].count}`);
await c.end();
