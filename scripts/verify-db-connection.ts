/**
 * scripts/verify-db-connection.ts
 *
 * Smoke test: connects to Supabase using service-role credentials,
 * queries the tenants table, and prints what it finds.
 *
 * Verifies:
 *   - .env.local is readable
 *   - Supabase URL and service role key work
 *   - The deployed schema is reachable
 *   - Our seeded fixtures are visible
 *
 * Run with: npx tsx scripts/verify-db-connection.ts
 */


import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RevOps Autopilot — DB Connection Verification');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL not set');
    process.exit(1);
  }
  if (!serviceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  console.log(`Supabase URL: ${url}`);
  console.log(`Service key:  ${serviceKey.slice(0, 12)}...${serviceKey.slice(-4)} (${serviceKey.length} chars)`);
  console.log();
  console.log('Connecting...');

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Query 1: tenants
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, slug, status, methodology_default, created_at')
    .order('created_at', { ascending: true });

  if (tenantsError) {
    console.error('❌ Failed to query tenants:');
    console.error(tenantsError);
    process.exit(1);
  }

  console.log(`✅ Connected. Found ${tenants?.length ?? 0} tenants:`);
  console.table(tenants);

  // Query 2: row counts across key tables
  console.log();
  console.log('Verifying schema population...');

  const tables = [
    'accounts',
    'stakeholders',
    'opportunities',
    'methodology_pillars',
    'activities',
    'calls',
    'emails',
    'meetings',
    'pass2_enrichment_runs',
    'intelligence_records',
    'applied_state',
    'pass3_artifacts',
  ];

  const counts: Record<string, number | string> = {};
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    counts[table] = error ? `ERROR: ${error.message}` : (count ?? 0);
  }

  console.table(counts);
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Verification complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
