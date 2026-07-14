/**
 * GET /api/cron/retention-purge
 *
 * Daily job that enforces per-tenant raw-transcript retention windows
 * (tenants.retention_days). Tenants with no window (NULL) are untouched —
 * life-of-account is the default. The run is recorded in the audit log.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}`; reject otherwise.
 * (/api/cron/* is already public to Clerk in middleware; the secret is the gate.)
 */
import { NextResponse, type NextRequest } from "next/server";
import { purgeExpiredTranscripts } from "@/lib/compliance/retention";
import { recordAudit } from "@/lib/audit/record";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await purgeExpiredTranscripts();

  await recordAudit({
    action: "retention.purge",
    entity: "cron",
    meta: { ...result } as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, result });
}
