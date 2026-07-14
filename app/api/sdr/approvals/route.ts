import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { loadSdrConfig } from "@/lib/sdr/config-store";
import { performEffect } from "@/lib/sdr/effects";
import { getPendingAction, listPendingApprovals, resolveAction } from "@/lib/sdr/store";

/**
 * The approval inbox API — closes the governed loop.
 *   GET  /api/sdr/approvals            — actions queued for a human.
 *   POST /api/sdr/approvals {actionId, decision} — approve (executes the held
 *        effect for real) or deny.
 *
 * Self-auths; in middleware isPublicRoute. Tenant-scoped.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenant(): Promise<{ tenantId: string; userId: string } | null> {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    return { tenantId: await getCurrentTenantId(), userId };
  } catch {
    return null;
  }
}

export async function GET() {
  const ctx = await tenant();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pending = await listPendingApprovals(ctx.tenantId);
  return NextResponse.json({ pending });
}

export async function POST(req: NextRequest) {
  const ctx = await tenant();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { actionId?: string; decision?: "approve" | "deny" }
    | null;
  const actionId = body?.actionId;
  const decision = body?.decision;
  if (!actionId || (decision !== "approve" && decision !== "deny")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const action = await getPendingAction(actionId, ctx.tenantId);
  if (!action) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (decision === "deny") {
    await resolveAction(actionId, ctx.tenantId, "denied", ctx.userId, `Denied by ${ctx.userId}`);
    return NextResponse.json({ ok: true, status: "denied" });
  }

  // Approve → perform the held effect for real, then record it.
  const config = await loadSdrConfig(ctx.tenantId);
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 400 });
  const result = await performEffect(action.tool, action.input, config, {
    tenantId: ctx.tenantId,
  });
  await resolveAction(actionId, ctx.tenantId, "approved", ctx.userId, result);
  return NextResponse.json({ ok: true, status: "approved", result });
}
