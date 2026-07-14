/**
 * Append-only audit trail (migration 031_audit_log).
 *
 * recordAudit() writes one row describing a governed / privileged action.
 * It is BEST-EFFORT by contract: it never throws and never blocks the
 * caller — an audit-write failure must not fail the action it describes
 * (and, for deletes, must not leave the caller thinking the delete failed).
 */
import { supabaseAdmin } from "@/lib/db/client";

export interface AuditEntry {
  /** Tenant the action concerns (null for non-tenant admin actions). */
  tenantId?: string | null;
  /** Who performed it — Clerk email or "system". */
  actorEmail?: string | null;
  /** Clerk user id, if the action came from an authenticated request. */
  actorUserId?: string | null;
  /** Stable action name, e.g. "tenant.export", "tenant.delete", "crm.write". */
  action: string;
  /** The object acted on, e.g. "tenant:<id>", "opportunity:<id>". */
  entity?: string | null;
  /** Structured context — before/after, counts, request metadata. */
  meta?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("audit_log").insert({
      tenant_id: entry.tenantId ?? null,
      actor_email: entry.actorEmail ?? null,
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      meta: entry.meta ?? {},
    });
  } catch (err) {
    console.error("[audit] failed to record", entry.action, err);
  }
}
