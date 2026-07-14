/**
 * Gmail OAuth token management.
 *
 * Responsibilities:
 *   1. Build the consent URL Google redirects the user to.
 *   2. Sign + verify a state parameter to prevent CSRF / replay.
 *   3. Exchange an auth code for tokens after Google redirects back.
 *   4. Persist tokens in Supabase (gmail_oauth_tokens table).
 *   5. Return a valid access_token to callers, refreshing if necessary.
 *
 * This is the single point the gmail adapter routes through. Wiring
 * here is the only thing that flips Gmail from "OAuth ready" to "Live".
 */
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/db/client";

/**
 * Short, rep-facing message for "Gmail isn't set up." Surfaced verbatim to
 * the rep when the gmail_oauth_tokens table is missing OR the rep hasn't
 * connected yet. No Postgres jargon, no "schema cache", no user ids.
 */
export const GMAIL_NOT_CONNECTED_MESSAGE = "Gmail isn't connected yet.";

/**
 * True when a Supabase/Postgres error means the gmail_oauth_tokens table
 * doesn't exist yet (migration 003 not applied). PostgREST returns
 * PGRST205 ("Could not find the table ... in the schema cache"); Postgres
 * itself uses 42P01 (undefined_table). We also string-match defensively in
 * case the error is re-wrapped without a code.
 */
function isMissingTableError(err: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    (msg.includes("gmail_oauth_tokens") &&
      (msg.includes("could not find") || msg.includes("does not exist")))
  );
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "openid",
  "email",
].join(" ");

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface GmailTokenRow {
  user_id: string;
  tenant_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
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

/**
 * Build a state token: base64(JSON{userId, tenantId, ts, nonce}).sig
 * The sig is HMAC-SHA256 over the base64 payload using a server-side
 * secret. Prevents an attacker from forging a state that ties to
 * another user.
 */
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

/**
 * Verify a state token. Throws on tamper, wrong signature, or expiry.
 */
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

/**
 * Build the Google OAuth consent URL. The caller redirects the user
 * here; Google calls back to GOOGLE_OAUTH_REDIRECT_URI with ?code= and
 * ?state=.
 */
export function buildAuthorizeUrl(userId: string, tenantId: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("Gmail OAuth env not configured");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: REQUIRED_SCOPES,
    access_type: "offline", // get a refresh token
    prompt: "consent", // force consent screen so refresh_token always returned
    state: buildState(userId, tenantId),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an auth code for tokens. Called by the OAuth callback route
 * after Google redirects with ?code= and ?state=. Persists tokens.
 */
export async function exchangeCodeAndPersist(
  code: string,
  state: string,
): Promise<{ userId: string; tenantId: string; googleEmail: string }> {
  const { userId, tenantId } = verifyState(state);

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Gmail OAuth env not configured");
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(
      `Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`,
    );
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  };

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. Make sure access_type=offline and prompt=consent are set.",
    );
  }

  // Extract email from id_token (it's a JWT; payload is base64-encoded JSON).
  const googleEmail = extractEmailFromIdToken(tokens.id_token);

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error } = await supabaseAdmin
    .from("gmail_oauth_tokens")
    .upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        google_email: googleEmail,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(`Failed to persist Gmail tokens: ${error.message}`);
  }

  return { userId, tenantId, googleEmail };
}

function extractEmailFromIdToken(idToken: string | undefined): string {
  if (!idToken) return "unknown@unknown";
  const parts = idToken.split(".");
  if (parts.length < 2) return "unknown@unknown";
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return payload.email ?? "unknown@unknown";
  } catch {
    return "unknown@unknown";
  }
}

/**
 * Return a valid access token for the given user. Refreshes via Google
 * if the stored token is within 60s of expiry. Throws if no token row
 * exists (user hasn't connected Gmail yet).
 */
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("gmail_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Table not created yet (migration 003 not applied to this env) reads
    // as "not connected" to the rep — not a raw Postgres schema-cache error.
    if (isMissingTableError(error)) {
      throw new Error(GMAIL_NOT_CONNECTED_MESSAGE);
    }
    // Any other read failure: a short, plain message — never the raw
    // Postgres text.
    throw new Error("Couldn't reach Gmail — try again in a moment.");
  }
  if (!data) {
    throw new Error(GMAIL_NOT_CONNECTED_MESSAGE);
  }

  const row = data as GmailTokenRow;
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return row.access_token;
  }

  // Need to refresh.
  return refreshAndPersist(row);
}

async function refreshAndPersist(row: GmailTokenRow): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth env not configured for refresh");
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Google token refresh failed: ${res.status} ${await res.text()}`,
    );
  }
  const refreshed = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };

  const expiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000,
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("gmail_oauth_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: expiresAt,
    })
    .eq("user_id", row.user_id);

  if (error) {
    throw new Error(`Failed to persist refreshed token: ${error.message}`);
  }

  return refreshed.access_token;
}

/**
 * Disconnect: remove tokens for a user. Used by the "Disconnect Gmail"
 * button (which we'll build later) and by error-recovery flows when a
 * refresh fails permanently.
 */
export async function disconnectGmail(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("gmail_oauth_tokens")
    .delete()
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to disconnect Gmail: ${error.message}`);
  }
}

/**
 * Check if a user has Gmail connected — used by UI to show
 * "Connect Gmail" vs "Connected to {email}".
 */
export async function getGmailConnectionStatus(
  userId: string,
): Promise<{ connected: boolean; googleEmail?: string }> {
  const { data, error } = await supabaseAdmin
    .from("gmail_oauth_tokens")
    .select("google_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { connected: false };
  return { connected: true, googleEmail: (data as { google_email: string }).google_email };
}
