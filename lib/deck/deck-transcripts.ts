/**
 * Deal transcript storage — persist + retrieve the raw call transcript that the
 * deck-copy step needs (see migration 017_deal_transcripts.sql).
 *
 * Both functions are resilient to the table not existing yet (migration not
 * applied): save logs + swallows, get returns null. That keeps intake and deck
 * generation working in environments where 017 hasn't been run.
 */

import { supabaseAdmin } from "@/lib/db/client";

export async function saveDealTranscript(args: {
  tenantId: string;
  opportunityId: string | null;
  accountId: string | null;
  source: string;
  rawText: string;
}): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from("deal_transcripts").insert({
      tenant_id: args.tenantId,
      opportunity_id: args.opportunityId,
      account_id: args.accountId,
      source: args.source,
      raw_text: args.rawText,
      char_count: args.rawText.length,
    });
    if (error) {
      console.warn(`[deck-transcripts] save failed: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[deck-transcripts] save threw: ${(e as Error).message}`);
    return false;
  }
}

/** Latest transcript text for an opportunity, or null. */
export async function getLatestDealTranscript(opportunityId: string): Promise<string | null> {
  return (await getLatestDealTranscriptMeta(opportunityId))?.text ?? null;
}

/** Latest transcript text + its created_at. The timestamp lets the deck-copy
 *  cache detect a NEWER call and regenerate, so the next-call deck reflects the
 *  latest transcript. Null when none exists / the table isn't there yet. */
export async function getLatestDealTranscriptMeta(
  opportunityId: string,
): Promise<{ text: string; createdAt: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("deal_transcripts")
      .select("raw_text, created_at")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data || !data.raw_text) return null;
    return { text: data.raw_text as string, createdAt: data.created_at as string };
  } catch {
    return null;
  }
}
