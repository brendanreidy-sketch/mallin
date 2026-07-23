/**
 * ============================================================================
 *  POST /api/internal-brief  —  authenticated internal executive deal brief
 * ============================================================================
 *
 *  Body: { "dealId": "<uuid>" }
 *
 *  Rep-authenticated + tenant-gated. Generation invokes an external model and
 *  produces a NEW, private, downloadable .pptx — so it is POST only (never a
 *  cacheable/prefetchable GET). This deck is the UNSANITIZED internal judgment
 *  layer: it must NEVER be reachable via a share token or the public
 *  /deck/[token] surface, and the binary is never persisted or uploaded.
 *
 *  The route is THIN: authenticate → validate → authorize → orchestrate →
 *  return the private attachment or a safe structured error. All record
 *  loading, snapshotting, adaptation, model orchestration, and rendering live
 *  in the internal services (load-internal-brief-sources, generate-internal-brief).
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createHash, randomUUID } from "node:crypto";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { checkOpportunityAccess } from "@/lib/auth/opportunity-access";
import { loadInternalBriefSources } from "@/lib/deck/load-internal-brief-sources";
import { createSonnetBriefClient, generateInternalBrief, DEFAULT_BRIEF_MODEL } from "@/lib/deck/generate-internal-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every response — success and error — is private and uncacheable.
const PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Narrow per-instance de-dupe: prevents a tenant+user+deal from starting a
 * second internal-brief generation while one is already in flight in THIS
 * server instance. It is intentionally minimal — NOT a distributed lock or a
 * job queue. On a multi-instance / serverless deployment it does not dedupe
 * across instances; a durable guard would be a separate, larger change.
 */
const inFlight = new Set<string>();

function errorResponse(code: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status, headers: PRIVATE_HEADERS });
}

/** Log only non-sensitive fields — never prompts, evidence, transcript, or
 *  generated slide text. */
function logInternal(fields: { correlationId: string; code: string; dealId: string; modelId: string }): void {
  console.info(
    JSON.stringify({
      at: "internal-brief",
      correlationId: fields.correlationId,
      code: fields.code,
      dealIdHash: createHash("sha256").update(fields.dealId).digest("hex").slice(0, 12),
      modelId: fields.modelId,
    }),
  );
}

/** attachment header with an ASCII fallback + RFC 5987 encoded filename. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = randomUUID();

  // 2. Strict request parsing.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", 400);
  }
  const dealId = typeof (body as { dealId?: unknown })?.dealId === "string" ? (body as { dealId: string }).dealId : "";

  // 3. Strict UUID validation — reject BEFORE any database access. No stripping.
  if (!UUID_RE.test(dealId)) return errorResponse("invalid_deal_id", 400);

  // 1. Authentication + tenant resolution.
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthenticated", 401);
  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!tenantId) return errorResponse("unauthenticated", 401);

  // 4. Authorization (tenant ownership of the deal).
  const access = await checkOpportunityAccess(dealId, tenantId);
  if (!access.ok) {
    return access.reason === "wrong_tenant" ? errorResponse("forbidden", 403) : errorResponse("deal_not_found", 404);
  }

  // Cost/concurrency guard (narrow, per-instance — see inFlight note).
  const guardKey = `${tenantId}:${userId}:${dealId}`;
  if (inFlight.has(guardKey)) return errorResponse("generation_in_progress", 429);
  inFlight.add(guardKey);

  try {
    // 5. Tenant-scoped source loading (only after authorization).
    const loaded = await loadInternalBriefSources(dealId, tenantId);
    if (!loaded.ok) {
      if (loaded.code === "deal_not_found") return errorResponse("deal_not_found", 404);
      if (loaded.code === "current_artifact_conflict") return errorResponse("current_artifact_conflict", 409);
      return errorResponse("required_artifact_missing", 409);
    }

    // 6. Orchestrate generation.
    const cover = {
      dealName: loaded.sources.opportunity.name,
      companyName: loaded.sources.companyName ?? undefined,
      asOf: new Date().toISOString().slice(0, 10), // generated date
    };
    const result = await generateInternalBrief({ sources: loaded.sources, cover, modelClient: createSonnetBriefClient() });

    if (!result.ok) {
      const status = result.code === "brief_failed_validation" ? 422 : result.code === "model_generation_failed" ? 502 : 500;
      logInternal({ correlationId, code: result.code, dealId, modelId: DEFAULT_BRIEF_MODEL });
      return errorResponse(result.code, status);
    }

    logInternal({ correlationId, code: "ok", dealId, modelId: result.modelId });
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: { ...PRIVATE_HEADERS, "Content-Type": PPTX_MIME, "Content-Disposition": contentDisposition(result.filename) },
    });
  } catch {
    logInternal({ correlationId, code: "brief_render_failed", dealId, modelId: DEFAULT_BRIEF_MODEL });
    return errorResponse("brief_render_failed", 500);
  } finally {
    inFlight.delete(guardKey);
  }
}
