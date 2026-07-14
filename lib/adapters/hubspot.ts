/**
 * HubSpot adapter — CRM read/write parity with Salesforce.
 *
 * STATUS: Scaffolded May 11 2026. Awaiting HubSpot developer app
 * registration before live use.
 *
 * ───────────────────────────────────────────────────────────────────
 * SETUP STEPS (one-time, per environment):
 *
 * 1. Go to https://developers.hubspot.com → sign up as a developer
 * 2. Create a new app: Apps → Create app
 *    - App name: Mallin
 *    - Description: agentic-AI revenue ops layer
 * 3. Auth tab → set redirect URLs:
 *        https://mallin.io/api/hs/oauth-callback        (prod)
 *        https://<preview>.vercel.app/api/hs/oauth-callback (preview)
 *        http://localhost:3000/api/hs/oauth-callback    (local)
 * 4. Scopes (Required):
 *        crm.objects.deals.read
 *        crm.objects.deals.write
 *        crm.objects.contacts.read
 *        crm.objects.contacts.write
 *        crm.objects.companies.read
 *        crm.schemas.deals.read       (for custom MEDDPICC properties)
 *        crm.schemas.deals.write      (to create custom properties)
 *
 *    TODO: add the email-ingestion scope when Phase B (backfill / live
 *    sync) is greenlit. Phase A scaffolds the adapter functions but
 *    they cannot read live data without this scope:
 *        crm.objects.emails.read
 * 5. Copy Client ID + Client Secret → .env.local:
 *        HUBSPOT_OAUTH_CLIENT_ID=...
 *        HUBSPOT_OAUTH_CLIENT_SECRET=...
 *        HUBSPOT_OAUTH_REDIRECT_URI=https://mallin.io/api/hs/oauth-callback
 *
 * ───────────────────────────────────────────────────────────────────
 * DATA STORAGE:
 *
 * Per-tenant tokens stored in Supabase table `hubspot_oauth_tokens`:
 *   tenant_id      (uuid)
 *   hub_id         (text, HubSpot portal ID)
 *   access_token   (text, encrypted)
 *   refresh_token  (text, encrypted)
 *   expires_at     (timestamptz)
 *   scope          (text)
 *   created_at     (timestamptz)
 *   updated_at     (timestamptz)
 *
 * RLS: tenant_id matches the customer's tenant scope.
 *
 * ───────────────────────────────────────────────────────────────────
 * CUSTOM PROPERTIES FOR MEDDPICC:
 *
 * HubSpot doesn't ship with MEDDPICC fields out of the box. On first
 * install, the adapter creates these custom properties on the Deal
 * object (via crm.schemas.deals.write):
 *
 *   mallin_meddpicc_metrics
 *   mallin_meddpicc_economic_buyer
 *   mallin_meddpicc_decision_criteria
 *   mallin_meddpicc_decision_process
 *   mallin_meddpicc_paper_process
 *   mallin_meddpicc_identify_pain
 *   mallin_meddpicc_champion
 *   mallin_meddpicc_competition
 *
 * Plus the trust-progression metadata:
 *   mallin_last_alert_severity
 *   mallin_last_alert_reason
 *   mallin_last_alert_fired_at
 *
 * Never-auto fields stay as native HubSpot properties:
 *   dealstage, amount, closedate, hs_forecast_category
 *
 * ───────────────────────────────────────────────────────────────────
 * INTEGRATION WITH MALLIN AGENTS:
 *
 * The CRM abstraction layer (lib/crm/, to be built in Phase 3) will
 * sit between the verification framework and the concrete adapters.
 * Today, the SF adapter is called directly. In Phase 3:
 *
 *   crm.updateDeal(tenantId, dealId, field, value)
 *     → routes to SF or HS adapter based on tenant config
 *
 * Until Phase 3 lands, this file stands as the scaffold for the HS
 * implementation. Pulling it in is a wiring change, not a rewrite.
 */

import {
  buildAuthorizeUrl as hubspotOAuthBuildAuthorizeUrl,
  exchangeCodeAndPersist as hubspotOAuthExchangeCodeAndPersist,
  getAccessTokenForTenant as hubspotOAuthGetAccessTokenForTenant,
} from "@/lib/auth/hubspot-oauth";

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
    hs_forecast_category?: string;
    mallin_meddpicc_champion?: string;
    mallin_meddpicc_competition?: string;
    mallin_last_alert_severity?: string;
    mallin_last_alert_reason?: string;
    mallin_last_alert_fired_at?: string;
    [customProperty: string]: string | undefined;
  };
  associations?: {
    contacts?: { results: { id: string }[] };
    companies?: { results: { id: string }[] };
  };
}

export interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    jobtitle?: string;
    company?: string;
  };
}

export interface HubSpotCompany {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    industry?: string;
    numberofemployees?: string;
  };
}

/**
 * Raw HubSpot Email engagement (CRM v3). Returned by:
 *   GET /crm/v3/objects/emails/{id}
 *   GET /crm/v3/objects/emails
 *   GET /crm/v3/objects/deals/{dealId}/associations/emails (ID only)
 *
 * HubSpot stores both HubSpot-sent emails (via their Outlook/Gmail
 * tracking extension or sequences) and emails logged via BCC address.
 * The `hs_email_direction` field is the disambiguator.
 */
export interface HubSpotEmail {
  id: string;
  properties: {
    hs_email_subject?: string;
    hs_email_text?: string;
    hs_email_html?: string;
    hs_email_direction?:
      | "INCOMING_EMAIL"
      | "EMAIL"
      | "FORWARDED_EMAIL"
      | string;
    hs_email_from_email?: string;
    hs_email_from_firstname?: string;
    hs_email_from_lastname?: string;
    hs_email_to_email?: string;
    hs_email_cc_email?: string;
    hs_email_bcc_email?: string;
    hs_email_status?: string;
    hs_email_thread_id?: string;
    hs_timestamp?: string;
    createdate?: string;
    [extra: string]: string | undefined;
  };
  associations?: {
    deals?: { results: { id: string }[] };
    contacts?: { results: { id: string }[] };
  };
}

/**
 * Shape this adapter emits — aligned with the substrate `emails` table
 * so callers can upsert directly. Substrate has a unique index on
 *   (tenant_id, source_system, source_external_id)
 * which is what `emailDedupeKey()` returns.
 *
 * `provider` is constrained by the existing emails table check
 * constraint to ('gmail' | 'outlook' | 'manual'). HubSpot doesn't
 * always say which underlying mailbox produced the email, so we
 * default to 'manual' (i.e. "came in through HubSpot's logging
 * surface") and let a future enrichment pass refine if needed.
 */
export interface HubSpotEmailNormalized {
  source_system: "hubspot";
  source_external_id: string;
  sent_at: string;
  subject: string | null;
  snippet: string | null;
  provider: "manual";
  thread_id: string | null;
  from_name: string | null;
  from_email: string | null;
  direction: "incoming" | "outgoing" | "unknown";
  to_emails: string[];
  cc_emails: string[];
  hubspot_deal_ids: string[];
  hubspot_contact_ids: string[];
}

/**
 * Dedupe key for upserting a HubSpot email into the substrate `emails`
 * table. Matches the existing unique index
 *   (tenant_id, source_system, source_external_id).
 *
 * Pure — no I/O. Safe to call without OAuth wired.
 */
export function emailDedupeKey(
  tenantId: string,
  hubspotEmailId: string,
): { tenant_id: string; source_system: "hubspot"; source_external_id: string } {
  return {
    tenant_id: tenantId,
    source_system: "hubspot",
    source_external_id: hubspotEmailId,
  };
}

/**
 * Map a raw HubSpot Email into the substrate-aligned shape. Pure —
 * no I/O, no OAuth, fully unit-testable.
 *
 * Snippet truncation: 280 chars (~2 lines). The full body should be
 * fetched separately if needed; the snippet is what the substrate
 * surfaces in lists and what coaching reads for recency signal.
 */
export function hubspotEmailToNormalized(
  hsEmail: HubSpotEmail,
): HubSpotEmailNormalized {
  const p = hsEmail.properties ?? {};
  const bodyText = p.hs_email_text ?? stripHtml(p.hs_email_html ?? "");
  const snippet = bodyText ? bodyText.slice(0, 280) : null;

  const fromName = [p.hs_email_from_firstname, p.hs_email_from_lastname]
    .filter(Boolean)
    .join(" ")
    .trim();

  const sentAt =
    p.hs_timestamp ??
    p.createdate ??
    new Date(0).toISOString();

  return {
    source_system: "hubspot",
    source_external_id: hsEmail.id,
    sent_at: sentAt,
    subject: p.hs_email_subject ?? null,
    snippet,
    provider: "manual",
    thread_id: p.hs_email_thread_id ?? null,
    from_name: fromName.length > 0 ? fromName : null,
    from_email: p.hs_email_from_email ?? null,
    direction: directionOf(p.hs_email_direction),
    to_emails: splitEmailList(p.hs_email_to_email),
    cc_emails: splitEmailList(p.hs_email_cc_email),
    hubspot_deal_ids:
      hsEmail.associations?.deals?.results.map((r) => r.id) ?? [],
    hubspot_contact_ids:
      hsEmail.associations?.contacts?.results.map((r) => r.id) ?? [],
  };
}

