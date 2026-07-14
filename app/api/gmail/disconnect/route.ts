import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { disconnectGmail } from "@/lib/auth/gmail-oauth";

/**
 * POST /api/gmail/disconnect
 *
 * Removes the Gmail token row for the signed-in user. The next time
 * any adapter function is called for them it'll throw with a "needs
 * to reconnect" error.
 */
export async function POST(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  try {
    await disconnectGmail(userId);
    return NextResponse.redirect(
      new URL("/settings/integrations?gmail=disconnected", _req.url),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "disconnect_failed", detail: message },
      { status: 500 },
    );
  }
}
