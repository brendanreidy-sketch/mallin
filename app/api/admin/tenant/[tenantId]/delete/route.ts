/**
 * POST /api/admin/tenant/[tenantId]/delete
 *
 * Permanently deletes one tenant's data (GDPR/CCPA erasure). This is what
 * makes the retention policy's "deleted within 30 days of request" promise
 * real. Admin-only + requires an explicit confirmation token in the body to
 * prevent accidents:
 *
 *   POST { "confirm": "<tenantId>" }
 *
 * The action is audited AFTER deletion — audit_log is not tenant-cascaded, so
 * the record survives as proof the request was honored.
 *
 * Internal tool for now (staff fulfilling a request), not self-serve.
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import { deleteTenantData } from "@/lib/compliance/tenant-data";
import { recordAudit } from "@/lib/audit/record";

export async function POST(
  req: NextRequest,
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

  let body: { confirm?: string } = {};
  try {
    body = (await req.json()) as { confirm?: string };
  } catch {
    // no/invalid body — falls through to the confirmation check below
  }
  if (body.confirm !== tenantId) {
    return NextResponse.json(
      {
        ok: false,
        error: "confirmation_required",
        hint: "POST { confirm: <tenantId> } to proceed",
      },
      { status: 400 },
    );
  }

  const result = await deleteTenantData(tenantId);

  await recordAudit({
    tenantId,
    actorUserId: userId,
    action: "tenant.delete",
    entity: `tenant:${tenantId}`,
    meta: { ...result } as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, result });
}
