/**
 * HubSpot OAuth token management.
 *
 * Mirrors lib/auth/gmail-oauth.ts but per-tenant (one HubSpot connection
 * per Mallin tenant; the whole team shares it) instead of per-user.
 *
 * Responsibilities:
 *   1. Build the consent URL HubSpot redirects the user to.
 *   2. Sign + verify state to prevent CSRF / replay.
 *   3. Exchange auth code for tokens after HubSpot redirects back.
 *   4. Persist tokens in Supabase (hubspot_oauth_tokens table).
 *   5. Return a valid access_token to callers, refreshing if necessary.
 *
 * Required scopes (configured in the HubSpot dev app):
 *   crm.objects.deals.read/write
 *   crm.objects.contacts.read/write
 *   crm.objects.companies.read
 *   crm.schemas.deals.read/write
 *   (For HubSpot-as-alert-sink: crm.objects.notes.write — needs adding)
 */
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/db/client";

const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const HUBSPOT_AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const HUBSPOT_ACCESS_TOKEN_INFO_URL =
  "https://api.hubapi.com/oauth/v1/access-tokens";

const REQUIRED_SCOPES = [
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.read",
  "crm.schemas.deals.read",
  "crm.schemas.deals.write",
  "oauth",
].join(" ");

const STATE_TTL_MS = 10 * 60 * 1000;

interface HubSpotTokenRow {
  tenant_id: string;
  hub_id: string;
  hub_domain: string | null;
  connected_by_user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
}

function stateSecret(): string {
  const s = process.env.CLERK_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "No state-signing secret available (need CLERK_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return s;
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url");
}

export function buildState(userId: string, tenantId: string): string {
  const payload = {
    u: userId,
    t: tenantId,
    ts: Date.now(),
    n: crypto.randomBytes(8).toString("base64url"),
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${b64}.${sign(b64)}`;
}

export function verifyState(
  raw: string,
): { userId: string; tenantId: string } {
  const [b64, sig] = raw.split(".");
  if (!b64 || !sig) throw new Error("Malformed state");
  if (sign(b64) !== sig) throw new Error("State signature mismatch");
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  if (Date.now() - payload.ts > STATE_TTL_MS) {
    throw new Error("State expired (>10 min)");
  }
  return { userId: payload.u, tenantId: payload.t };
}

export function buildAuthorizeUrl(userId: string, tenantId: string): string {
  const clientId = process.env.HUBSPOT_OAUTH_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("HubSpot OAuth env not configured");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: REQUIRED_SCOPES,
    state: buildState(userId, tenantId),
  });
  return `${HUBSPOT_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeAndPersist(
  code: string,
  state: string,
): Promise<{ userId: string; tenantId: string; hubId: string; hubDomain: string | null }> {
  const { userId, tenantId } = verifyState(state);

  const clientId = process.env.HUBSPOT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("HubSpot OAuth env not configured");
  }

  const tokenRes = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(
      `HubSpot token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Look up the hub id + portal info to associate the token with a HubSpot
  // org. HubSpot's /oauth/v1/access-tokens/<token> endpoint returns this.
  const infoRes = await fetch(
    `${HUBSPOT_ACCESS_TOKEN_INFO_URL}/${tokens.access_token}`,
  );
  if (!infoRes.ok) {
    throw new Error(
      `HubSpot access token introspect failed: ${infoRes.status} ${await infoRes.text()}`,
    );
  }
  const info = (await infoRes.json()) as {
    hub_id: number;
    hub_domain: string;
    scopes: string[];
  };

  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("hubspot_oauth_tokens")
    .upsert(
      {
        tenant_id: tenantId,
        hub_id: String(info.hub_id),
        hub_domain: info.hub_domain ?? null,
        connected_by_user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: info.scopes.join(" "),
      },
      { onConflict: "tenant_id" },
    );

  if (error) {
    throw new Error(`Failed to persist HubSpot tokens: ${error.message}`);
  }

  return {
    userId,
    tenantId,
    hubId: String(info.hub_id),
    hubDomain: info.hub_domain ?? null,
  };
}

/**
 * Return a valid access token for the given tenant. Refreshes via
 * HubSpot if the stored token is within 60s of expiry. Throws if no
 * token row exists (tenant hasn't connected HubSpot yet).
 */
export async function getAccessTokenForTenant(
  tenantId: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("hubspot_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read HubSpot tokens: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      `No HubSpot connection for tenant ${tenantId}. Connect via /settings/integrations first.`,
    );
  }

  const row = data as HubSpotTokenRow;
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return row.access_token;
  }

  return refreshAndPersist(row);
}

async function refreshAndPersist(row: HubSpotTokenRow): Promise<string> {
  const clientId = process.env.HUBSPOT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("HubSpot OAuth env not configured for refresh");
  }

  const res = await fetch(HUBSPOT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot token refresh failed: ${res.status} ${await res.text()}`,
    );
  }
  const refreshed = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000,
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("hubspot_oauth_tokens")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: expiresAt,
    })
    .eq("tenant_id", row.tenant_id);

  if (error) {
    throw new Error(`Failed to persist refreshed HubSpot token: ${error.message}`);
  }

  return refreshed.access_token;
}

export async function disconnectHubspot(tenantId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("hubspot_oauth_tokens")
    .delete()
    .eq("tenant_id", tenantId);
  if (error) {
    throw new Error(`Failed to disconnect HubSpot: ${error.message}`);
  }
}

export async function getHubspotConnectionStatus(
  tenantId: string,
): Promise<{ connected: boolean; hubDomain?: string; hubId?: string }> {
  const { data, error } = await supabaseAdmin
    .from("hubspot_oauth_tokens")
    .select("hub_id, hub_domain")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return { connected: false };
  const row = data as { hub_id: string; hub_domain: string | null };
  return {
    connected: true,
    hubId: row.hub_id,
    hubDomain: row.hub_domain ?? undefined,
  };
}
