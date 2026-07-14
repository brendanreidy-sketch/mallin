import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
}

/**
 * RLS-scoped Supabase client. Inherits the user's Clerk session for
 * tenant isolation via JWT claims.
 *
 * USE FOR:
 *   - User-facing API routes
 *   - Server components that read user-scoped data
 *
 * IMPORTANT: Until Patch #7 (RLS policies) is complete, this client has
 * NO tenant isolation enforced at the database layer. Until then, the
 * application must do its own tenant scoping by including tenant_id in
 * every query's WHERE clause.
 *
 * Wednesday's RLS pass adds the policies that make this client truly
 * tenant-isolated by default.
 */
export async function getSupabaseRls() {
  const { getToken } = await auth();
  const token = await getToken({ template: 'supabase' });

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
