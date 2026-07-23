/**
 * GET /api/internal-brief/status?jobId=<uuid>
 *
 * Tenant-scoped poll target for the async brief job. Returns the lifecycle
 * status only — no prompt/evidence/slide text. On 'succeeded' the client can
 * download via GET /api/internal-brief/download?jobId=…; on 'failed' the public
 * errorCode explains why.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { getBriefJob } from "@/lib/deck/brief-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS: Record<string, string> = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };

function err(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status, headers: PRIVATE_HEADERS });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
  if (!UUID_RE.test(jobId)) return err("invalid_job_id", 400);

  const { userId } = await auth();
  if (!userId) return err("unauthenticated", 401);
  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!tenantId) return err("unauthenticated", 401);

  const job = await getBriefJob(jobId, tenantId);
  if (!job) return err("job_not_found", 404);

  return NextResponse.json(
    {
      ok: true,
      status: job.status,
      ready: job.status === "succeeded",
      filename: job.status === "succeeded" ? job.filename : undefined,
      errorCode: job.status === "failed" ? job.error_code : undefined,
    },
    { status: 200, headers: PRIVATE_HEADERS },
  );
}
