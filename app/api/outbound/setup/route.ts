import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { deriveAndSaveOutboundConfig } from "@/lib/sdr/outbound/config-store";

/**
 * POST /api/outbound/setup — the onboarding create-path.
 *
 * The customer says what they sell + names ONE seed company they'd want more
 * of; the lookalike agent derives their ICP and we persist it as their outbound
 * config. Returns the full derivation (seed profile + rationale + config) so the
 * setup UI can show what was inferred and let them confirm before the first run.
 *
 * Web-searches the seed — long-running — so raise maxDuration like intake does.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Resolve the tenant's own company name for the config's `company_name`. */
async function resolveCompanyName(tenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("display_name, seller_company")
    .eq("id", tenantId)
    .maybeSingle();
  return (
    (data?.display_name as string | null) ??
    (data?.seller_company as string | null) ??
    "your company"
  );
}

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
    seedCompany?: string;
    seedWebsite?: string;
    offering?: string;
  };
  const seedCompany = (body.seedCompany ?? "").trim();
  const seedWebsite = (body.seedWebsite ?? "").trim() || undefined;
  const offering = (body.offering ?? "").trim();

  if (!seedCompany) {
    return NextResponse.json(
      { error: "seed_required", message: "Name one company you'd want more of." },
      { status: 400 },
    );
  }
  if (offering.length < 10) {
    return NextResponse.json(
      { error: "offering_required", message: "Tell us what you sell (a sentence or two)." },
      { status: 400 },
    );
  }

  const companyName = await resolveCompanyName(tenantId);

  try {
    const result = await deriveAndSaveOutboundConfig(tenantId, {
      seedCompany,
      seedWebsite,
      offering,
      companyName,
    });
    return NextResponse.json({
      config: result.config,
      seedProfile: result.seedProfile,
      rationale: result.rationale,
    });
  } catch (err) {
    console.error(`[outbound/setup] derivation failed for tenant ${tenantId}:`, err);
    return NextResponse.json(
      {
        error: "derivation_failed",
        message: "We couldn't derive your ICP from that seed. Please try again.",
        detail: ((err as Error)?.message ?? String(err)).slice(0, 300),
      },
      { status: 500 },
    );
  }
}
