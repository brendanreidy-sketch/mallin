/**
 * Per-tenant raw-transcript retention enforcement (migration 032).
 *
 * Deletes raw transcripts older than each tenant's configured window
 * (tenants.retention_days). Tenants with retention_days = NULL keep everything
 * — life-of-account is the default, so only tenants that opted into a window
 * are ever touched. Derived artifacts (the *_artifacts tables) are left intact.
 *
 * Idempotent + best-effort per tenant. Driven by /api/cron/retention-purge.
 */
import { supabaseAdmin } from "@/lib/db/client";

export interface PurgeResult {
  ran_at: string;
  tenants_processed: number;
  purged: { tenant_id: string; retention_days: number; deleted: number }[];
  errors: { tenant_id: string; error: string }[];
}

export async function purgeExpiredTranscripts(): Promise<PurgeResult> {
  const ran_at = new Date().toISOString();
  const purged: PurgeResult["purged"] = [];
  const errors: PurgeResult["errors"] = [];

  const { data: tenants, error } = await supabaseAdmin
    .from("tenants")
    .select("id, retention_days")
    .not("retention_days", "is", null);
  if (error) {
    return {
      ran_at,
      tenants_processed: 0,
      purged,
      errors: [{ tenant_id: "*", error: error.message }],
    };
  }

  const rows = (tenants ?? []) as { id: string; retention_days: number }[];
  for (const t of rows) {
    const days = Number(t.retention_days);
    if (!Number.isFinite(days) || days <= 0) continue;

    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { error: delErr, count } = await supabaseAdmin
      .from("deal_transcripts")
      .delete({ count: "exact" })
      .eq("tenant_id", t.id)
      .lt("created_at", cutoff);

    if (delErr) {
      errors.push({ tenant_id: t.id, error: delErr.message });
      continue;
    }
    if ((count ?? 0) > 0) {
      purged.push({ tenant_id: t.id, retention_days: days, deleted: count ?? 0 });
    }
  }

  return { ran_at, tenants_processed: rows.length, purged, errors };
}