function directionOf(
  raw: string | undefined,
): "incoming" | "outgoing" | "unknown" {
  if (!raw) return "unknown";
  if (raw === "INCOMING_EMAIL") return "incoming";
  if (raw === "EMAIL" || raw === "FORWARDED_EMAIL") return "outgoing";
  return "unknown";
}

function splitEmailList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * List deals for a tenant (paginated). Used to seed the substrate on
 * first install and to keep the local mirror in sync.
 */
export async function listDeals(
  tenantId: string,
  params: { after?: string; limit?: number } = {},
): Promise<{ deals: HubSpotDeal[]; nextAfter?: string }> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);
  const qs = new URLSearchParams({
    limit: String(Math.min(params.limit ?? 100, 100)),
    associations: "contacts,companies",
  });
  if (params.after) qs.set("after", params.after);
  const resp = await hubspotGet<{
    results: HubSpotDeal[];
    paging?: { next?: { after: string } };
  }>(token, `/crm/v3/objects/deals?${qs.toString()}`);
  return {
    deals: resp.results,
    nextAfter: resp.paging?.next?.after,
  };
}

/** Read a single deal with full property + association detail. */
export async function getDeal(
  tenantId: string,
  dealId: string,
): Promise<HubSpotDeal> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);
  return hubspotGet<HubSpotDeal>(
    token,
    `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?associations=contacts,companies`,
  );
}

/**
 * Update a single property on a deal. The Mallin trust progression
 * decides whether this is called automatically (Stage 3, only for
 * earned fields) or via user click (Stage 1/2).
 *
 * NEVER called for: dealstage, amount, closedate, hs_forecast_category.
 * Those are forecast-critical and stay human-owned.
 */
export async function updateDealProperty(
  tenantId: string,
  dealId: string,
  property: string,
  value: string,
): Promise<HubSpotDeal> {
  if (FORBIDDEN_AUTO_PROPERTIES.has(property)) {
    throw new Error(
      `Refusing to auto-write ${property}: forecast-critical field, never auto-written by Mallin.`,
    );
  }
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: { [property]: value } }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `HubSpot PATCH deal failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as HubSpotDeal;
}

/** Get a contact (champion, signer, etc) by ID. */
export async function getContact(
  tenantId: string,
  contactId: string,
): Promise<HubSpotContact> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);
  return hubspotGet<HubSpotContact>(
    token,
    `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
  );
}

/** Get a company. */
export async function getCompany(
  tenantId: string,
  companyId: string,
): Promise<HubSpotCompany> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);
  return hubspotGet<HubSpotCompany>(
    token,
    `/crm/v3/objects/companies/${encodeURIComponent(companyId)}`,
  );
}

/**
 * On first install: create the Mallin custom properties on the Deal
 * schema. Idempotent. Safe to call repeatedly.
 */
export async function ensureCustomProperties(
  tenantId: string,
): Promise<{ created: string[]; existing: string[] }> {
  ensureConfigured();
  throw new Error(
    `HubSpot OAuth not yet wired up. tenant=${tenantId}.`,
  );
}

/**
 * Build the HubSpot OAuth consent URL. The caller redirects the user
 * here; HubSpot calls back to /api/hs/oauth-callback.
 */
export function getAuthorizeUrl(userId: string, tenantId: string): string {
  ensureConfigured();
  return hubspotOAuthBuildAuthorizeUrl(userId, tenantId);
}

/** Exchange the OAuth code for tokens and persist them. */
export async function exchangeCodeForTokens(
  code: string,
  state: string,
): Promise<{ tenantId: string; hubId: string; hubDomain: string | null }> {
  ensureConfigured();
  return hubspotOAuthExchangeCodeAndPersist(code, state);
}

/**
 * List emails associated with a specific deal. Returns normalized
 * records ready to upsert into the substrate `emails` table.
 *
 * Two-hop call:
 *   1. GET /crm/v3/objects/deals/{dealId}/associations/emails (ID list)
 *   2. POST /crm/v3/objects/emails/batch/read (fetch properties + assocs)
 *
 * Pagination: HubSpot caps batch read at 100 IDs per call. We chunk
 * the ID list and concatenate results.
 */
