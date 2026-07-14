/**
 * /api/settings/ae-profile — the AE's own deck intro profile.
 *
 * Authenticated rep only (Clerk session → tenant). Three actions:
 *   - propose: run LinkedIn enrichment from the rep's name + company and return
 *              a DRAFT (title / bio / URL). Does NOT persist or confirm.
 *   - save:    persist the (AE-edited) title / bio / URL and mark the profile
 *              CONFIRMED — this is the gate that lets it onto customer decks.
 *   - clear:   un-confirm, so the intro slide stops rendering.
 *
 * Governance: only `save` flips ae_profile_confirmed. AI proposes; the human
 * confirms before anything reaches a deck the customer sees.
 */
import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/db/client";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { proposeAeProfile } from "@/lib/deck/ae-profile-research";
import { recordAudit } from "@/lib/audit/record";

export const dynamic = "force-dynamic";

const clip = (v: unknown, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const tenantId = await getCurrentTenantId().catch(() => null);
  if (!tenantId) return NextResponse.json({ ok: false, error: "no tenant" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const action = body.action;

  // ── propose: enrich from the rep's own name + company (no write) ──
  if (action === "propose") {
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("first_name, last_name, seller_company")
      .eq("id", tenantId)
      .maybeSingle();
    const name = [t?.first_name, t?.last_name].filter(Boolean).join(" ").trim();
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "no name on file — add your name first" },
        { status: 422 },
      );
    }
    const proposal = await proposeAeProfile(name, t?.seller_company ?? null);
    if (!proposal) {
      return NextResponse.json(
        { ok: false, error: "couldn't reach the research service — enter your details manually" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, proposal, name });
  }

  // ── save: persist the AE-confirmed profile ──
  if (action === "save") {
    const patch = {
      ae_title: clip(body.title, 80),
      ae_linkedin_url: clip(body.linkedin_url, 300),
      ae_bio: clip(body.bio, 240),
      ae_profile_confirmed: true,
    };
    const url = patch.ae_linkedin_url;
    if (url && !/^https?:\/\//.test(url)) {
      return NextResponse.json({ ok: false, error: "LinkedIn URL must start with http(s)://" }, { status: 422 });
    }
    const { error } = await supabaseAdmin.from("tenants").update(patch).eq("id", tenantId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await recordAudit({
      tenantId,
      actorUserId: userId,
      action: "settings.ae_profile.confirm",
      entity: `tenant:${tenantId}`,
      meta: { has_title: !!patch.ae_title, has_bio: !!patch.ae_bio, has_linkedin: !!patch.ae_linkedin_url },
    });
    return NextResponse.json({ ok: true, confirmed: true });
  }

  // ── clear: stop showing the intro slide ──
  if (action === "clear") {
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ ae_profile_confirmed: false })
      .eq("id", tenantId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await recordAudit({
      tenantId,
      actorUserId: userId,
      action: "settings.ae_profile.clear",
      entity: `tenant:${tenantId}`,
    });
    return NextResponse.json({ ok: true, confirmed: false });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
