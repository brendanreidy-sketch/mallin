import { NextResponse, type NextRequest } from "next/server";
import { listDeals } from "@/lib/adapters/hubspot";

/**
 * GET /api/hs/deals?after=<cursor>&limit=<n>
 *
 * Lists deals from the connected HubSpot portal for the current
 * tenant. Used to seed the substrate on first install and to keep
 * the local deal mirror in sync.
 *
 * Mirrors GET /api/sf/diff but for HubSpot.
 *
 * Auth: gated by Clerk middleware. Tenant ID derived from the
 * authenticated user's organization, not from the request.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id");
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "missing_tenant" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const after = url.searchParams.get("after") || undefined;
  const limit = Number(url.searchParams.get("limit") || "50");

  try {
    const { deals, nextAfter } = await listDeals(tenantId, { after, limit });
    return NextResponse.json({ ok: true, deals, nextAfter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { ok: false, error: "list_deals_failed", detail: message },
      { status: 500 },
    );
  }
}
