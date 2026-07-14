/**
 * Gmail adapter — drafts.create + threads.list + voice-conditioning.
 *
 * STATUS: OAuth flow wired May 12 2026 (feat/gmail-oauth).
 *   - getAuthorizeUrl / exchangeCodeForTokens: live (route through
 *     lib/auth/gmail-oauth.ts which handles state CSRF + token
 *     persistence in gmail_oauth_tokens).
 *   - createDraft: live (calls Gmail v1 REST API with token from
 *     getAccessTokenForUser).
 *   - listSentThreads / getMessage: scaffolded for Phase B follow-up
 *     (voice-conditioning needs them but the rep-behavior agent isn't
 *     wired yet).
 *
 * ───────────────────────────────────────────────────────────────────
 * SETUP (one-time, per environment) — see lib/auth/gmail-oauth.ts for
 * env var requirements:
 *
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REDIRECT_URI (e.g. https://mallin.io/api/gmail/oauth-callback)
 *
 * ───────────────────────────────────────────────────────────────────
 * INTEGRATION WITH MALLIN AGENTS:
 *
 * - Execution agent calls createDraft() to drop a Mallin-drafted
 *   follow-up into the rep's Drafts folder. The rep clicks Send from
 *   their own inbox — Mallin never sends.
 *
 * - For follow-up drafts to in-progress threads, the execution agent
 *   passes threadId so the draft lands as a reply in-thread.
 */
import {
  buildAuthorizeUrl,
  exchangeCodeAndPersist,
  getAccessTokenForUser,
} from "@/lib/auth/gmail-oauth";

export interface GmailDraftPayload {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  threadId?: string;
  /** "Drafted in your voice by Mallin from call N on date" */
  attribution?: string;
}

export interface GmailDraft {
  id: string;
  threadId: string;
  message: {
    id: string;
    raw: string;
  };
}

export interface GmailThread {
  id: string;
  historyId: string;
  messageCount: number;
  snippet: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
}

/**
 * Build the Google OAuth consent URL for a rep to grant Mallin access
 * to their Gmail. The caller redirects the user here; Google calls
 * back to /api/gmail/oauth-callback.
 *
 * Returns a URL with a signed state token that ties the consent flow
 * back to this user + tenant (CSRF protection).
 */
export function getAuthorizeUrl(userId: string, tenantId: string): string {
  ensureConfigured();
  return buildAuthorizeUrl(userId, tenantId);
}

/**
 * Exchange the auth code from Google's callback for tokens; persist
 * them in gmail_oauth_tokens. State is verified inside.
 */
export async function exchangeCodeForTokens(
  code: string,
  state: string,
): Promise<{ userId: string; tenantId: string; googleEmail: string }> {
  ensureConfigured();
  return exchangeCodeAndPersist(code, state);
}

/**
 * Create a draft in the user's Gmail Drafts folder. Does NOT send.
 * The rep clicks Send from their own inbox.
 *
 * Throws if the user hasn't connected Gmail yet (no token row).
 */
export async function createDraft(
  userId: string,
  payload: GmailDraftPayload,
): Promise<GmailDraft> {
  ensureConfigured();
  const accessToken = await getAccessTokenForUser(userId);

  const mime = buildMimeMessage(payload);
  const raw = Buffer.from(mime).toString("base64url");

  const body = payload.threadId
    ? { message: { raw, threadId: payload.threadId } }
    : { message: { raw } };

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Gmail drafts.create failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as GmailDraft;
}

/**
 * List recent sent threads for voice-conditioning. Phase B follow-up.
 * Wire the API call when rep-behavior agent needs it.
 */
export async function listSentThreads(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params: { maxResults?: number; pageToken?: string } = {},
): Promise<GmailThread[]> {
  ensureConfigured();
  // Verify the user is connected (will throw if not — gives a clearer
  // error than a bare "not implemented")
  await getAccessTokenForUser(userId);
  throw new Error(
    "listSentThreads not yet implemented — Phase B follow-up. " +
      "Wire when rep-behavior agent needs voice conditioning.",
  );
}

/**
 * Fetch a single message body. Phase B follow-up.
 */
export async function getMessage(
  userId: string,
  messageId: string,
): Promise<GmailMessage> {
  ensureConfigured();
  await getAccessTokenForUser(userId);
  throw new Error(
    `getMessage not yet implemented — Phase B follow-up. messageId=${messageId}`,
  );
}

/**
 * Build a RFC 2822 MIME message from the payload. Gmail's drafts.create
 * expects raw base64-encoded message bytes.
 */
function buildMimeMessage(p: GmailDraftPayload): string {
  const headers = [
    `To: ${p.to}`,
    `Subject: ${p.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="MALLIN_BOUNDARY"',
  ];

  const textPart = [
    "--MALLIN_BOUNDARY",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    p.bodyText,
  ].join("\r\n");

  const htmlPart = [
    "--MALLIN_BOUNDARY",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    p.bodyHtml,
  ].join("\r\n");

  const closing = "--MALLIN_BOUNDARY--";

  return [headers.join("\r\n"), "", textPart, "", htmlPart, "", closing].join(
    "\r\n",
  );
}

function ensureConfigured(): void {
  const missing: string[] = [];
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID)
    missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!process.env.GOOGLE_OAUTH_REDIRECT_URI)
    missing.push("GOOGLE_OAUTH_REDIRECT_URI");
  if (missing.length > 0) {
    throw new Error(
      `Gmail adapter missing env: ${missing.join(", ")}. See lib/adapters/gmail.ts header.`,
    );
  }
}
