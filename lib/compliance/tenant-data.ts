/**
 * Tenant data export + deletion (GDPR / CCPA portability + erasure).
 *
 * These back the /api/admin/tenant/[tenantId]/{export,delete} endpoints and
 * make the retention policy's "delete within 30 days of request" promise real.
 * They are admin-gated at the route layer.
 *
 * DELETION STRATEGY
 *   1. Sweep every tenant-scoped table by tenant_id — this covers rows that
 *      are NOT FK-cascaded to tenants (e.g. deal_transcripts has a tenant_id
 *      but no cascading FK), which a naive "delete the tenant row" would orphan.
 *   2. Delete the tenants row — cascades the base entities (accounts /
 *      opportunities / stakeholders) and any remaining FK-cascaded children.
 * Every step is best-effort per table and reported back, so one unexpected
 * schema difference can't silently skip data or abort the whole operation.
 *
 * TENANT_SCOPED_TABLES is a curated list (parsed from the migrations). Keep it
 * in sync when a new tenant-scoped table is added — same discipline as the
 * curated list in scripts/db/migrate.mjs. audit_log is intentionally excluded:
 * audit records must survive a tenant deletion.
 */
import { supabaseAdmin } from "@/lib/db/client";

export const TENANT_SCOPED_TABLES = [
  "account_intelligence_artifacts",
  "action_queue",
  "agent_configs",
  "brief_feedback",
  "brief_views",
  "cockpit_events",
  "deal_outcomes",
  "deal_transcripts",
  "execution_artifacts",
  "gmail_oauth_tokens",
  "hubspot_oauth_tokens",
  "internal_participants",
  "live_coach_turns",
  "outbound_prospects",
  "rep_behavior_artifacts",
  "rep_notes",
  "sdr_actions",
  "sdr_conversations",
  "sdr_leads",
  "sdr_messages",
  "slack_outbound_posts",
  "touches",
] as const;

// Base entities also scoped by tenant_id. Exported explicitly; on delete they
// are removed by the tenants-row cascade. Best-effort — skipped if the shape
// differs from expectation.
const BASE_ENTITY_TABLES = ["accounts", "opportunities", "stakeholders"] as const;

export interface TenantExport {
  tenant_id: string;
  exported_at: string;
  tables: Record<string, unknown[]>;
  skipped: { table: string; error: string }[];
}

export async function exportTenantData(tenantId: string): Promise<TenantExport> {
  const tables: Record<string, unknown[]> = {};
  const skipped: { table: string; error: string }[] = [];

  for (const table of [...TENANT_SCOPED_TABLES, ...BASE_ENTITY_TABLES]) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("tenant_id", tenantId);
    if (error) {
      skipped.push({ table, error: error.message });
      continue;
    }
    tables[table] = data ?? [];
  }

  const { data: tenantRow } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();
  tables["tenants"] = tenantRow ? [tenantRow] : [];

  return {
    tenant_id: tenantId,
    exported_at: new Date().toISOString(),
    tables,
    skipped,
  };
}

export interface TenantDeleteResult {
  tenant_id: string;
  deleted: Record<string, number>;
  skipped: { table: string; error: string }[];
  tenant_row_deleted: boolean;
}

export async function deleteTenantData(tenantId: string): Promise<TenantDeleteResult> {
  const deleted: Record<string, number> = {};
  const skipped: { table: string; error: string }[] = [];

  // 1. Sweep explicit tenant-scoped tables (covers non-cascaded rows).
  for (const table of TENANT_SCOPED_TABLES) {
    const { error, count } = await supabaseAdmin
      .from(table)
      .delete({ count: "exact" })
      .eq("tenant_id", tenantId);
    if (error) {
      skipped.push({ table, error: error.message });
      continue;
    }
    deleted[table] = count ?? 0;
  }

  // 2. Delete the tenant row — cascades base entities + FK-cascaded children.
  const { error: tenantErr } = await supabaseAdmin
    .from("tenants")
    .delete()
    .eq("id", tenantId);
  if (tenantErr) {
    skipped.push({ table: "tenants", error: tenantErr.message });
  }

  return {
    tenant_id: tenantId,
    deleted,
    skipped,
    tenant_row_deleted: !tenantErr,
  };
}
