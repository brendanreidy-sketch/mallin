import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getById,
  markApproved,
  recordExecution,
} from "@/lib/action-queue/queue";
import { execute } from "@/lib/action-queue/executors";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { recordAudit } from "@/lib/audit/record";

/**
 * POST /api/queue/approve
 *
 * Approves one or more queue items and executes them. Body:
 *   { ids: string[] }
 *
 * Executes sequentially so a partial failure doesn't poison the
 * remaining items. Returns a per-id result map. Partial failures
 * surface as { ok: false, results: [...] } at the HTTP layer.
 *
 * Each execution writes the executor + external_object_* provenance
 * fields back to the row — that's the governed action ledger.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_ids_provided" },
      { status: 400 },
    );
  }

  // Resolve the caller's tenant. Every queue read/write below is scoped to
  // it, so a user can only approve actions their own tenant owns.
  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: "no_tenant", detail: err instanceof Error ? err.message : "unknown" },
      { status: 400 },
    );
  }

  const results: Array<{
    id: string;
    ok: boolean;
    status?: string;
    error?: string;
    external_object_id?: string | null;
    external_object_url?: string | null;
  }> = [];
  let allOk = true;

  for (const id of ids) {
    // Validate the row exists + is approvable.
    const row = await getById(id, tenantId);
    if (!row) {
      results.push({ id, ok: false, error: "not_found" });
      allOk = false;
      continue;
    }
    // Drafts-only hard stop: never approve/execute/retry a legacy email_send row
    // (Mallín never sends). Explicit reject at this server boundary, regardless
    // of the row's status, in addition to the executor-level refusal.
    if (row.action_type === "email_send") {
      results.push({ id, ok: false, error: "email_send_retired" });
      allOk = false;
      continue;
    }
    if (row.status !== "queued" && row.status !== "deferred") {
      results.push({
        id,
        ok: false,
        error: `not_approvable_in_status_${row.status}`,
      });
      allOk = false;
      continue;
    }

    // Mark approved (locks the row to this user's intent).
    const approved = await markApproved(id, userId, tenantId);
    if (!approved) {
      results.push({ id, ok: false, error: "mark_approved_failed" });
      allOk = false;
      continue;
    }

    // Run the executor.
    const execResult = await execute(approved);
    const finalRow = await recordExecution(id, execResult);

    results.push({
      id,
      ok: execResult.ok,
      status: finalRow?.status ?? (execResult.ok ? "executed" : "failed"),
      error: execResult.error,
      external_object_id: finalRow?.external_object_id ?? null,
      external_object_url: finalRow?.external_object_url ?? null,
    });

    // Governed-write audit trail: one row per executed action.
    await recordAudit({
      tenantId,
      actorUserId: userId,
      action: "queue.execute",
      entity: `queue_item:${id}`,
      meta: {
        ok: execResult.ok,
        status: finalRow?.status ?? null,
        external_object_id: finalRow?.external_object_id ?? null,
        error: execResult.error ?? null,
      },
    });

    if (!execResult.ok) allOk = false;
  }

  return NextResponse.json({ ok: allOk, results });
}
