/**
 * ============================================================================
 *  sf_opportunity_links — CRUD layer
 * ============================================================================
 *
 *  Persists the substrate ↔ Salesforce link confirmation. Soft-delete
 *  pattern: unlinking sets unlinked_at instead of deleting the row, so
 *  the audit history is preserved.
 *
 *  Invariants enforced here (defense in depth — DB also enforces via
 *  the partial unique index):
 *    - Only one ACTIVE link per substrate dealId at any time.
 *    - confirmLink() is idempotent: same (dealId, sfOppId) returns the
 *      existing active link rather than erroring.
 *    - confirmLink() with a DIFFERENT sfOppId for an already-linked
 *      deal requires explicit `replace: true` (callers must signal
 *      they intend to switch).
 * ============================================================================
 */

import { supabaseAdmin } from "@/lib/db/client";

export interface SfOpportunityLink {
  id: string;
  opportunity_id: string;
  sf_opp_id: string;
  sf_instance_url: string;
  confirmed_at: string;
  confirmed_by: string | null;
  unlinked_at: string | null;
  notes: string | null;
}

export interface ConfirmLinkInput {
  dealId: string;
  sfOppId: string;
  sfInstanceUrl: string;
  /** Email or user id of the rep, if available. Null until /sf/diff is auth-gated. */
  confirmedBy?: string | null;
  notes?: string | null;
  /** When true, soft-unlinks any existing active link for this dealId
   *  before creating the new one. Required when the rep is changing
   *  their previously-confirmed answer to a different SF opp. */
  replace?: boolean;
}

export type ConfirmLinkResult =
  | { ok: true; link: SfOpportunityLink; created: boolean; replaced: boolean }
  | { ok: false; error: "deal_not_found"; message: string }
  | {
      ok: false;
      error: "different_link_active";
      message: string;
      existing_link: SfOpportunityLink;
    }
  | { ok: false; error: "db_error"; message: string };

/**
 * Look up the currently-active link for a substrate deal. Returns null
 * if no active link (deal has never been linked, or was unlinked).
 */
export async function getActiveLinkForDeal(
  dealId: string,
): Promise<SfOpportunityLink | null> {
  const { data, error } = await supabaseAdmin
    .from("sf_opportunity_links")
    .select("*")
    .eq("opportunity_id", dealId)
    .is("unlinked_at", null)
    .maybeSingle();
  if (error) {
    console.error("[sf-links] getActiveLinkForDeal error:", error.message);
    return null;
  }
  return (data as SfOpportunityLink | null) ?? null;
}

/**
 * Full link history for a substrate deal — active row first (if any),
 * then unlinked rows by descending unlink time. Useful for audit views.
 */
export async function getLinkHistoryForDeal(
  dealId: string,
): Promise<SfOpportunityLink[]> {
  const { data, error } = await supabaseAdmin
    .from("sf_opportunity_links")
    .select("*")
    .eq("opportunity_id", dealId)
    .order("unlinked_at", { ascending: false, nullsFirst: true })
    .order("confirmed_at", { ascending: false });
  if (error) {
    console.error("[sf-links] getLinkHistoryForDeal error:", error.message);
    return [];
  }
  return (data as SfOpportunityLink[]) ?? [];
}

/**
 * Confirm (or re-confirm) a substrate ↔ SF link. Idempotent on same
 * pair. Requires explicit replace=true to overwrite a prior link to
 * a different SF opp.
 */
export async function confirmLink(
  input: ConfirmLinkInput,
): Promise<ConfirmLinkResult> {
  const { dealId, sfOppId, sfInstanceUrl, confirmedBy, notes, replace } =
    input;

  // 1. Verify the substrate deal exists.
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("id", dealId)
    .maybeSingle();
  if (oppErr) {
    return { ok: false, error: "db_error", message: oppErr.message };
  }
  if (!opp) {
    return {
      ok: false,
      error: "deal_not_found",
      message: `No substrate deal with id ${dealId}`,
    };
  }

  // 2. Check existing active link.
  const existing = await getActiveLinkForDeal(dealId);
  if (existing) {
    // Idempotent: same target → return existing.
    if (existing.sf_opp_id === sfOppId) {
      return { ok: true, link: existing, created: false, replaced: false };
    }
    // Different target without explicit replace → reject.
    if (!replace) {
      return {
        ok: false,
        error: "different_link_active",
        message: `Deal ${dealId} is already linked to SF opp ${existing.sf_opp_id}. Pass replace=true to switch.`,
        existing_link: existing,
      };
    }
    // Different target WITH replace → soft-unlink old, then create new.
    const { error: unlinkErr } = await supabaseAdmin
      .from("sf_opportunity_links")
      .update({ unlinked_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (unlinkErr) {
      return { ok: false, error: "db_error", message: unlinkErr.message };
    }
  }

  // 3. Insert the new active link.
  const { data: created, error: insertErr } = await supabaseAdmin
    .from("sf_opportunity_links")
    .insert({
      opportunity_id: dealId,
      sf_opp_id: sfOppId,
      sf_instance_url: sfInstanceUrl,
      confirmed_by: confirmedBy ?? null,
      notes: notes ?? null,
    })
    .select("*")
    .single();
  if (insertErr || !created) {
    return {
      ok: false,
      error: "db_error",
      message: insertErr?.message ?? "insert returned no row",
    };
  }

  return {
    ok: true,
    link: created as SfOpportunityLink,
    created: true,
    replaced: !!existing,
  };
}

export type UnlinkResult =
  | { ok: true; unlinked: SfOpportunityLink }
  | { ok: false; error: "no_active_link"; message: string }
  | { ok: false; error: "db_error"; message: string };

/**
 * Soft-unlink the active link for a substrate deal. The row stays for
 * audit; only unlinked_at is set. No-op (returns no_active_link) if
 * there's no active link.
 */
export async function unlinkDeal(dealId: string): Promise<UnlinkResult> {
  const existing = await getActiveLinkForDeal(dealId);
  if (!existing) {
    return {
      ok: false,
      error: "no_active_link",
      message: `Deal ${dealId} has no active SF link to unlink.`,
    };
  }
  const { data: updated, error } = await supabaseAdmin
    .from("sf_opportunity_links")
    .update({ unlinked_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error || !updated) {
    return {
      ok: false,
      error: "db_error",
      message: error?.message ?? "update returned no row",
    };
  }
  return { ok: true, unlinked: updated as SfOpportunityLink };
}
