/**
 * Tenant-membership-based access control for opportunity URLs.
 *
 * Replaces the older DEMO_ALLOWED_DEAL_IDS env-var gate that lived
 * duplicated across /prep and 6 API routes. The env-var pattern made
 * sense at n=5 design-partner deals; past that, every new opp
 * required a Vercel env edit + redeploy. Replaced with: the
 * opportunity's tenant_id must match the current user's resolved
 * tenant.
 *
 * See memory: intake_primitive_doctrine.md
 */

import { supabaseAdmin } from "@/lib/db/client";

export type OpportunityAccess =
  | { ok: true; opportunityId: string; tenantId: string }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "no_tenant_in_context" };

/**
 * Returns whether the current user (resolved upstream to userTenantId)
 * is allowed to access the given opportunity.
 *
 * Pattern: server-side check, after `getCurrentTenant()` has resolved
 * the user's tenant. The caller then routes on the discriminated
 * result type.
 *
 * Note on local dev: the previous `isDealIdAllowed` returned true when
 * the env var was unset (a development convenience). This helper does
 * NOT do that — every access in every environment goes through the
 * tenant-membership check. Local dev still works because the dev
 * user's tenant_id matches the dev opportunity's tenant_id; there's
 * no separate "demo gate" to bypass.
 */
export async function checkOpportunityAccess(
  opportunityId: string,
  userTenantId: string | null,
): Promise<OpportunityAccess> {
  if (!userTenantId) {
    return { ok: false, reason: "no_tenant_in_context" };
  }
  const { data: opp, error } = await supabaseAdmin
    .from("opportunities")
    .select("id, tenant_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !opp) {
    return { ok: false, reason: "not_found" };
  }
  if (opp.tenant_id !== userTenantId) {
    return { ok: false, reason: "wrong_tenant" };
  }
  return { ok: true, opportunityId: opp.id, tenantId: opp.tenant_id };
}

/**
 * Convenience wrapper for API routes: returns boolean instead of a
 * discriminated result. Use checkOpportunityAccess directly when the
 * caller needs to distinguish 404 from 403.
 */
export async function isOpportunityAccessible(
  opportunityId: string,
  userTenantId: string | null,
): Promise<boolean> {
  const result = await checkOpportunityAccess(opportunityId, userTenantId);
  return result.ok;
}
