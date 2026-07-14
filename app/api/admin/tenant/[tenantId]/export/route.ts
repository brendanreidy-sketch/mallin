/**
 * GET /api/admin/tenant/[tenantId]/export
 *
 * Returns a full JSON export of one tenant's data (GDPR/CCPA portability).
 * Admin-only: the handler self-authenticates (Clerk session + owner allowlist)
 * — see middleware.ts, where /api/admin/(.*) is public to Clerk so this route
 * returns its own 401/403 JSON instead of a cached auth.protect() 404.
 *
 * Internal tool for now (fulfilling data requests within the retention-policy
 * window), not a self-serve customer endpoint.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import { exportTenantData } from "@/lib/compliance/tenant-data";
import { recordAudit } from "@/lib/audit/record";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (!(await hasCockpitAccess())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { tenantId } = await params;
  const data = await exportTenantData(tenantId);

  await recordAudit({
    tenantId,
    actorUserId: userId,
    action: "tenant.export",
    entity: `tenant:${tenantId}`,
    meta: { tables: Object.keys(data.tables).length, skipped: data.skipped },
  });

  return NextResponse.json({ ok: true, export: data });
}
