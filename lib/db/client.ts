import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * USE FOR:
 *   - Sync workers (Salesforce, Gmail, Calendar pulls)
 *   - Background jobs
 *   - Pass 1.5 orchestrator (system-level input assembly)
 *   - Pass 2/3 runners (system-level enrichment)
 *   - Schema migrations
 *
 * DO NOT USE FOR:
 *   - User-facing API routes that should respect tenant isolation
 *   - Any code path triggered directly by user request without explicit
 *     tenant_id scoping in the query
 *
 * For user-facing reads, use lib/db/client-rls.ts instead (when RLS
 * policies are in place after Patch #7).
 *
 * IMPORTANT (May 11 2026): the client is lazy-instantiated via a Proxy
 * so that simply importing this module does NOT throw when env vars
 * are missing. Throwing-at-module-load broke Vercel Preview builds —
 * Next.js's page-data collection phase imports every route module to
 * extract metadata, and any module that throws on import takes the
 * whole build down. The previous eager-init pattern only worked because
 * Production env was set; Preview/Development environments without the
 * vars would error out before any code ran. Now the env check happens
 * lazily on first ACCESS (e.g., `supabaseAdmin.from(...)`), which is
 * when a real DB call would fail anyway. Build-time imports are safe.
 */

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  }
  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _client;
}

/**
 * Lazy-initialized service-role Supabase client. Behaves like a
 * SupabaseClient instance to all callers — the underlying client is
 * created on first property access. Import is now side-effect-free.
 */
export const supabaseAdmin: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop, receiver) {
      const real = getClient();
      const value = Reflect.get(real as object, prop, receiver);
      // Bind any function calls to the real client so `this` is correct
      // (e.g., supabaseAdmin.from(...) → underlying client's from).
      return typeof value === 'function' ? value.bind(real) : value;
    },
  },
);
