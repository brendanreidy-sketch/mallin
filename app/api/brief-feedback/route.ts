import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";

/**
 * POST /api/brief-feedback — one-tap 👍/👎 (+ optional reason) on a brief.
 * The only direct signal on whether the output earns trust. Self-auths; must
 * stay in middleware isPublicRoute (Clerk protect() would 404 + edge-cache it).
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
    opportunityId?: string;
    rating?: string;
    reason?: string;
  };
  const opportunityId = (body.opportunityId ?? "").trim();
  const rating = (body.rating ?? "").trim();
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunity_required" }, { status: 400 });
  }
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json({ error: "bad_rating" }, { status: 400 });
  }

  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("id", opportunityId)
    .eq("tenant_id", tenantId)
    .single();
  if (!opp) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from("brief_feedback").insert({
    tenant_id: tenantId,
    opportunity_id: opportunityId,
    rating,
    reason: body.reason?.trim() || null,
    created_by: userId,
  });
  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message.slice(0, 200) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
