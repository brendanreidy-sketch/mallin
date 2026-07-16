/**
 * ensureDeckCopy — lazily generate the deck narrative (meeting.sections) for a
 * deal and cache it into the stored artifact.
 *
 * Signal-aligned: this runs only when a rep actually requests a deck (POST
 * /api/generate-deck), and is a no-op once the sections are cached — so the
 * expensive deck-copy LLM call happens at most once per deal, on demand, not
 * speculatively for every intake.
 *
 * Flow:
 *   1. Load the current artifact. If it already has meeting.sections → cached,
 *      return (no LLM call).
 *   2. Load the latest stored transcript for the deal. If none → can't write
 *      narrative; return (deck falls back to deterministic slides).
 *   3. Run the deck-copy agent → meeting block with sections.
 *   4. Merge into the artifact's meeting (preferring intake-curated attendees/
 *      agenda) and persist via the immutable insert-new / mark-old pattern.
 *
 * Never throws: any failure degrades to "no narrative", never breaks deck
 * generation.
 */

import { supabaseAdmin } from "@/lib/db/client";
import { getTenantBrand } from "@/lib/auth/tenant-context";
import type { AccountIntelligenceArtifact, MeetingBlock } from "@/lib/intelligence/types";
import { generateDeckCopy } from "./deck-copy-agent";
import { researchSellerProof } from "./seller-proof-agent";
import { getLatestDealTranscriptMeta } from "./deck-transcripts";

export type EnsureResult =
  | { generated: true }
  | { generated: false; reason: "cached" | "no_artifact" | "no_transcript" | "error" };

/**
 * Merge freshly-generated deck copy into any existing meeting block. PURE +
 * exported for testing.
 *
 * The copy is generated from the LATEST transcript, so it is the authoritative
 * record of the most recent call — the WHOLE meeting block comes from it. The
 * prior version preferred the existing title/date/agenda/type, which froze a
 * multi-call deck's header on the PRIOR call while the body (sections / quotes /
 * impact / attendees) advanced: e.g. a stale "…Intro Call" title and the intro
 * agenda sitting on top of a fully-updated pricing deck. Existing is now only a
 * fallback for whatever a given transcript didn't yield (e.g. an undated call).
 */
export function mergeMeeting(existing: MeetingBlock | null | undefined, copy: MeetingBlock): MeetingBlock {
  return {
    title: copy.title || existing?.title,
    date: copy.date || existing?.date,
    meeting_type: copy.meeting_type || existing?.meeting_type,
    attendees: copy.attendees?.length ? copy.attendees : (existing?.attendees ?? []),
    agenda: copy.agenda?.length ? copy.agenda : (existing?.agenda ?? []),
    sections: copy.sections ?? [],
    quotes: copy.quotes ?? [],
    impact: copy.impact ?? null,
    deck_copy_source_at: copy.deck_copy_source_at ?? existing?.deck_copy_source_at ?? null,
  };
}

export async function ensureDeckCopy(
  opportunityId: string,
  opts?: { force?: boolean },
): Promise<EnsureResult> {
  try {
    const { data: row, error } = await supabaseAdmin
      .from("account_intelligence_artifacts")
      .select("id, tenant_id, account_id, opportunity_id, primary_source, generated_at, artifact")
      .eq("opportunity_id", opportunityId)
      .eq("is_current", true)
      .maybeSingle();
    if (error || !row) return { generated: false, reason: "no_artifact" };

    const artifact = row.artifact as AccountIntelligenceArtifact;

    const latest = await getLatestDealTranscriptMeta(opportunityId);
    if (!latest) return { generated: false, reason: "no_transcript" };

    // Regenerate when there's no copy yet, OR a NEWER transcript has landed than
    // the one the cached copy was built from — so the next-call deck reflects the
    // latest call instead of staying frozen on the first. Only treat as cached
    // when we have a copy AND know its source transcript AND nothing newer exists.
    const cachedAt = artifact.meeting?.deck_copy_source_at ?? null;
    const hasCopy = Boolean(artifact.meeting?.sections?.length);
    // force bypasses the cache — used to re-render a deck after a copy/prompt
    // change (e.g. the new "What's included" section) without waiting for a
    // newer transcript to land.
    if (!opts?.force && hasCopy && cachedAt && latest.createdAt <= cachedAt) {
      return { generated: false, reason: "cached" };
    }

    const sellerBrand = row.tenant_id ? await getTenantBrand(row.tenant_id as string) : null;
    const sellerName = sellerBrand?.displayName ?? "Us";
    const buyerName = artifact.account?.name ?? "the account";
    const productContext = artifact.metadata?.product_context ?? "";

    // Pass the PRIOR meeting so a follow-on deck carries forward still-live
    // threads (pain, goals, stakeholders) instead of resetting to only this
    // call. The latest transcript stays authoritative; see generateDeckCopy.
    // Research the seller's real proof (same-industry references + need→module
    // fit) so the deck actually SELLS the seller, not just mirrors the call.
    // Never throws — degrades to null (transcript-only copy).
    const sellerProof = await researchSellerProof({
      sellerName,
      buyerName,
      productContext,
      transcript: latest.text,
    });

    const copy = await generateDeckCopy({
      transcript: latest.text,
      productContext,
      sellerName,
      buyerName,
      priorMeeting: artifact.meeting ?? null,
      sellerProof,
    });
    copy.deck_copy_source_at = latest.createdAt;
    const newArtifact: AccountIntelligenceArtifact = {
      ...artifact,
      meeting: mergeMeeting(artifact.meeting, copy),
    };

    // Immutable ledger: mark the current row not-current, insert the hydrated one.
    await supabaseAdmin
      .from("account_intelligence_artifacts")
      .update({ is_current: false })
      .eq("id", row.id);

    const { error: insErr } = await supabaseAdmin.from("account_intelligence_artifacts").insert({
      tenant_id: row.tenant_id,
      account_id: row.account_id,
      opportunity_id: row.opportunity_id,
      artifact: newArtifact,
      primary_source: row.primary_source,
      is_current: true,
      generated_at: row.generated_at,
    });
    if (insErr) {
      // Roll the old row back to current so we don't lose the deck entirely.
      await supabaseAdmin
        .from("account_intelligence_artifacts")
        .update({ is_current: true })
        .eq("id", row.id);
      console.warn(`[ensureDeckCopy] insert failed: ${insErr.message}`);
      return { generated: false, reason: "error" };
    }
    return { generated: true };
  } catch (e) {
    console.warn(`[ensureDeckCopy] error: ${(e as Error).message}`);
    return { generated: false, reason: "error" };
  }
}
