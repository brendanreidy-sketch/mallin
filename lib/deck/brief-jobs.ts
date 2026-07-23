/**
 * brief-jobs — data-access + worker runner for the async internal-brief job.
 *
 * Generation is a multi-minute model pipeline that can't be held in a synchronous
 * HTTP request, so it runs out-of-band:
 *   - enqueueBriefJob:  POST inserts a 'queued' row (dedupes to the in-flight job).
 *   - claimNextBriefJob: the cron worker claims the oldest queued job (compare-
 *     and-swap on status — race-safe without an explicit row lock).
 *   - runClaimedBriefJob: loads sources, runs generateInternalBrief, and writes
 *     the terminal result (base64 .pptx on success, error_code on failure).
 *   - getBriefJob: tenant-scoped fetch for the status + download routes.
 *
 * All access uses the service-role client (bypasses RLS); every read is scoped
 * by tenant_id in-query. No prompt/evidence/slide text is ever stored — only the
 * rendered artifact and a public failure code.
 */

import { supabaseAdmin } from "@/lib/db/client";
import { loadInternalBriefSources } from "@/lib/deck/load-internal-brief-sources";
import { createSonnetBriefClient, generateInternalBrief } from "@/lib/deck/generate-internal-brief";

export type BriefJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface BriefJob {
  id: string;
  tenant_id: string;
  opportunity_id: string;
  user_id: string;
  status: BriefJobStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  filename: string | null;
  bundle_version: string | null;
  model_id: string | null;
  pptx_base64: string | null;
  error_code: string | null;
  attempts: number;
}

const TABLE = "brief_jobs";

/** Enqueue a job for (tenant, user, deal). If an active (queued|running) job
 *  already exists, return it instead of creating a duplicate (the partial
 *  UNIQUE index makes this race-safe). */
export async function enqueueBriefJob(args: { tenantId: string; dealId: string; userId: string }): Promise<{ jobId: string; status: BriefJobStatus; reused: boolean }> {
  const admin = supabaseAdmin;
  const insert = await admin
    .from(TABLE)
    .insert({ tenant_id: args.tenantId, opportunity_id: args.dealId, user_id: args.userId, status: "queued" })
    .select("id,status")
    .maybeSingle();
  if (!insert.error && insert.data) return { jobId: insert.data.id as string, status: insert.data.status as BriefJobStatus, reused: false };
  // Active-job unique violation → hand back the in-flight job.
  if (insert.error?.code === "23505") {
    const existing = await admin
      .from(TABLE)
      .select("id,status")
      .eq("tenant_id", args.tenantId)
      .eq("user_id", args.userId)
      .eq("opportunity_id", args.dealId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing.data) return { jobId: existing.data.id as string, status: existing.data.status as BriefJobStatus, reused: true };
  }
  throw new Error(`enqueueBriefJob failed: ${insert.error?.message ?? "unknown"}`);
}

/** Atomically claim the oldest queued job. Compare-and-swap on status='queued'
 *  means only one concurrent worker wins the row; losers get null. */
export async function claimNextBriefJob(): Promise<BriefJob | null> {
  const admin = supabaseAdmin;
  const cand = await admin.from(TABLE).select("id,attempts").eq("status", "queued").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (cand.error || !cand.data) return null;
  const claimed = await admin
    .from(TABLE)
    .update({ status: "running", attempts: (cand.data.attempts ?? 0) + 1 })
    .eq("id", cand.data.id)
    .eq("status", "queued") // CAS: only claim if still queued
    .select("*")
    .maybeSingle();
  if (claimed.error || !claimed.data) return null; // lost the race — another worker took it
  return claimed.data as BriefJob;
}

/** Run a claimed ('running') job to a terminal state. Never throws. */
export async function runClaimedBriefJob(job: BriefJob): Promise<BriefJobStatus> {
  const admin = supabaseAdmin;
  const fail = async (code: string): Promise<BriefJobStatus> => {
    await admin.from(TABLE).update({ status: "failed", error_code: code }).eq("id", job.id);
    return "failed";
  };
  try {
    const loaded = await loadInternalBriefSources(job.opportunity_id, job.tenant_id);
    if (!loaded.ok) {
      const code = loaded.code === "deal_not_found" ? "deal_not_found" : loaded.code === "current_artifact_conflict" ? "current_artifact_conflict" : "required_artifact_missing";
      return await fail(code);
    }
    const cover = {
      dealName: loaded.sources.opportunity.name,
      companyName: loaded.sources.companyName ?? undefined,
      asOf: new Date().toISOString().slice(0, 10),
    };
    const result = await generateInternalBrief({ sources: loaded.sources, cover, modelClient: createSonnetBriefClient() });
    if (!result.ok) return await fail(result.code);
    await admin
      .from(TABLE)
      .update({
        status: "succeeded",
        filename: result.filename,
        bundle_version: result.bundleVersion,
        model_id: result.modelId,
        pptx_base64: Buffer.from(result.buffer).toString("base64"),
      })
      .eq("id", job.id);
    return "succeeded";
  } catch {
    return await fail("brief_render_failed");
  }
}

/** Tenant-scoped fetch for the status + download routes. */
export async function getBriefJob(jobId: string, tenantId: string): Promise<BriefJob | null> {
  const r = await supabaseAdmin.from(TABLE).select("*").eq("id", jobId).eq("tenant_id", tenantId).maybeSingle();
  return (r.data as BriefJob | null) ?? null;
}
