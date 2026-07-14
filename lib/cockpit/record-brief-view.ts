import { supabaseAdmin } from "@/lib/db/client";

const THROTTLE_MS = 5 * 60 * 1000;

/**
 * Records that a rep opened a deal's brief — the dependency signal (do reps
 * return before their next call?). See migration 027.
 *
 * Write-throttled: at most one row per (tenant, user, opportunity) per ~5 min,
 * so the prep page's auto-refresh during regen doesn't inflate the count into
 * many "opens." Fully best-effort — never throws, never blocks the page, and
 * no-ops cleanly if the table isn't there yet (pre-migration-027).
 */
export async function recordBriefView(args: {
  tenantId: string;
  opportunityId: string;
  userId: string;
}): Promise<void> {
  const { tenantId, opportunityId, userId } = args;
  try {
    const since = new Date(Date.now() - THROTTLE_MS).toISOString();
    const { data, error } = await supabaseAdmin
      .from("brief_views")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("opportunity_id", opportunityId)
      .gte("viewed_at", since)
      .limit(1);
    // Table missing (pre-migration) or transient error → skip silently.
    if (error || (data && data.length > 0)) return;
    await supabaseAdmin.from("brief_views").insert({
      tenant_id: tenantId,
      opportunity_id: opportunityId,
      user_id: userId,
    });
  } catch {
    /* best-effort — a telemetry write must never affect the brief */
  }
}
