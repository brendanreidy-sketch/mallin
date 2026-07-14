/**
 * ============================================================================
 *  lib/crm — the neutrality boundary
 * ============================================================================
 *
 *  The ONLY module that Pass 2/3/4, the cockpit, and the verification
 *  framework should import for CRM work. Direct imports from
 *  lib/adapters/salesforce or lib/adapters/hubspot are bugs in any
 *  file outside of the documented allow-list below.
 *
 *  ┌────────────────────────────────────────────────────────────────┐
 *  │  ALLOW-LIST — these files MAY import @/lib/adapters/*          │
 *  ├────────────────────────────────────────────────────────────────┤
 *  │                                                                │
 *  │  Provider modules (the translation layer):                     │
 *  │    lib/crm/sf-provider.ts                                      │
 *  │    lib/crm/hubspot-provider.ts                                 │
 *  │                                                                │
 *  │  Sink implementations (provider-native alert surfaces):        │
 *  │    lib/sf-diff/slack-sink.ts                                   │
 *  │    lib/sf-diff/hubspot-notes-sink.ts                           │
 *  │                                                                │
 *  │  Provider-namespaced OAuth + connect/disconnect routes:        │
 *  │    app/api/hs/connect/route.ts                                 │
 *  │    app/api/hs/disconnect/route.ts                              │
 *  │    app/api/hs/oauth-callback/route.ts                          │
 *  │    app/api/hs/deals/route.ts (HubSpot raw deal-list endpoint)  │
 *  │                                                                │
 *  │  Provider-native debug + infrastructure (SF-shaped today,      │
 *  │  awaiting Phase D.4 to become CRM-neutral):                    │
 *  │    app/api/sf/test/route.ts (health check)                     │
 *  │    app/api/sf/diff/route.ts (diff engine is SF-shaped)         │
 *  │    app/api/sf/match/route.ts (matcher is SF-shaped)            │
 *  │    app/api/sf/confirm-match/route.ts (substrate↔SF link)       │
 *  │                                                                │
 *  └────────────────────────────────────────────────────────────────┘
 *
 *  Gate command (runs in CI eventually):
 *    grep -rl "@/lib/adapters/\(salesforce\|hubspot\)" \
 *      app/ lib/ orchestration/ \
 *      --include="*.ts" --include="*.tsx" \
 *    | grep -v "lib/crm/\|/lib/sf-diff/.*-sink\.ts\|app/api/hs/\(connect\|disconnect\|oauth-callback\|deals\)/\|app/api/sf/\(test\|diff\|match\|confirm-match\)/"
 *
 *  Empty output = clean boundary. Any new file showing up means either
 *  (a) refactor through lib/crm or (b) add to the allow-list with
 *  justification.
 *
 *  Every function here resolves the right provider for the given
 *  tenant via lib/crm/router.ts, then delegates. The neutral types are
 *  re-exported so callers can do:
 *
 *    import { getDeal, type Deal } from "@/lib/crm";
 *
 *  and never see SalesforceOpportunity or HubSpotDeal again.
 * ============================================================================
 */

import type {
  Activity,
  ActivityType,
  Company,
  Contact,
  Deal,
  LeadPayload,
  Note,
  NotePayload,
  ProviderName,
  ProviderRef,
  Task,
  TaskPayload,
} from "./types";
import {
  getProviderForTenant,
  getEnabledSinksForTenant,
} from "./router";

// Re-export types for convenience.
export type {
  Activity,
  ActivityType,
  Call,
  Company,
  Contact,
  Deal,
  Email,
  Meddpicc,
  Meeting,
  Note,
  NotePayload,
  ProviderCapabilities,
  ProviderName,
  ProviderRef,
  Task,
  TaskPayload,
  TenantRoutingPolicy,
} from "./types";

export { getProviderForTenant, getEnabledSinksForTenant };

// Forecast-critical fields — Mallin NEVER writes these even if asked.
// Enforced at the public-API layer so the providers underneath can stay
// simple. This is the responsible-agentic boundary in code.
const FORBIDDEN_FIELDS = new Set<string>([
  // neutral names
  "stage",
  "amount",
  "close_date",
  "forecast_category",
  // common provider-specific aliases (caller may know these)
  "StageName",
  "Amount",
  "CloseDate",
  "ForecastCategoryName",
  "dealstage",
  "amount", // dup ok for set semantics
  "closedate",
  "hs_forecast_category",
]);

