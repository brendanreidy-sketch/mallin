import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { getAutonomy } from "@/lib/sdr/outbound/config-store";
import { resolveDisposition } from "@/lib/sdr/outbound/autonomy";

/**
 * POST /api/outbound/approve — act on one prospect in the review queue.
 *
 *   action "skip"    → status 'skipped'.
 *   action "approve" → resolve the tenant's autonomy disposition:
 *       "send"              → status 'queued_send' AND stub the send (below).
 *       "queue_for_approval"→ status 'approved'.
 *       "hold_drafted"      → status 'held' (draft_only, or paused kill-switch).
 *
 * Sending is STUBBED — there is no warmed sending domain yet. Even the "send"
 * disposition only marks the row queued_send; nothing hits an email API here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prospectId?: string;
    action?: string;
  };
  const prospectId = (body.prospectId ?? "").trim();
  const action = (body.action ?? "").trim();

  if (!prospectId) {
    return NextResponse.json({ error: "prospect_required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "skip") {
    return NextResponse.json(
      { error: "bad_action", message: "action must be 'approve' or 'skip'." },
      { status: 400 },
    );
  }

  let nextStatus: "skipped" | "queued_send" | "approved" | "held";
  if (action === "skip") {
    nextStatus = "skipped";
  } else {
    const disposition = resolveDisposition(await getAutonomy(tenantId));
    switch (disposition) {
      case "send":
        nextStatus = "queued_send";
        // TODO: real send once a warmed domain is wired. Intentionally NOT
        // calling any email API — the row is only marked queued_send.
        break;
      case "queue_for_approval":
        nextStatus = "approved";
        break;
      case "hold_drafted":
      default:
        nextStatus = "held";
        break;
    }
  }

  // Scope the update to this tenant so a prospect id can't be flipped
  // cross-tenant.
  const { data, error } = await supabaseAdmin
    .from("outbound_prospects")
    .update({ status: nextStatus })
    .eq("id", prospectId)
    .eq("tenant_id", tenantId)
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error(`[outbound/approve] update failed for ${prospectId}:`, error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