export async function listEmailsForDeal(
  tenantId: string,
  dealId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts: { limit?: number } = {},
): Promise<HubSpotEmailNormalized[]> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);

  const assocPath = `/crm/v3/objects/deals/${encodeURIComponent(
    dealId,
  )}/associations/emails`;
  const assocResp = await hubspotGet<{ results: { id: string }[] }>(
    token,
    assocPath,
  );
  const ids = assocResp.results.map((r) => r.id);
  if (ids.length === 0) return [];

  const out: HubSpotEmailNormalized[] = [];
  for (const chunk of chunkArray(ids, 100)) {
    const batch = await hubspotPost<{ results: HubSpotEmail[] }>(
      token,
      `/crm/v3/objects/emails/batch/read`,
      {
        properties: EMAIL_PROPERTIES,
        propertiesWithHistory: [],
        inputs: chunk.map((id) => ({ id })),
      },
    );
    for (const e of batch.results) {
      out.push(hubspotEmailToNormalized(e));
    }
  }
  return out;
}

/**
 * Fetch a single email engagement with associated contacts + deals.
 */
export async function getEmail(
  tenantId: string,
  emailId: string,
): Promise<HubSpotEmailNormalized> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);

  const path =
    `/crm/v3/objects/emails/${encodeURIComponent(emailId)}` +
    `?properties=${EMAIL_PROPERTIES.join(",")}` +
    `&associations=deals,contacts`;
  const raw = await hubspotGet<HubSpotEmail>(token, path);
  return hubspotEmailToNormalized(raw);
}

/**
 * List emails newer than `sinceIso` across the entire portal. Intended
 * for incremental sync (Phase B), but exposed now so the call-shape is
 * locked in before backfill is wired.
 *
 * Uses the search API with hs_timestamp >= sinceIso. Paginates via
 * `after` cursor.
 */
export async function listEmailsSince(
  tenantId: string,
  sinceIso: string,
  opts: { limit?: number; after?: string } = {},
): Promise<{ emails: HubSpotEmailNormalized[]; nextAfter?: string }> {
  ensureConfigured();
  const token = await getAccessTokenForTenant(tenantId);

  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "hs_timestamp",
            operator: "GTE",
            value: new Date(sinceIso).getTime().toString(),
          },
        ],
      },
    ],
    sorts: ["hs_timestamp"],
    properties: EMAIL_PROPERTIES,
    limit: Math.min(opts.limit ?? 100, 100),
    after: opts.after,
  };

  const resp = await hubspotPost<{
    results: HubSpotEmail[];
    paging?: { next?: { after: string } };
  }>(token, `/crm/v3/objects/emails/search`, body);

  return {
    emails: resp.results.map(hubspotEmailToNormalized),
    nextAfter: resp.paging?.next?.after,
  };
}

const EMAIL_PROPERTIES = [
  "hs_email_subject",
  "hs_email_text",
  "hs_email_html",
  "hs_email_direction",
  "hs_email_from_email",
  "hs_email_from_firstname",
  "hs_email_from_lastname",
  "hs_email_to_email",
  "hs_email_cc_email",
  "hs_email_status",
  "hs_email_thread_id",
  "hs_timestamp",
  "createdate",
];

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolve a tenant's HubSpot access token. Delegates to the helper at
 * lib/auth/hubspot-oauth.ts which handles refresh-on-near-expiry.
 */
async function getAccessTokenForTenant(tenantId: string): Promise<string> {
  return hubspotOAuthGetAccessTokenForTenant(tenantId);
}

async function hubspotGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot GET ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

async function hubspotPost<T>(
  token: string,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot POST ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Properties Mallin will NEVER auto-write to, regardless of trust
 * stage or customer config. Forecast-critical state stays human-owned.
 */
const FORBIDDEN_AUTO_PROPERTIES = new Set<string>([
  "dealstage",
  "amount",
  "closedate",
  "hs_forecast_category",
]);

function ensureConfigured(): void {
  const missing: string[] = [];
  if (!process.env.HUBSPOT_OAUTH_CLIENT_ID)
    missing.push("HUBSPOT_OAUTH_CLIENT_ID");
  if (!process.env.HUBSPOT_OAUTH_CLIENT_SECRET)
    missing.push("HUBSPOT_OAUTH_CLIENT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `HubSpot adapter missing env: ${missing.join(", ")}. See lib/adapters/hubspot.ts header.`,
    );
  }
}
