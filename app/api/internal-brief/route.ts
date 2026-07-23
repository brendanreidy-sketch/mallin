/**
 * ============================================================================
 *  POST /api/internal-brief  —  enqueue an internal executive-brief job
 * ============================================================================
 *
 *  Body: { "dealId": "<uuid>" }
 *
 *  Generation is a multi-minute model pipeline that cannot be held in a
 *  synchronous request, so this route is now an ENQUEUE endpoint: it
 *  authenticates → validates → authorizes → fast-fails on missing required
 *  artifacts → inserts a brief_jobs row and returns { jobId } immediately. A
 *  Vercel cron worker (app/api/cron/process-brief-jobs) runs the pipeline
 *  out-of-band; the client polls GET /status and downloads via GET /download.
 *
 *  The generated deck is the UNSANITIZED internal judgment layer: it must NEVER
 *  be reachable via a share token or the public /deck/[token] surface. It is
 *  stored (base64) only on the tenant-scoped brief_jobs row and streamed back
 *  privately, never cached.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHash, randomUUID } from "node:crypto";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { checkOpportunityAccess } from "@/lib/auth/opportunity-access";
import { loadInternalBriefSources } from "@/lib/deck/load-internal-brief-sources";
import { enqueueBriefJob } from "@/lib/deck/brief-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // enqueue is fast — the model pipeline runs in the cron worker

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status, headers: PRIVATE_HEADERS });
}

/** Log only non-sensitive fields — never prompts, evidence, or slide text. */
function logInternal(fields: { correlationId: string; code: string; dealId: string }): void {
  console.info(
    JSON.stringify({
      at: "internal-brief",
      correlationId: fields.correlationId,
      code: fields.code,
      dealIdHash: createHash("sha256").update(fields.dealId).digest("hex").slice(0, 12),
    }),
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = randomUUID();

  // Strict request parsing.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", 400);
  }
  const dealId = typeof (body as { dealId?: unknown })?.dealId === "string" ? (body as { dealId: string }).dealId : "";

  // Strict UUID validation — reject BEFORE any database access.
  if (!UUID_RE.test(dealId)) return errorResponse("invalid_deal_id", 400);

  // Authentication + tenant resolution.
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthenticated", 401);
  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!tenantId) return errorResponse("unauthenticated", 401);

  // Authorization (tenant ownership of the deal).
  const access = await checkOpportunityAccess(dealId, tenantId);
  if (!access.ok) {
    return access.reason === "wrong_tenant" ? errorResponse("forbidden", 403) : errorResponse("deal_not_found", 404);
  }

  // Fast-fail preflight: reject before enqueuing a doomed job when the required
  // source artifacts are missing (cheap DB read; the worker re-loads them).
  const loaded = await loadInternalBriefSources(dealId, tenantId);
  if (!loaded.ok) {
    if (loaded.code === "deal_not_found") return errorResponse("deal_not_found", 404);
    if (loaded.code === "current_artifact_conflict") return errorResponse("current_artifact_conflict", 409);
    return errorResponse("required_artifact_missing", 409);
  }

  // Enqueue (or return the in-flight job). The partial UNIQUE index dedupes.
  let job: { jobId: string; status: string; reused: boolean };
  try {
    job = await enqueueBriefJob({ tenantId, dealId, userId });
  } catch {
    logInternal({ correlationId, code: "enqueue_failed", dealId });
    return errorResponse("enqueue_failed", 500);
  }

  logInternal({ correlationId, code: job.reused ? "job_reused" : "job_queued", dealId });
  return NextResponse.json(
    { ok: true, jobId: job.jobId, status: job.status },
    { status: 202, headers: PRIVATE_HEADERS },
  );
}
