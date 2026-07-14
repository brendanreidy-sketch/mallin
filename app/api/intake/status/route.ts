import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";

/**
 * GET /api/intake/status?dealId=<uuid>
 *
 * "Is the brief ready?" — the building screen polls this. Ready === a current
 * execution_artifact exists for the opportunity. Tenant-scoped: a user can
 * only ask about their own workspace's opportunities.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) {
    return NextResponse.json({ error: "missing_dealId" }, { status: 400 });
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("id", dealId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!opp) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: art } = await supabaseAdmin
    .from("execution_artifacts")
    .select("id")
    .eq("opportunity_id", dealId)
    .eq("is_current", true)
    .maybeSingle();

  return NextResponse.json({ ready: Boolean(art) });
}
