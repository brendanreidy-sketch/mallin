import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAuthorizeUrl } from "@/lib/adapters/hubspot";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

/**
 * GET /api/hs/connect
 *
 * Kicks off the HubSpot OAuth flow. The signed-in user clicks
 * "Connect HubSpot" on /settings/integrations; we redirect them to
 * HubSpot's consent screen with a signed state. HubSpot calls back to
 * /api/hs/oauth-callback when done.
 *
 * Note: HubSpot OAuth is *per-tenant* (one connection per
 * organization), unlike Gmail which is per-user. So technically only
 * one rep per tenant needs to do this; the rest of the team benefits.
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
