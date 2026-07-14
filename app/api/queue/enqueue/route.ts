import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { enqueue } from "@/lib/action-queue/queue";
import type { ActionPayload, SourceSurface } from "@/lib/action-queue/types";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

/**
 * POST /api/queue/enqueue
 *
 * Adds a new item to the rep's action queue. Body:
 *   {
 *     opportunity_id?: string,   // substrate UUID or external CRM id
 *     payload: ActionPayload,    // typed discriminated union — see lib/action-queue/types.ts
 *     rationale?: string,        // 1-line "why" for the rep
 *     source_surface?: SourceSurface,
 *     source_item_id?: string,   // e.g. CrmSuggestion.id, risk.id
 *   }
 *
 * Returns the inserted row.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.payload || typeof body.payload !== "object" || typeof (body.payload as { type?: unknown }).type !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_or_invalid_payload" },
      { status: 400 },
    );
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: "no_tenant", detail: err instanceof Error ? err.message : "unknown" },
      { status: 400 },
    );
  }

  try {
    const row = await enqueue({
      tenant_id: tenantId,
      user_id: userId,
      opportunity_id: typeof body.opportunity_id === "string" ? body.opportunity_id : undefined,
      payload: body.payload as ActionPayload,
      rationale: typeof body.rationale === "string" ? body.rationale : undefined,
      source_surface: typeof body.source_surface === "string"
        ? (body.source_surface as SourceSurface)
        : undefined,
      source_item_id: typeof body.source_item_id === "string" ? body.source_item_id : undefined,
    });
    return NextResponse.json({ ok: true, item: row });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "enqueue_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
