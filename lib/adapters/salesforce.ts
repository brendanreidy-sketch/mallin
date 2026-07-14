/**
 * ============================================================================
 *  Salesforce adapter — Phase 2 of the build plan
 * ============================================================================
 *
 *  Read + write to Salesforce via OAuth 2.0 Client Credentials flow.
 *  Server-to-server auth, no user / no browser redirect, no SOAP API
 *  required (newer SF orgs disable SOAP by default — this flow works
 *  against REST API only).
 *
 *  Required env (in .env.local):
 *    SF_CLIENT_ID       — External Client App Consumer Key
 *    SF_CLIENT_SECRET   — External Client App Consumer Secret
 *    SF_LOGIN_URL       — Your org instance URL
 *                         (e.g. https://orgfarm-xyz.develop.my.salesforce.com)
 *
 *  Setup:
 *    1. Salesforce Setup → App Manager → New External Client App
 *    2. Enable OAuth, scopes: api + refresh_token
 *    3. After save: Policies → OAuth Policies → enable
 *       Client Credentials Flow with "Run As" user = you
 *    4. Wait ~5 min, retrieve Consumer Key / Secret, add to env
 *
 *  Doctrine alignment (DOCTRINE.md §11.3):
 *    - This adapter is the surface where the system writes to CRM.
 *    - Auto / Suggest / Readonly tier discipline is enforced AT CALL SITE,
 *      not here. This adapter exposes raw read/write; callers must respect
 *      the tier policy. Stage / Amount / CloseDate writes are gated by
 *      route-level checks.
 *    - Each write call records the source value + new value + caller +
 *      timestamp. The audit trail is the caller's responsibility.
 * ============================================================================
 */

import jsforce, { Connection } from "jsforce";

const DEFAULT_LOGIN_URL = "https://login.salesforce.com";
const API_VERSION = "62.0"; // Spring '25 — adjust if env differs

let cachedConnection: Connection | null = null;
let cachedAt = 0;
const CONNECTION_TTL_MS = 1000 * 60 * 30; // 30 min — SF sessions can last hours but we re-auth defensively

export class SalesforceConfigError extends Error {
  constructor(missing: string[]) {
    super(`Missing Salesforce env: ${missing.join(", ")}`);
    this.name = "SalesforceConfigError";
  }
}

function readEnv(): {
  clientId: string;
  clientSecret: string;
  loginUrl: string;
} {
  const clientId = process.env.SF_CLIENT_ID?.trim();
  const clientSecret = process.env.SF_CLIENT_SECRET?.trim();
  const loginUrl = process.env.SF_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
  const missing: string[] = [];
  if (!clientId) missing.push("SF_CLIENT_ID");
  if (!clientSecret) missing.push("SF_CLIENT_SECRET");
  if (missing.length) throw new SalesforceConfigError(missing);
  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    loginUrl,
  };
}

/**
 * Authenticate via OAuth 2.0 Client Credentials flow.
 * Returns access_token + instance_url for REST API calls.
 */
async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  loginUrl: string,
): Promise<{ access_token: string; instance_url: string }> {
  const tokenUrl = `${loginUrl.replace(/\/$/, "")}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(
      `Client Credentials auth failed (${resp.status}): ${txt.slice(0, 400)}`,
    );
  }
  const json = (await resp.json()) as {
    access_token?: string;
    instance_url?: string;
    error?: string;
    error_description?: string;
  };
  if (!json.access_token || !json.instance_url) {
    throw new Error(
      `Client Credentials auth returned no token: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return {
    access_token: json.access_token,
    instance_url: json.instance_url,
  };
}

/**
 * Get an authenticated jsforce Connection via Client Credentials OAuth.
 * Cached per-process for 30 min to avoid re-fetching tokens on every
 * request. Throws SalesforceConfigError if env is missing.
 */
export async function getConnection(): Promise<Connection> {
  if (
    cachedConnection &&
    Date.now() - cachedAt < CONNECTION_TTL_MS
  ) {
    return cachedConnection;
  }
  const { clientId, clientSecret, loginUrl } = readEnv();
  const { access_token, instance_url } = await fetchClientCredentialsToken(
    clientId,
    clientSecret,
    loginUrl,
  );
  const conn = new Connection({
    instanceUrl: instance_url,
    accessToken: access_token,
    version: API_VERSION,
  });
  cachedConnection = conn;
  cachedAt = Date.now();
  return conn;
}

/**
 * Reset the cached connection. Call when env vars change or after auth
 * failure. Next getConnection() will re-login.
 */
