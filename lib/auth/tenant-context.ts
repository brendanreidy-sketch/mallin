import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * Tenant context surfaced to server components + API routes.
 *
 * `is_demo` is load-bearing: every external-write surface keys off
 * this flag to short-circuit into simulation mode. See migration
 * 008_tenant_is_demo.sql for the column's contract.
 */
export interface TenantContext {
  id: string;
  is_demo: boolean;
}

/**
 * Resolves the current user's tenant context from their Clerk session.
 *
 * Mapping convention: Clerk org_id → tenants.slug → tenants.id
 *
 * For now: when a Clerk org is created with id "acme-corp", a tenant
 * row must exist with slug "acme-corp" for users in that org to be
 * able to use the app.
 *
 * Throws if:
 *   - User has no active Clerk organization (must select one)
 *   - Active org doesn't map to a known tenant
 */
export async function getCurrentTenant(): Promise<TenantContext> {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error(
      'No active Clerk organization. User must select an organization to use this app.'
    );
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, is_demo')
    .eq('slug', orgId)
    .single();

  if (error) {
    throw new Error(
      `Failed to resolve tenant for Clerk org "${orgId}": ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `No tenant found for Clerk org "${orgId}". Provision tenant row before user access.`
    );
  }

  return { id: data.id, is_demo: data.is_demo ?? false };
}

/**
 * Back-compat shim — existing call sites only need the tenant id.
 * Prefer getCurrentTenant() for new code that needs to branch on
 * is_demo.
 */
export async function getCurrentTenantId(): Promise<string> {
  const tenant = await getCurrentTenant();
  return tenant.id;
}

/**
 * Server-side helper for API routes that need to check whether a
 * given tenant id is in demo mode. Lighter than re-doing the Clerk
 * lookup when the tenant id was already resolved upstream.
 *
 * Returns false (safe default) if the tenant row can't be found —
 * the failure case for this lookup should never gate writes open.
 */
export async function isTenantDemo(tenantId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('is_demo')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.is_demo ?? false;
}

/**
 * Seller-side brand identity for a tenant — the rep's COMPANY brand used on
 * customer-facing exports (the deck). See migration 016_tenant_branding.sql.
 * All fields optional; the deck renderer falls back to Mallin-neutral styling
 * when a field is null.
 */
export interface TenantBrand {
  displayName: string | null;
  logoUrl: string | null;
  colorPrimary: string | null;
  colorAccent: string | null;
}

/**
 * Resolve a tenant's brand by tenant id — NO Clerk session required. This is
 * the path the public, token-gated deck export uses: it resolves the SELLER
 * brand from the opportunity's own tenant_id, so an unauthenticated viewer of
 * /deck/[token] still gets the right company branding. Returns all-null on a
 * miss (renderer degrades gracefully).
 */
export async function getTenantBrand(tenantId: string): Promise<TenantBrand> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('display_name, seller_company, brand_logo_url, brand_color_primary, brand_color_accent')
    .eq('id', tenantId)
    .single();

  if (error || !data) {
    return { displayName: null, logoUrl: null, colorPrimary: null, colorAccent: null };
  }
  return {
    // Fall back to the rep's stated seller_company ("Your company" at intake)
    // when no explicit brand display_name is set, so a self-serve tenant's deck
    // brands as the company they actually sell (e.g. "Northwind") rather than the
    // neutral "Mallin" default.
    displayName: data.display_name ?? data.seller_company ?? null,
    logoUrl: data.brand_logo_url ?? null,
    colorPrimary: data.brand_color_primary ?? null,
    colorAccent: data.brand_color_accent ?? null,
  };
}

/**
 * Solo-workspace check — an individual self-serve user (mode='solo') vs a
 * team (mode='team', the default). Drives which cockpit surfaces render:
 * manager escalation, the manager note, and Slack are team-only.
 *
 * Returns false (= team, show everything) if the row or column can't be
 * read. The safe default never strips a surface by accident; it only adds
 * one when a workspace is explicitly solo.
 */
export async function isTenantSolo(tenantId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('mode')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.mode === 'solo';
}

/**
 * The rep's self-reported sales-tenure band (new|1-3|3-7|7-15|15+), captured
 * on /try and carried to the tenant. Used to flex coaching depth by experience.
 * Best-effort: returns null on ANY error — including the column not existing
 * yet (migration 036 not applied) — so coaching falls back to its default
 * register and never breaks. See rep_experience_persona_adaptation.md.
 */
export async function getTenantSalesExperience(
  tenantId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('sales_experience')
      .eq('id', tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { sales_experience?: string | null }).sales_experience ?? null;
  } catch {
    return null;
  }
}
