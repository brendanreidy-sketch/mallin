/**
 * ============================================================================
 *  rep_notes repository — Supabase CRUD
 * ============================================================================
 *
 *  Pure data access. No CRM calls happen here — those live in
 *  lib/notes/sync.ts and route through lib/crm.createNote().
 *
 *  Tenant scoping: every read/write is filtered by tenant_id. RLS on the
 *  table is the defense-in-depth layer (service-role bypasses RLS;
 *  application-layer scoping is the primary guard).
 *
 *  This module is server-only. Importing it into a client component
 *  will fail at build time because supabaseAdmin uses the service-role
 *  key.
 * ============================================================================
 */

import "server-only";

import { supabaseAdmin } from "@/lib/db/client";
import type {
  CreateRepNoteInput,
  RepNote,
  RepNoteAttachTo,
  RepNoteSyncStatus,
  UpdateRepNoteInput,
} from "./types";

const TABLE = "rep_notes";

// ─── Row-level helpers ─────────────────────────────────────────────────────

interface InsertRow {
  tenant_id: string;
  opportunity_id: string | null;
  account_id: string | null;
  section_key: string | null;
  created_by_user_id: string;
  created_by_email: string | null;
  body: string;
  attach_to: RepNoteAttachTo;
  is_pattern: boolean;
  is_private: boolean;
  sync_status: RepNoteSyncStatus;
}

export async function insertNote(args: {
  tenantId: string;
  input: CreateRepNoteInput;
  createdByUserId: string;
  createdByEmail: string | null;
}): Promise<RepNote> {
  const { tenantId, input, createdByUserId, createdByEmail } = args;

  const row: InsertRow = {
    tenant_id: tenantId,
    opportunity_id: input.opportunity_id ?? null,
    account_id: input.account_id ?? null,
    section_key: input.section_key ?? null,
    created_by_user_id: createdByUserId,
    created_by_email: createdByEmail,
    body: input.body,
    attach_to: input.attach_to,
    is_pattern: !!input.is_pattern,
    is_private: !!input.is_private,
    sync_status: "pending",
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(row)
    .select("*")
    .single();

  if (error) throw new Error(`rep_notes insert failed: ${error.message}`);
  return data as RepNote;
}

export async function getNoteById(
  tenantId: string,
  noteId: string,
): Promise<RepNote | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", noteId)
    .maybeSingle();
  if (error) throw new Error(`rep_notes lookup failed: ${error.message}`);
  return (data as RepNote) ?? null;
}

export async function listNotesForOpportunity(
  tenantId: string,
  opportunityId: string,
): Promise<RepNote[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`rep_notes list (opp) failed: ${error.message}`);
  return (data as RepNote[]) ?? [];
}

export async function listNotesForAccount(
  tenantId: string,
  accountId: string,
): Promise<RepNote[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`rep_notes list (account) failed: ${error.message}`);
  return (data as RepNote[]) ?? [];
}

export async function updateNote(args: {
  tenantId: string;
  noteId: string;
  patch: UpdateRepNoteInput;
}): Promise<RepNote | null> {
  const { tenantId, noteId, patch } = args;
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.body !== undefined) fields.body = patch.body;
  if (patch.is_pattern !== undefined) fields.is_pattern = !!patch.is_pattern;
  if (patch.is_private !== undefined) fields.is_private = !!patch.is_private;

  // Any user-visible edit re-queues for sync — the CRM record needs to
  // be brought up to date too. Per the write-through doctrine, divergence
  // between Mallin and the CRM is the failure mode.
  if (patch.body !== undefined || patch.is_private !== undefined) {
    fields.sync_status = "pending" satisfies RepNoteSyncStatus;
    fields.failed_reason = null;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(fields)
    .eq("tenant_id", tenantId)
    .eq("id", noteId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`rep_notes update failed: ${error.message}`);
  return (data as RepNote) ?? null;
}

export async function deleteNote(
  tenantId: string,
  noteId: string,
): Promise<boolean> {
  // NB: deleting a Mallin row does NOT delete the CRM record. CRM is
  // authoritative; the customer manages CRM-side deletion through their
  // CRM's own UI/permissions. Mallin only drops its cache.
  const { error, count } = await supabaseAdmin
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("id", noteId);
  if (error) throw new Error(`rep_notes delete failed: ${error.message}`);
  return (count ?? 0) > 0;
}

// ─── Sync state transitions ────────────────────────────────────────────────

export async function markSyncing(
  tenantId: string,
  noteId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      sync_status: "syncing" satisfies RepNoteSyncStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", noteId);
  if (error) throw new Error(`rep_notes mark syncing failed: ${error.message}`);
}

export async function markSynced(args: {
  tenantId: string;
  noteId: string;
  externalActivityId: string;
  externalObjectType: string | null;
}): Promise<RepNote | null> {
  const { tenantId, noteId, externalActivityId, externalObjectType } = args;
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      sync_status: "synced" satisfies RepNoteSyncStatus,
      external_activity_id: externalActivityId,
      external_object_type: externalObjectType,
      last_sync_at: new Date().toISOString(),
      failed_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", noteId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`rep_notes mark synced failed: ${error.message}`);
  return (data as RepNote) ?? null;
}

export async function markSyncFailed(args: {
  tenantId: string;
  noteId: string;
  reason: string;
}): Promise<RepNote | null> {
  const { tenantId, noteId, reason } = args;
  // Bump retry_count without an extra read by leaning on Postgres
  // arithmetic via a stored procedure. Simpler v1: read-modify-write.
  const current = await getNoteById(tenantId, noteId);
  const retryCount = (current?.retry_count ?? 0) + 1;
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      sync_status: "failed" satisfies RepNoteSyncStatus,
      failed_reason: reason.slice(0, 500), // belt + suspenders on column size
      retry_count: retryCount,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", noteId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`rep_notes mark failed failed: ${error.message}`);
  return (data as RepNote) ?? null;
}
