/**
 * ============================================================================
 *  Rep notes — CRM sync
 * ============================================================================
 *
 *  The boundary between Mallin's note table and the customer's CRM.
 *  All CRM I/O routes through lib/crm — this module never imports a
 *  provider-specific module directly. The provider-neutral pattern
 *  documented in memory:write_through_surface_contract.md is enforced
 *  by the architecture: we call lib/crm.createNote(), the router
 *  dispatches to the right adapter based on tenant.crm_provider.
 *
 *  Sync state transitions handled here:
 *    pending  ──► syncing  ──► synced
 *    pending  ──► syncing  ──► failed (retry_count++)
 *
 *  Visible to the rep at all times via the sync_status column. The UI
 *  reads that column and renders the sync-chip the mockup demonstrates.
 * ============================================================================
 */

import "server-only";

import { createNote, getProviderName } from "@/lib/crm";
import { supabaseAdmin } from "@/lib/db/client";
import { isTenantDemo } from "@/lib/auth/tenant-context";
import {
  markSyncing,
  markSynced,
  markSyncFailed,
} from "./repository";
import type { RepNote } from "./types";

/**
 * Resolve the CRM-side external ID for a Mallin opportunity or account.
 * The opportunities/accounts tables carry `source_external_id` which IS
 * the CRM record's ID for tenants connected to a real CRM.
 *
 * Returns null when the record has no CRM-side counterpart (e.g. a
 * Mallin-only deal not yet synced from CRM; a deal in a demo tenant).
 * The caller treats that as a sync failure with a known cause.
 */
async function resolveExternalId(args: {
  tenantId: string;
  opportunityId: string | null;
  accountId: string | null;
  attachTo: "deal" | "account";
}): Promise<string | null> {
  const { tenantId, opportunityId, accountId, attachTo } = args;
  if (attachTo === "deal" && opportunityId) {
    const { data } = await supabaseAdmin
      .from("opportunities")
      .select("source_external_id")
      .eq("tenant_id", tenantId)
      .eq("id", opportunityId)
      .maybeSingle();
    return data?.source_external_id ?? null;
  }
  if (attachTo === "account" && accountId) {
    const { data } = await supabaseAdmin
      .from("accounts")
      .select("source_external_id")
      .eq("tenant_id", tenantId)
      .eq("id", accountId)
      .maybeSingle();
    return data?.source_external_id ?? null;
  }
  return null;
}

/**
 * Sync a single rep_note to the customer's CRM. Updates the row's
 * sync_status as it progresses. Idempotent on re-call — if the note
 * is already 'synced' we no-op.
 *
 * Demo tenants short-circuit: we mark the note synced with a synthetic
 * external_activity_id so the UI demonstrates the loop without
 * touching a real CRM. Same pattern as /api/crm/apply-suggestion.
 */
export async function syncNote(note: RepNote): Promise<RepNote> {
  if (note.sync_status === "synced") return note;

  await markSyncing(note.tenant_id, note.id);

  // Demo short-circuit — simulate sync without a CRM write.
  if (await isTenantDemo(note.tenant_id)) {
    const updated = await markSynced({
      tenantId: note.tenant_id,
      noteId: note.id,
      externalActivityId: `demo_${note.id}`,
      externalObjectType: "note",
    });
    return updated ?? note;
  }

  // Resolve the CRM-side ID for the target object.
  const externalId = await resolveExternalId({
    tenantId: note.tenant_id,
    opportunityId: note.opportunity_id,
    accountId: note.account_id,
    attachTo: note.attach_to,
  });
  if (!externalId) {
    const updated = await markSyncFailed({
      tenantId: note.tenant_id,
      noteId: note.id,
      reason: `No CRM record linked to this ${note.attach_to}. Reconnect the integration or confirm the record exists.`,
    });
    return updated ?? note;
  }

  // Resolve provider for the tenant — for error messages + future-proof
  // visibility (when an adapter doesn't support notes, we tell the rep
  // which CRM is the limiting factor).
  let providerName: string;
  try {
    providerName = await getProviderName(note.tenant_id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown_provider";
    const updated = await markSyncFailed({
      tenantId: note.tenant_id,
      noteId: note.id,
      reason,
    });
    return updated ?? note;
  }

  // Currently lib/crm.createNote supports attaching to a deal. Attaching
  // to an account is a v2 extension — we surface that gap clearly rather
  // than silently dropping. The UI's attach_to picker should hide
  // 'account' until the adapter layer covers it.
  if (note.attach_to !== "deal") {
    const updated = await markSyncFailed({
      tenantId: note.tenant_id,
      noteId: note.id,
      reason: `Attaching notes to an ${note.attach_to} is not yet supported by the ${providerName} adapter. v1 supports deal-attached notes only.`,
    });
    return updated ?? note;
  }

  // Adapt body → sanitized HTML. v1 keeps it simple: wrap plain text
  // in a single <p>, escape brackets. Markdown rendering is a v2 add.
  const bodyHtml = toMinimalHtml(note.body);

  try {
    const result = await createNote(note.tenant_id, externalId, {
      body_html: bodyHtml,
    });
    const updated = await markSynced({
      tenantId: note.tenant_id,
      noteId: note.id,
      externalActivityId: result.ref.external_id,
      externalObjectType: result.type, // 'note' from the neutral types
    });
    return updated ?? note;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "sync_failed";
    const updated = await markSyncFailed({
      tenantId: note.tenant_id,
      noteId: note.id,
      reason,
    });
    return updated ?? note;
  }
}

/**
 * Minimal text → safe HTML for note bodies. v1 only — escapes brackets
 * + wraps newlines in <br/>. We do not allow arbitrary HTML from the
 * client because providers each accept different subsets. If the rep
 * pastes a link, it stays as plain text in v1; auto-linkify is a v2
 * polish.
 */
function toMinimalHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withBreaks = escaped.replace(/\r\n|\r|\n/g, "<br/>");
  return `<p>${withBreaks}</p>`;
}