export function resetConnection() {
  cachedConnection = null;
  cachedAt = 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

export interface SfOpportunity {
  Id: string;
  Name: string;
  StageName: string;
  Amount: number | null;
  CloseDate: string | null; // YYYY-MM-DD
  AccountId: string | null;
  OwnerId: string;
  NextStep: string | null;
  Description: string | null;
  CreatedDate: string;
  LastActivityDate: string | null;
  IsClosed: boolean;
  IsWon: boolean;
}

export interface SfAccount {
  Id: string;
  Name: string;
  Industry: string | null;
  Website: string | null;
  BillingCity: string | null;
  BillingState: string | null;
  BillingCountry: string | null;
}

/**
 * List open opportunities for the authenticated user's org. Bounded to
 * 100 to avoid runaway queries on dev orgs that have sample data.
 */
export async function listOpenOpportunities(
  limit = 100,
): Promise<SfOpportunity[]> {
  const conn = await getConnection();
  const result = await conn.query<SfOpportunity>(
    `SELECT Id, Name, StageName, Amount, CloseDate, AccountId, OwnerId,
            NextStep, Description, CreatedDate, LastActivityDate,
            IsClosed, IsWon
     FROM Opportunity
     WHERE IsClosed = false
     ORDER BY LastModifiedDate DESC
     LIMIT ${limit}`,
  );
  return result.records;
}

/**
 * Get a single opportunity with full custom field set. Pass an explicit
 * field list — schemas vary per org, so the caller decides what to pull.
 */
export async function getOpportunity(
  id: string,
  fields: string[] = [
    "Id",
    "Name",
    "StageName",
    "Amount",
    "CloseDate",
    "AccountId",
    "OwnerId",
    "NextStep",
    "Description",
    "LastActivityDate",
  ],
): Promise<Record<string, unknown> | null> {
  const conn = await getConnection();
  try {
    const safeId = id.replace(/[^A-Za-z0-9]/g, "");
    const result = await conn.query<Record<string, unknown>>(
      `SELECT ${fields.join(", ")} FROM Opportunity WHERE Id = '${safeId}' LIMIT 1`,
    );
    return result.records[0] ?? null;
  } catch (e) {
    console.warn(`[salesforce] getOpportunity(${id}) failed:`, (e as Error).message);
    return null;
  }
}

export async function getAccount(id: string): Promise<SfAccount | null> {
  const conn = await getConnection();
  try {
    const safeId = id.replace(/[^A-Za-z0-9]/g, "");
    const result = await conn.query<SfAccount>(
      `SELECT Id, Name, Industry, Website, BillingCity, BillingState, BillingCountry
       FROM Account WHERE Id = '${safeId}' LIMIT 1`,
    );
    return result.records[0] ?? null;
  } catch (e) {
    console.warn(`[salesforce] getAccount(${id}) failed:`, (e as Error).message);
    return null;
  }
}

/**
 * Discover the opportunity field schema for THIS org. Returns the
 * complete field metadata so callers can map our substrate fields to
 * their custom field API names. Used during onboarding to populate the
 * field-mapping config.
 */
export async function describeOpportunity(): Promise<{
  fields: Array<{
    name: string;
    label: string;
    type: string;
    custom: boolean;
    nillable: boolean;
    updateable: boolean;
  }>;
}> {
  const conn = await getConnection();
  const meta = await conn.sobject("Opportunity").describe();
  return {
    fields: (meta.fields as Array<{
      name: string;
      label: string;
      type: string;
      custom: boolean;
      nillable: boolean;
      updateable: boolean;
    }>).map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      custom: f.custom,
      nillable: f.nillable,
      updateable: f.updateable,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Writes — gated at call site by tier policy
// ────────────────────────────────────────────────────────────────────────────

/**
 * Update fields on an opportunity. The CALLER is responsible for tier
 * enforcement (auto / suggest / readonly per doctrine §11.3). This
 * function does not gate by field name.
 *
 * Returns the updated record on success.
 */
export async function updateOpportunity(
  id: string,
  fields: Record<string, unknown>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const conn = await getConnection();
  try {
    const result = await conn
      .sobject("Opportunity")
      .update({ Id: id, ...fields });
    if (Array.isArray(result)) {
      // Bulk update — shouldn't happen for single-record path
      return { ok: false, error: "unexpected bulk result" };
    }
    if (result.success) {
      return { ok: true, id: result.id ?? id };
    }
    return {
      ok: false,
      error: (result.errors as Array<{ message: string }>)?.map((e) => e.message).join("; ") ?? "update failed",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Create a Lead from an inbound (AI SDR) qualification. SF Lead requires
 * LastName + Company — we backfill safe placeholders when unknown.
 */
export async function createInboundLead(input: {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  description?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const conn = await getConnection();
  try {
    const result = await conn.sobject("Lead").create({
      LastName: input.name?.trim() || "Inbound lead",
      Company: input.company?.trim() || "(unknown — inbound)",
      Email: input.email,
      Phone: input.phone,
      Title: input.title,
      Description: input.description,
      LeadSource: "Mallin AI SDR",
    });
    if (Array.isArray(result)) return { ok: false, error: "unexpected bulk result" };
    if (result.success) return { ok: true, id: result.id ?? "" };
    return {
      ok: false,
      error: result.errors?.map((e) => e.message).join("; ") ?? "create failed",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Create a Task record (used for capturing call summaries, follow-up
 * notes, etc. — the auto-write tier from doctrine §11.3). WhatId
 * typically points to the Opportunity; WhoId to a Contact.
 */
export async function createTask(input: {
  whatId?: string;
  whoId?: string;
  subject: string;
  description?: string;
  activityDate?: string; // YYYY-MM-DD
  status?: string; // typically "Completed"
  taskSubtype?: "Task" | "Call" | "Email";
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const conn = await getConnection();
  try {
    const result = await conn.sobject("Task").create({
      WhatId: input.whatId,
      WhoId: input.whoId,
      Subject: input.subject,
      Description: input.description,
      ActivityDate: input.activityDate,
      Status: input.status ?? "Completed",
      TaskSubtype: input.taskSubtype ?? "Task",
    });
    if (Array.isArray(result)) {
      return { ok: false, error: "unexpected bulk result" };
    }
    if (result.success) {
      return { ok: true, id: result.id ?? "" };
    }
    return {
      ok: false,
      error: result.errors?.map((e) => e.message).join("; ") ?? "create failed",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
