/**
 * Follow-up draft cache.
 *
 * The follow-up email is an LLM generation; regenerating it on every /prep view
 * is slow (blocks nothing now — it's in a Suspense boundary — but still burns a
 * call each time) and inconsistent (the draft can drift between views). This
 * caches it keyed to the brief version (execution_artifact_id): generated once,
 * then read on every subsequent view, and refreshed only when a NEW brief is
 * produced (new artifact id → cache miss). Event-driven, not on a timer.
 *
 * Fails safe: any cache read/write error (e.g. the table isn't migrated in this
 * environment yet) falls back to generating inline, so /prep never breaks.
 */
import { supabaseAdmin } from "@/lib/db/client";
import { generateFollowupDraft } from "@/lib/agents/draft-followup";

type GenArgs = Parameters<typeof generateFollowupDraft>;
type DraftFollowup = Awaited<ReturnType<typeof generateFollowupDraft>>;

const TABLE = "followup_drafts";

export interface CachedDraftArgs {
  /** Cache key parts. When any is missing (file/fixture path), the cache is
   *  skipped and the draft is generated fresh. */
  tenantId?: string | null;
  opportunityId?: string | null;
  artifactId?: string | null;
  substrate: GenArgs[0];
  artifact: GenArgs[1];
  opts?: GenArgs[2];
}

export async function getOrGenerateFollowupDraft(
  args: CachedDraftArgs,
): Promise<DraftFollowup> {
  const { tenantId, opportunityId, artifactId, substrate, artifact, opts } = args;

  // No stable brief-version key → nothing to cache against; generate inline.
  if (!tenantId || !opportunityId || !artifactId) {
    return generateFollowupDraft(substrate, artifact, opts ?? {});
  }

  // Cache read — one draft per brief version.
  try {
    const { data } = await supabaseAdmin
      .from(TABLE)
      .select("draft")
      .eq("execution_artifact_id", artifactId)
      .maybeSingle();
    if (data?.draft) return data.draft as DraftFollowup;
  } catch {
    // Table missing / transient error — fall through to generate.
  }

  // Miss → generate once, then persist (best-effort).
  const draft = await generateFollowupDraft(substrate, artifact, opts ?? {});
  try {
    await supabaseAdmin.from(TABLE).upsert(
      {
        tenant_id: tenantId,
        opportunity_id: opportunityId,
        execution_artifact_id: artifactId,
        draft,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "execution_artifact_id" },
    );
  } catch {
    // Cache write is best-effort; the draft still returns.
  }
  return draft;
}