// ─── Read ──────────────────────────────────────────────────────────────────
export async function getDeal(
  tenantId: string,
  ref: ProviderRef | string,
): Promise<Deal> {
  const p = await getProviderForTenant(tenantId);
  return p.getDeal(tenantId, ref);
}

export async function listDeals(
  tenantId: string,
  opts: { after?: string; limit?: number } = {},
): Promise<{ deals: Deal[]; nextAfter?: string }> {
  const p = await getProviderForTenant(tenantId);
  return p.listDeals(tenantId, opts);
}

export async function getContact(
  tenantId: string,
  ref: ProviderRef | string,
): Promise<Contact> {
  const p = await getProviderForTenant(tenantId);
  return p.getContact(tenantId, ref);
}

export async function getCompany(
  tenantId: string,
  ref: ProviderRef | string,
): Promise<Company> {
  const p = await getProviderForTenant(tenantId);
  return p.getCompany(tenantId, ref);
}

export async function listActivitiesForDeal(
  tenantId: string,
  ref: ProviderRef | string,
  opts: { types?: ActivityType[]; since?: string; limit?: number } = {},
): Promise<Activity[]> {
  const p = await getProviderForTenant(tenantId);
  return p.listActivitiesForDeal(tenantId, ref, opts);
}

/**
 * Fetch arbitrary fields from a deal, keyed by the provider's native
 * field names. The result is stringified-or-null. Caller passes the
 * field-name list it expects downstream.
 *
 * Used by call processing to gather prior CRM state for the extractor
 * + verification framework.
 */
export async function getDealCustomFields(
  tenantId: string,
  ref: ProviderRef | string,
  fields: string[],
): Promise<Record<string, string | null>> {
  const p = await getProviderForTenant(tenantId);
  return p.getDealCustomFields(tenantId, ref, fields);
}

// ─── Write ─────────────────────────────────────────────────────────────────
export async function updateDealField(
  tenantId: string,
  ref: ProviderRef | string,
  field: string,
  value: string | number | null,
): Promise<Deal> {
  if (FORBIDDEN_FIELDS.has(field)) {
    throw new Error(
      `Refusing to update forecast-critical field "${field}". ` +
        `Mallin never auto-writes Stage / Amount / Close Date / Forecast Category, ` +
        `regardless of trust stage. (See responsible-agentic guard in lib/crm.)`,
    );
  }
  const p = await getProviderForTenant(tenantId);
  return p.updateDealField(tenantId, ref, field, value);
}

export async function createNote(
  tenantId: string,
  dealRef: ProviderRef | string,
  payload: NotePayload,
): Promise<Note> {
  const p = await getProviderForTenant(tenantId);
  if (!p.capabilities.supports_notes) {
    throw new Error(
      `CRM provider "${p.name}" does not support notes. Check capabilities before calling.`,
    );
  }
  return p.createNote(tenantId, dealRef, payload);
}

export async function createTask(
  tenantId: string,
  dealRef: ProviderRef | string,
  payload: TaskPayload,
): Promise<Task> {
  const p = await getProviderForTenant(tenantId);
  if (!p.capabilities.supports_tasks) {
    throw new Error(
      `CRM provider "${p.name}" does not support tasks. Check capabilities before calling.`,
    );
  }
  return p.createTask(tenantId, dealRef, payload);
}

/**
 * Create a fresh inbound lead (the AI SDR hand-off). Routes to the tenant's
 * configured CRM; throws if the provider can't create leads (caller falls back).
 */
export async function createInboundLead(
  tenantId: string,
  payload: LeadPayload,
): Promise<{ id: string }> {
  const p = await getProviderForTenant(tenantId);
  if (!p.createInboundLead) {
    throw new Error(`CRM provider "${p.name}" does not support inbound lead creation.`);
  }
  return p.createInboundLead(tenantId, payload);
}

/**
 * Convenience accessor for tenant's provider name without instantiating
 * the provider object. Useful for UI labels ("Connected to Salesforce")
 * and for routing logic that needs to branch on provider name without
 * the full capability bundle.
 */
export async function getProviderName(tenantId: string): Promise<ProviderName> {
  const p = await getProviderForTenant(tenantId);
  return p.name;
}
