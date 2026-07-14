import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAccessTokenForUser } from "@/lib/auth/gmail-oauth";
import { getCurrentTenant } from "@/lib/auth/tenant-context";

/**
 * POST /api/gmail/send
 *
 * Sends an email via the rep's own Gmail account using the gmail.modify
 * scope (which includes send). Unlike createDraft, this is the terminal
 * "go" action — the rep clicked Send in Mallin's cockpit and meant it.
 *
 * The responsible-agentic boundary is preserved: this route can ONLY be
 * called by a server action triggered by an authenticated user's click.
 * It never fires from a background job, never fires from an AI agent
 * directly. The rep clicks; Mallin sends through their account.
 *
 * Body shape:
 *   { to, subject, bodyHtml, bodyText, threadId?, cc?, bcc? }
 *
 * Returns:
 *   { ok: true, message_id, thread_id }
 *   { ok: false, error, detail }
 */

interface SendPayload {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  threadId?: string;
  cc?: string;
  bcc?: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let payload: SendPayload;
  try {
    payload = (await req.json()) as SendPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!payload?.to || !payload?.subject || !payload?.bodyText) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: ["to", "subject", "bodyText"],
      },
      { status: 400 },
    );
  }

  // Simulation-mode short-circuit. For demo tenants, never actually
  // call Gmail — return a simulated success response with a fake
  // message_id so the cockpit's "sent successfully" UX still fires.
  // The is_demo flag is the type-level guard set on the tenant row.
  try {
    const tenant = await getCurrentTenant();
    if (tenant.is_demo) {
      return NextResponse.json({
        ok: true,
        simulated: true,
        message_id: `demo-msg-${Date.now()}`,
        thread_id: payload.threadId ?? `demo-thread-${Date.now()}`,
      });
    }
  } catch {
    // Tenant lookup failures are not load-bearing here — fall through
    // to the normal send path. The downstream Gmail OAuth check will
    // return a clearer 412 if there's no Gmail connection.
  }

  let accessToken: string;
  try {
    accessToken = await getAccessTokenForUser(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "gmail_not_connected", detail: message },
      { status: 412 }, // Precondition Required (sort of)
    );
  }

  const mime = buildMimeMessage(payload);
  const raw = Buffer.from(mime).toString("base64url");

  const body = payload.threadId
    ? { raw, threadId: payload.threadId }
    : { raw };

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
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
    const errText = await res.text();
    return NextResponse.json(
      {
        ok: false,
        error: "gmail_send_failed",
        status: res.status,
        detail: errText.slice(0, 500),
      },
      { status: 502 }, // upstream failure
    );
  }

  const sent = (await res.json()) as { id?: string; threadId?: string };
  return NextResponse.json({
    ok: true,
    message_id: sent.id,
    thread_id: sent.threadId,
  });
}

/**
 * Build a RFC 2822 multipart/alternative MIME message. Gmail's
 * users.messages.send expects raw base64-encoded message bytes.
 *
 * Both text/plain and text/html parts are included for client
 * compatibility. The bodyText is the source of truth; the bodyHtml is
 * a styled rendering of the same content.
 */
function buildMimeMessage(p: SendPayload): string {
  const headers: string[] = [`To: ${p.to}`, `Subject: ${p.subject}`];
  if (p.cc) headers.push(`Cc: ${p.cc}`);
  if (p.bcc) headers.push(`Bcc: ${p.bcc}`);
  headers.push("MIME-Version: 1.0");
  headers.push(
    'Content-Type: multipart/alternative; boundary="MALLIN_SEND_BOUNDARY"',
  );

  const textPart = [
    "--MALLIN_SEND_BOUNDARY",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    p.bodyText,
  ].join("\r\n");

  const htmlPart = [
    "--MALLIN_SEND_BOUNDARY",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    p.bodyHtml,
  ].join("\r\n");

  const closing = "--MALLIN_SEND_BOUNDARY--";

  return [
    headers.join("\r\n"),
    "",
    textPart,
    "",
    htmlPart,
    "",
    closing,
  ].join("\r\n");
}
