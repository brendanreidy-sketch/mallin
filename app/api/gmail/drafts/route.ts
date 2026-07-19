import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createDraft, type GmailDraftPayload } from "@/lib/adapters/gmail";

/**
 * POST /api/gmail/drafts
 *
 * Creates a draft in the user's Gmail Drafts folder. Mallin only ever
 * creates drafts — it never sends. The user sends from their own inbox.
 *
 * Body shape:
 *   { to, subject, bodyHtml, bodyText, threadId?, attribution? }
 *
 * Auth: resolves the user from the Clerk session (auth()), matching the
 * rest of the /api/gmail/* routes. Never trusts a client-supplied id.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
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
