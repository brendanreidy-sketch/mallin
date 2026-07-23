/**
 * GET /api/internal-brief/download?jobId=<uuid>
 *
 * Streams the rendered .pptx for a succeeded, tenant-owned brief job as a
 * private attachment. The internal brief is the UNSANITIZED judgment layer, so
 * this is authenticated + tenant-scoped and never cached. Any non-succeeded job
 * returns a structured error rather than a file.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { getBriefJob } from "@/lib/deck/brief-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS: Record<string, string> = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };

function err(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status, headers: PRIVATE_HEADERS });
}

/** attachment header with an ASCII fallback + RFC 5987 encoded filename. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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
  if (job.status !== "succeeded" || !job.pptx_base64) {
    return err(job.status === "failed" ? (job.error_code ?? "brief_failed") : "not_ready", job.status === "failed" ? 422 : 409);
  }

  const buffer = Buffer.from(job.pptx_base64, "base64");
  const filename = job.filename ?? "internal-brief.pptx";
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: { ...PRIVATE_HEADERS, "Content-Type": PPTX_MIME, "Content-Disposition": contentDisposition(filename) },
  });
}
