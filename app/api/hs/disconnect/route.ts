import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { disconnectHubspot } from "@/lib/auth/hubspot-oauth";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

/**
 * POST /api/hs/disconnect
 *
 * Removes the HubSpot token row for the current tenant. Any rep on
 * this tenant who attempts to use the HubSpot adapter afterward will
 * get a "needs to reconnect" error.
 */
export async function POST(req: NextRequest) {
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
    await disconnectHubspot(tenantId);
    return NextResponse.redirect(
      new URL("/settings/integrations?hubspot=disconnected", req.url),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "disconnect_failed", detail: message },
      { status: 500 },
    );
  }
}
