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
  resolve(process.cwd(), "supabase/migrations/005_tenant_crm_config.sql"),
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
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'tenants'
       AND column_name IN ('crm_provider','enabled_sinks','routing_policy','severity_thresholds','manager_escalation_rules','roe_rules')
     ORDER BY column_name`,
  );
  for (const r of cols.rows) {
    console.log(
      `  ${r.column_name.padEnd(28)} ${r.data_type.padEnd(20)} nullable=${r.is_nullable}`,
    );
  }

  const counts = await client.query(
    `SELECT crm_provider, count(*) AS n FROM tenants GROUP BY crm_provider`,
  );
  console.log("");
  console.log("Tenant distribution by provider:");
  for (const r of counts.rows) {
    console.log(`  ${r.crm_provider}: ${r.n}`);
  }
} finally {
  await client.end();
}
