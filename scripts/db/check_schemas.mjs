import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
for (const t of ['calls', 'emails', 'activities']) {
  const r = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [t]);
  console.log(`\n=== ${t} ===`);
  for (const col of r.rows) {
    const req = col.is_nullable === 'NO' && !col.column_default ? '*REQ*' : '';
    console.log(`  ${req.padEnd(6)} ${col.column_name.padEnd(28)} ${col.data_type}`);
  }
  if (t === 'activities') {
    const cs = await c.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'activities'::regclass AND contype = 'c'
    `);
    console.log('  CHECK constraints:');
    for (const r of cs.rows) console.log(`    ${r.def}`);
  }
}
await c.end();
