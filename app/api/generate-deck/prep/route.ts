/**
 * ============================================================================
 *  /api/generate-deck/prep  —  REP-ONLY prep deck (private companion)
 * ============================================================================
 *
 *  GET ?dealId=<uuid>   (rep-authenticated, tenant-gated)
 *    Streams the UNSANITIZED prep deck — the rep's objective, the landmines,
 *    the full opening angle, and the WHY behind each qualifying question.
 *    This is the judgment the customer deck strips out, so it must NEVER be
 *    reachable via the public share token: this route gates on the caller's
 *    Clerk session + tenant ownership of the deal (checkOpportunityAccess),
 *    NOT on a token. No token is minted or accepted here.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { getCurrentTenantId, getTenantBrand } from "@/lib/auth/tenant-context";
import { checkOpportunityAccess } from "@/lib/auth/opportunity-access";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import { buildRepDeckModel } from "@/lib/deck/deck-model";
import { loadSellerPerson } from "@/lib/deck/ae-profile";
import { buildPptx } from "@/lib/deck/build-pptx";
import { resolveBrandingAuto } from "@/lib/deck/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cleanId(raw: string | null): string {
  return (typeof raw === "string" ? raw : "").replace(/[^a-fA-F0-9-]/g, "");
}
function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "deck";
}

export async function GET(req: NextRequest) {
  const dealId = cleanId(new URL(req.url).searchParams.get("dealId"));
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "dealId required" }, { status: 400 });
  }

  // Auth-gate: must be a signed-in rep whose tenant owns this deal.
  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const access = await checkOpportunityAccess(dealId, tenantId);
  if (!access.ok) {
    const status = access.reason === "wrong_tenant" ? 403 : 404;
    return NextResponse.json({ ok: false, error: `not accessible (${access.reason})` }, { status });
  }

  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("id, tenant_id, accounts(name)")
    .eq("id", dealId)
    .maybeSingle();
  if (!opp) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const { data: intelRow } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("artifact")
    .eq("opportunity_id", dealId)
    .eq("is_current", true)
    .maybeSingle();
  if (!intelRow) return NextResponse.json({ ok: false, error: "no artifact" }, { status: 404 });

  const artifact = intelRow.artifact as AccountIntelligenceArtifact;
  const accountName =
    (opp.accounts as unknown as { name?: string } | null)?.name ??
    artifact.account?.name ??
    "Account";

  const sellerBrand = opp.tenant_id ? await getTenantBrand(opp.tenant_id as string) : null;
  const branding = await resolveBrandingAuto({
    sellerBrand,
    sellerCompany: sellerBrand?.displayName ?? null,
    buyerName: accountName,
    buyerDomain: artifact.account?.domain,
  });

  const sellerPerson = await loadSellerPerson(opp.tenant_id as string | null);
  const model = buildRepDeckModel(artifact, accountName, branding, sellerPerson);
  const buffer = await buildPptx(model);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${safeFilename(accountName)}-prep-notes.pptx"`,
      "Cache-Control": "no-store",
    },
  });
}
