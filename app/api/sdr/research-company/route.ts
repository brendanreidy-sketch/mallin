import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { hasSdrAccess } from "@/lib/sdr/entitlement";
import { researchCompany } from "@/lib/sdr/company-research-agent";

/**
 * POST /api/sdr/research-company — auto-build a draft SDR profile by researching
 * the company (offering + products + personas + knowledge). Returns a DRAFT for
 * the customer to review and save; does not persist. In middleware isPublicRoute.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }
  if (!(await hasSdrAccess(tenantId))) {
    return NextResponse.json({ error: "not_enabled" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { company_name?: string; website?: string }
    | null;
  const company_name = (body?.company_name ?? "").trim();
  if (!company_name) {
    return NextResponse.json({ error: "company_name_required" }, { status: 400 });
  }

  try {
    const { draft, search_count } = await researchCompany({
      company_name,
      website: body?.website?.trim() || undefined,
    });
    return NextResponse.json({ draft, search_count });
  } catch (e) {
    return NextResponse.json(
      { error: "research_failed", detail: (e as Error).message.slice(0, 200) },
      { status: 500 },
    );
  }
}
