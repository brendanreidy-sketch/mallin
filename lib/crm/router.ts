/**
 * ============================================================================
 *  Router — tenant → provider dispatch
 * ============================================================================
 *
 *  Reads `tenants.crm_provider` from Supabase and returns the matching
 *  provider module. Called by lib/crm/index.ts on every public-API call;
 *  result is cached per request to avoid a DB roundtrip per call.
 *
 *  Failure modes:
 *    - Tenant not found → throws (caller should have validated auth)
 *    - crm_provider unset → throws with onboarding-friendly message
 *    - crm_provider set to an unknown value → throws
 *
 *  Cache: in-memory by tenantId for the lifetime of the request.
 *  Cleared via clearProviderCache() in tests. Single-request scope is
 *  appropriate for Next.js route handlers; longer caching would risk
 *  stale config when tenant settings change.
 * ============================================================================
 */

import { supabaseAdmin } from "@/lib/db/client";
import type { CrmProvider } from "./providers";
import type { ProviderName } from "./types";
import { hubspotProvider } from "./hubspot-provider";
import { salesforceProvider } from "./sf-provider";

const REGISTRY: Record<ProviderName, CrmProvider | null> = {
  salesforce: salesforceProvider,
  hubspot: hubspotProvider,
  dynamics: null, // future
  pipedrive: null, // future
  attio: null, // future
};

interface TenantCrmConfig {
  crm_provider: ProviderName;
  enabled_sinks: string[];
}

const _cache = new Map<string, TenantCrmConfig>();

export function clearProviderCache(): void {
  _cache.clear();
}

/**
 * Read tenant CRM config from Supabase. Cached per process-lifetime;
 * single-request scope is fine for Next.js routes.
 */
async function loadTenantCrmConfig(tenantId: string): Promise<TenantCrmConfig> {
  const cached = _cache.get(tenantId);
  if (cached) return cached;

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("crm_provider, enabled_sinks")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load tenant CRM config: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Tenant ${tenantId} not found`);
  }
  const row = data as { crm_provider: string | null; enabled_sinks: string[] | null };
  if (!row.crm_provider) {
    throw new Error(
      `Tenant ${tenantId} has no CRM provider configured. Set tenants.crm_provider to 'salesforce' or 'hubspot'.`,
    );
  }

  const cfg: TenantCrmConfig = {
    crm_provider: row.crm_provider as ProviderName,
    enabled_sinks: row.enabled_sinks ?? ["slack"],
  };
  _cache.set(tenantId, cfg);
  return cfg;
}

/**
 * Return the CRM provider configured for this tenant. Used by all
 * public lib/crm functions.
 */
export async function getProviderForTenant(
  tenantId: string,
): Promise<CrmProvider> {
  const cfg = await loadTenantCrmConfig(tenantId);
  const provider = REGISTRY[cfg.crm_provider];
  if (!provider) {
    throw new Error(
      `Tenant ${tenantId} configured for unsupported CRM "${cfg.crm_provider}". ` +
        `Supported: salesforce, hubspot. Future: ${Object.keys(REGISTRY)
          .filter((k) => REGISTRY[k as ProviderName] === null)
          .join(", ")}.`,
    );
  }
  return provider;
}

/**
 * Return the list of sink names this tenant has enabled. Used by
 * lib/sf-diff/alert-sinks.ts sendToAllSinks to filter the global sink
 * list down to what the tenant actually wants.
 */
export async function getEnabledSinksForTenant(
  tenantId: string,
): Promise<string[]> {
  const cfg = await loadTenantCrmConfig(tenantId);
  return cfg.enabled_sinks;
}
