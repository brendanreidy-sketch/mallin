/**
 * ============================================================================
 *  /api/generate-deck
 * ============================================================================
 *
 *  Customer-facing deck for a deal, built from the SANITIZED Account
 *  Intelligence artifact (lib/deck/deck-model.ts — same sanitization as
 *  /share). Generalized, DB-driven replacement for the old hand-authored
 *  per-deal deck build script.
 *
 *  POST  (rep-authenticated, tenant-gated)
 *    Body: { dealId }
 *    Ensures the opportunity has a share_token (mints one if absent — the
 *    same token that gates /share and /deck), verifies a current artifact
 *    exists, and returns the public deck URL. Does NOT itself render a file.
 *    Response: { ok, deckUrl, pptxUrl, shareToken }
 *
 *  GET  (public, token-gated — same gate as /deck/[token])
 *    Query: ?token=<share_token>&format=pptx
 *    Streams the .pptx. Public because the deck content is already the
 *    customer-safe view; the token is the capability.
 *
 *  Boundary: this never exposes a rep-internal field — it can only render
 *  what buildDeckModel() carries, which is sanitized by construction.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/db/client";
import { getCurrentTenantId, getTenantBrand } from "@/lib/auth/tenant-context";
import { checkOpportunityAccess } from "@/lib/auth/opportunity-access";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import { buildDeckModel } from "@/lib/deck/deck-model";
import { loadSellerPerson } from "@/lib/deck/ae-profile";
import { buildPptx } from "@/lib/deck/build-pptx";
import { resolveBrandingAuto } from "@/lib/deck/brands";
import { ensureDeckCopy } from "@/lib/deck/ensure-deck-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Lazy deck-copy generation runs an LLM call on first request; allow time.
export const maxDuration = 120;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function cleanId(raw: unknown): string {
  return (typeof raw === "string" ? raw : "").replace(/[^a-fA-F0-9-]/g, "");
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "deck";
}

// ── POST: rep mints/returns the deck link for a deal ────────────────────────
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("invalid JSON body");
  }

  const dealId = cleanId(body.dealId);
  if (!dealId) return bad("dealId is required");

  const userTenantId = await getCurrentTenantId().catch(() => null);
  const access = await checkOpportunityAccess(dealId, userTenantId);
  if (!access.ok) {
    const status = access.reason === "wrong_tenant" ? 403 : 404;
    return bad(`opportunity not accessible (${access.reason})`, status);
  }

  // A deck is only meaningful if there's a current artifact to render.
  const { data: intelRow } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("opportunity_id")
    .eq("opportunity_id", dealId)
    .eq("is_current", true)
    .maybeSingle();
  if (!intelRow) {
    return bad("no current account-intelligence artifact for this deal yet", 409);
  }

  // Lazily generate the deck narrative (meeting.sections) from the stored
  // transcript and cache it into the artifact — the rep's click is the signal.
  // No-op if already cached or no transcript; never fatal (deck still renders).
  // refresh — force-regenerate the deck copy (e.g. to pick up the new
  // "What's included" section) even if cached and no newer transcript landed.
  const forceRefresh =
    body.refresh === true || body.refresh === 1 || body.refresh === "1";
  const deckCopy = await ensureDeckCopy(dealId, { force: forceRefresh });

  // Reuse the existing share_token (so /share and /deck stay one link);
  // mint one only if absent.
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("id, share_token")
    .eq("id", dealId)
    .maybeSingle();
  if (oppErr || !opp) return bad("opportunity not found", 404);

  let token = opp.share_token as string | null;
  if (!token) {
    token = randomUUID();
    const { error: updErr } = await supabaseAdmin
      .from("opportunities")
      .update({ share_token: token })
      .eq("id", dealId);
    if (updErr) return bad("failed to create share token", 500);
  }

  return NextResponse.json({
    ok: true,
    deckUrl: `/deck/${token}`,
    pptxUrl: `/api/generate-deck?token=${token}&format=pptx`,
    shareToken: token,
    // Surface how the narrative resolved so the UI can hint ("no transcript →
    // basic deck") without failing.
    narrative: deckCopy.generated ? "generated" : deckCopy.reason,
  });
}

// ── GET: public, token-gated .pptx download ─────────────────────────────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").replace(/[^a-fA-F0-9-]/g, "");
  const format = url.searchParams.get("format") ?? "pptx";
  if (format !== "pptx") return bad("unsupported format (only pptx)", 400);
  if (!token || token.length < 32) return bad("invalid token", 404);

  const { data: opp, error } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, tenant_id, accounts(name)")
    .eq("share_token", token)
    .maybeSingle();
  if (error || !opp) return bad("not found", 404);

  const { data: intelRow, error: intelErr } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("artifact")
    .eq("opportunity_id", opp.id)
    .eq("is_current", true)
    .maybeSingle();
  if (intelErr || !intelRow) return bad("no artifact", 404);

  const artifact = intelRow.artifact as AccountIntelligenceArtifact;
  const accountName =
    (opp.accounts as unknown as { name?: string } | null)?.name ??
    artifact.account?.name ??
    "Untitled Account";

  // Seller brand resolves from the opportunity's OWN tenant (works with no
  // session — this GET is public/token-gated); buyer logo from account domain.
  const sellerBrand = opp.tenant_id ? await getTenantBrand(opp.tenant_id as string) : null;
  // Autonomous: any seller brand gap is resolved from the company name
  // (display_name doubles as the stated company), buyer mark from its domain.
  const branding = await resolveBrandingAuto({
    sellerBrand,
    sellerCompany: sellerBrand?.displayName ?? null,
    buyerName: accountName,
    buyerDomain: artifact.account?.domain,
  });

  const sellerPerson = await loadSellerPerson(opp.tenant_id as string | null);
  const model = buildDeckModel(artifact, accountName, branding, sellerPerson);
  const buffer = await buildPptx(model);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${safeFilename(accountName)}-pre-call-brief.pptx"`,
      "Cache-Control": "no-store",
    },
  });
}
