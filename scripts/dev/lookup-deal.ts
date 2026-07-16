/**
 * Read-only lookup: resolve a deal name + owner email to tenant_id /
 * opportunity_id for the coaching runner. No writes.
 *
 *   npx tsx scripts/dev/lookup-deal.ts <name-substring> [<owner-email>]
 */
import { existsSync } from 'node:fs';
import { supabaseAdmin } from '../../lib/db/client';

if (existsSync('.env.local')) {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env.local');
}

async function main(): Promise<void> {
  const q = (process.argv[2] ?? 'cast').toLowerCase();
  const email = process.argv[3];

  const { data: opps, error: oppErr } = await supabaseAdmin
    .from('opportunities')
    .select('id, name, tenant_id, account_id')
    .ilike('name', `%${q}%`);
  console.log('OPPORTUNITIES matching', JSON.stringify(q), oppErr ? `ERR ${oppErr.message}` : '');
  console.log(JSON.stringify(opps ?? [], null, 2));

  const { data: accts } = await supabaseAdmin
    .from('accounts')
    .select('id, name, tenant_id')
    .ilike('name', `%${q}%`);
  console.log('\nACCOUNTS matching', JSON.stringify(q));
  console.log(JSON.stringify(accts ?? [], null, 2));

  if (email) {
    const { data: ip } = await supabaseAdmin
      .from('internal_participants')
      .select('tenant_id, opportunity_id, name, email')
      .eq('email', email);
    console.log('\nINTERNAL_PARTICIPANTS for', email);
    console.log(JSON.stringify(ip ?? [], null, 2));
  }
}

main().catch((e) => {
  console.error('lookup failed:', e);
  process.exit(1);
});
