import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { defer } from "@/lib/action-queue/queue";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

/**
 * POST /api/queue/defer
 *
 * Pushes a queue item to a future timestamp. Body:
 *   { id: string, defer_until: string (ISO 8601) }
 *
 * Deferred items don't fall out of the cockpit panel — they reappear
 * when deferred_until <= NOW(). For now: rep sees them in a separate
 * row group; future: optional snooze-to-tomorrow / next-Monday shortcuts.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: { id?: unknown; defer_until?: unknown };
  try {
    body = (await req.json()) as { id?: unknown; defer_until?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.id !== "string" || typeof body.defer_until !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_id_or_defer_until" },
      { status: 400 },
    );
  }

  // Validate it's a real ISO timestamp.
  const ts = new Date(body.defer_until);
  if (Number.isNaN(ts.getTime())) {
    return NextResponse.json(
      { ok: false, error: "invalid_defer_until" },
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

  const row = await defer(body.id, ts.toISOString(), userId, tenantId);
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "defer_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, item: row });
}
