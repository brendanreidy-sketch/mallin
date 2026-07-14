import pg from "pg";
const { Client } = pg;
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(`
  SELECT tc.table_name, tc.constraint_name, tc.constraint_type, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_name)
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
    AND tc.table_name IN ('accounts','opportunities','stakeholders','calls','emails','activities','internal_participants','touches','execution_artifacts','rep_behavior_artifacts')
  GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
  ORDER BY tc.table_name;
`);
for (const r of rows) {
  console.log(r.table_name.padEnd(28) + " | " + r.constraint_type.padEnd(12) + " | " + r.cols);
}
await c.end();
