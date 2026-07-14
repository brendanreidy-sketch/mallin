import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAuthorizeUrl } from "@/lib/adapters/gmail";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

/**
 * GET /api/gmail/connect
 *
 * Kicks off the Gmail OAuth flow. The signed-in user clicks "Connect
 * Gmail" on /settings/integrations; that link points here; we redirect
 * them to Google's consent screen with a signed state parameter. Google
 * eventually calls back to /api/gmail/oauth-callback.
 *
 * Auth: requires a Clerk session + an active organization (which maps
 * to a Mallin tenant).
 */
export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "no_tenant", detail: message },
      { status: 400 },
    );
  }

  try {
    const url = getAuthorizeUrl(userId, tenantId);
    return NextResponse.redirect(url);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "build_authorize_url_failed", detail: message },
      { status: 500 },
    );
  }
}
