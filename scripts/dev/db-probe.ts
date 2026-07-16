/** Read-only probe: does the connected DB have the app's core tables + rows? */
import { existsSync } from 'node:fs';
import { supabaseAdmin } from '../../lib/db/client';

if (existsSync('.env.local')) {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env.local');
}

async function main(): Promise<void> {
  for (const t of ['tenants', 'opportunities', 'accounts', 'calls', 'internal_participants']) {
    const { count, error } = await supabaseAdmin
      .from(t)
      .select('*', { count: 'exact', head: true });
    console.log(t.padEnd(24), error ? `ERR ${error.message}` : `rows=${count}`);
  }
}

main().catch((e) => {
  console.error('probe failed:', e);
  process.exit(1);
});
