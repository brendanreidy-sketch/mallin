/**
 * ============================================================================
 *  CrmProvider — the interface every CRM provider implements
 * ============================================================================
 *
 *  Two SF / HS implementations live in:
 *    lib/crm/sf-provider.ts
 *    lib/crm/hubspot-provider.ts
 *
 *  Callers route through lib/crm/index.ts which resolves the right
 *  provider per tenant via lib/crm/router.ts. Application code should
 *  never import a provider module directly — always go through index.
 *
 *  Forward-compat notes:
 *    - Methods return Promise<...> even when an implementation could
 *      synchronously fail; uniformity simplifies the call site.
 *    - `ref: ProviderRef | string` overloads accept a bare external_id
 *      for callers that already know what provider is in play (saves
 *      one DB roundtrip when the tenant context is already loaded).
 *    - Read methods support pagination cursors. Don't return arrays
 *      uncapped from the underlying CRM — both SF and HS have
 *      hard-cap and rate-limit behaviors.
 *    - Capability flags let callers gate optional behavior. E.g.
 *      `if (provider.capabilities.supports_threading) { ... }`.
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
  ProviderCapabilities,
  ProviderName,
  ProviderRef,
  Task,
  TaskPayload,
} from "./types";

export interface CrmProvider {
  /** Provider identity for logging, audit, and capability dispatch */
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;

  // ── Read ──────────────────────────────────────────────────────────────
  getDeal(
    tenantId: string,
    ref: ProviderRef | string,
  ): Promise<Deal>;

  listDeals(
    tenantId: string,
    opts?: { after?: string; limit?: number },
  ): Promise<{ deals: Deal[]; nextAfter?: string }>;

  getContact(
    tenantId: string,
    ref: ProviderRef | string,
  ): Promise<Contact>;

  getCompany(
    tenantId: string,
    ref: ProviderRef | string,
  ): Promise<Company>;

  listActivitiesForDeal(
    tenantId: string,
    ref: ProviderRef | string,
    opts?: { types?: ActivityType[]; since?: string; limit?: number },
  ): Promise<Activity[]>;

  /**
   * Fetch arbitrary fields (standard + custom) from a deal, keyed by the
   * provider's native field names. Used by call-processing to pull SF
   * Northwind custom-field state (Who_is_the_Champion__c etc.) before the
   * extractor runs, and by any downstream code that needs CRM-native
   * field names for the verification framework's prior-state lookups.
   *
   * The fields list is opaque to the provider — caller passes whatever
   * keys the downstream consumer expects. SF provider uses describe+SOQL
   * to filter to fields that exist in the org schema (avoids 400 on
   * INVALID_FIELD). HubSpot provider does a deal GET with the
   * properties param.
   *
   * Returned values are always stringified-or-null for stable downstream
   * handling. Boolean fields render as "true"/"false", numbers as their
   * string form.
   */
  getDealCustomFields(
    tenantId: string,
    ref: ProviderRef | string,
    fields: string[],
  ): Promise<Record<string, string | null>>;

  // ── Write ─────────────────────────────────────────────────────────────
  /**
   * Updates a single field on a deal. The neutral `field` name is
   * translated to the provider's actual property name inside the
   * provider module. Forecast-critical fields (stage, amount,
   * close_date, forecast_category) should never reach this method —
   * the trust-progression guard at the call site enforces that.
   */
  updateDealField(
    tenantId: string,
    ref: ProviderRef | string,
    field: string,
    value: string | number | null,
  ): Promise<Deal>;

  /**
   * Throws or returns a noop sentinel when capabilities.supports_notes
   * is false. Callers should check first.
   */
  createNote(
    tenantId: string,
    dealRef: ProviderRef | string,
    payload: NotePayload,
  ): Promise<Note>;

  /**
   * Throws or returns a noop sentinel when capabilities.supports_tasks
   * is false. Callers should check first.
   */
  createTask(
    tenantId: string,
    dealRef: ProviderRef | string,
    payload: TaskPayload,
  ): Promise<Task>;

  /**
   * Create a fresh inbound lead (no deal yet) — the AI SDR hand-off path.
   * Optional: a provider that can't yet create leads omits it, and the
   * caller (lib/crm) falls back. Returns the new record's external id.
   */
  createInboundLead?(
    tenantId: string,
    payload: LeadPayload,
  ): Promise<{ id: string }>;
}
