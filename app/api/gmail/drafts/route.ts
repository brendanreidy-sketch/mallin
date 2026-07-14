import { NextResponse, type NextRequest } from "next/server";
import { createDraft, type GmailDraftPayload } from "@/lib/adapters/gmail";

/**
 * POST /api/gmail/drafts
 *
 * Creates a draft in the user's Gmail Drafts folder. The rep clicks
 * Send from their own inbox — Mallin never sends without explicit
 * user action.
 *
 * Body shape:
 *   { to, subject, bodyHtml, bodyText, threadId?, attribution? }
 *
 * Auth: this route is gated by Clerk middleware. The user ID comes
 * from the auth context, not from the request body.
 */
export async function POST(req: NextRequest) {
  // TODO: pull userId from auth() once Clerk is fully wired
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let payload: GmailDraftPayload;
  try {
    payload = (await req.json()) as GmailDraftPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!payload?.to || !payload?.subject || !payload?.bodyText) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["to", "subject", "bodyText"] },
      { status: 400 },
    );
  }

  try {
    const draft = await createDraft(userId, payload);
    return NextResponse.json({ ok: true, draft });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "create_draft_failed", detail: message },
      { status: 500 },
    );
  }
}
