/**
 * Daily intelligence refresh — cron endpoint.
 *
 * Vercel hits this on the schedule declared in `vercel.json`. For every
 * Account Intelligence artifact where is_current=true, it asks Claude
 * to web_search for events from the last ~3 weeks, merges genuinely-new
 * ones into recent_events (deduped + capped), and writes back a new
 * is_current=true artifact.
 *
 * Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}` on cron-
 * triggered requests. We reject anything without the matching secret.
 *
 * Idempotence: safe to invoke multiple times in a day — dedup handles
 * the no-op case. If Claude returns nothing new, no DB write happens
 * for that account.
 *
 * Failure model: per-account try/catch so one failure doesn't abort
 * the rest. Each refresh is independent.
 *
 * Cost ceiling: tunable via MAX_ACCOUNTS_PER_RUN — defaults to a number
 * comfortably below "this got expensive" at current account count.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshAccountNews } from "@/lib/intelligence/refresh/news-refresh";
import { mergeNewEventsIntoArtifact } from "@/lib/intelligence/refresh/merge";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

// Vercel-recommended runtime config for cron jobs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — web_search calls take a while

const MAX_ACCOUNTS_PER_RUN = 50;

interface PerAccountResult {
  artifact_id: string;
  account_name: string;
  status: "refreshed" | "no_changes" | "skipped" | "error";
  added: number;
  duplicates_skipped: number;
  search_count: number;
  error?: string;
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured = lock down completely (dev: set CRON_SECRET
    // even locally to test the endpoint).
    return false;
  }
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function refreshOne(
  c: ReturnType<typeof db>,
  row: {
    id: string;
    tenant_id: string;
    account_id: string;
    opportunity_id: string | null;
    artifact: AccountIntelligenceArtifact;
  },
): Promise<PerAccountResult> {
  const artifact = row.artifact;
  const base: Omit<PerAccountResult, "status"> = {
    artifact_id: row.id,
    account_name: artifact?.account?.name ?? "(unknown)",
    added: 0,
    duplicates_skipped: 0,
    search_count: 0,
  };

  if (!artifact?.metadata?.product_context) {
    return { ...base, status: "skipped", error: "no product_context" };
  }

  const { new_events, search_count } = await refreshAccountNews(artifact);

  if (new_events.length === 0) {
    return { ...base, status: "no_changes", search_count };
  }

  const { merged, report } = mergeNewEventsIntoArtifact(artifact, new_events);

  if (report.added === 0) {
    // All candidates were dupes after the merge dedup pass.
    return {
      ...base,
      status: "no_changes",
      duplicates_skipped: report.duplicates_skipped,
      search_count,
    };
  }

  // Write the refreshed artifact. Mark prior as not-current, then insert.
  const { error: updErr } = await c
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("tenant_id", row.tenant_id)
    .eq("account_id", row.account_id)
    .eq("is_current", true);
  if (updErr) {
    return { ...base, status: "error", error: `update prior: ${updErr.message}` };
  }

  const { error: insErr } = await c
    .from("account_intelligence_artifacts")
    .insert({
      tenant_id: row.tenant_id,
      account_id: row.account_id,
      // CRITICAL: preserve opportunity_id from the artifact we're
      // refreshing. The prep-page loader filters by opportunity_id, so
      // writing null here orphans the refreshed artifact (loader can't
      // find it → renders empty state). Regression caught May 13 2026.
      opportunity_id: row.opportunity_id,
      artifact: merged,
      primary_source: "mixed",
      is_current: true,
      generated_at: merged.metadata.generated_at,
    });
  if (insErr) {
    return { ...base, status: "error", error: `insert: ${insErr.message}` };
  }

  return {
    ...base,
    status: "refreshed",
    added: report.added,
    duplicates_skipped: report.duplicates_skipped,
    search_count,
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const c = db();

  const { data, error } = await c
    .from("account_intelligence_artifacts")
    .select("id, tenant_id, account_id, opportunity_id, artifact")
    .eq("is_current", true)
    .limit(MAX_ACCOUNTS_PER_RUN);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, started_at: startedAt },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as Array<{
    id: string;
    tenant_id: string;
    account_id: string;
    opportunity_id: string | null;
    artifact: AccountIntelligenceArtifact;
  }>;

  const results: PerAccountResult[] = [];
  for (const row of rows) {
    try {
      results.push(await refreshOne(c, row));
    } catch (err) {
      results.push({
        artifact_id: row.id,
        account_name: row.artifact?.account?.name ?? "(unknown)",
        status: "error",
        added: 0,
        duplicates_skipped: 0,
        search_count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    ok: true,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    artifacts_considered: rows.length,
    refreshed: results.filter((r) => r.status === "refreshed").length,
    no_changes: results.filter((r) => r.status === "no_changes").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };

  console.log(
    `[cron/refresh-intelligence] ${summary.refreshed} refreshed, ` +
      `${summary.no_changes} no-changes, ${summary.skipped} skipped, ` +
      `${summary.errors} errors`,
  );

  return NextResponse.json(summary);
}
