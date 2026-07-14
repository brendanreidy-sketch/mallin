import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { dismiss } from "@/lib/action-queue/queue";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";

/**
 * POST /api/queue/dismiss
 *
 * Marks one or more queue items dismissed. Body:
 *   { ids: string[] }
 *
 * Dismissal is permanent (logged with approving user + timestamp).
 * Use defer if the rep wants to come back to it later.
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

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: "no_tenant", detail: err instanceof Error ? err.message : "unknown" },
      { status: 400 },
    );
  }

  const results = await Promise.all(
    ids.map(async (id) => {
      const row = await dismiss(id, userId, tenantId);
      return { id, ok: !!row, status: row?.status };
    }),
  );
  return NextResponse.json({ ok: true, results });
}
