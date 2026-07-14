/**
 * ============================================================================
 *  PATCH  /api/notes/[id] — edit body / flags + re-sync
 *  DELETE /api/notes/[id] — drop the Mallin row
 *                          (does NOT delete the CRM record — see below)
 * ============================================================================
 *
 *  PATCH: any body-or-private edit re-queues for sync. The repository
 *  flips sync_status back to 'pending' when those fields change so the
 *  cockpit chip reflects the re-sync attempt the user is about to see.
 *
 *  DELETE: drops the Mallin-side row only. The CRM record (if synced)
 *  stays in place. The customer manages CRM-side deletion through their
 *  own CRM UI under their existing governance. This honors the
 *  write-through doctrine: the CRM is the system of record; Mallin
 *  doesn't claim authority to delete from it.
 * ============================================================================
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { supabaseAdmin } from "@/lib/db/client";
import {
  deleteNote,
  getNoteById,
  updateNote,
} from "@/lib/notes/repository";
import { syncNote } from "@/lib/notes/sync";
import type { UpdateRepNoteInput } from "@/lib/notes/types";

// Resolve the tenant_id for an arbitrary note id. We do NOT trust the
// client to send tenant_id; we look it up by note id and use that for
// every downstream call. This keeps the auth boundary clean.
async function resolveTenantIdForNote(noteId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("rep_notes")
    .select("tenant_id")
    .eq("id", noteId)
    .maybeSingle();
  return data?.tenant_id ?? null;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── PATCH /api/notes/[id] ────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "missing_id" },
      { status: 400 },
    );
  }

  const tenantId = await resolveTenantIdForNote(id);
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  let patch: UpdateRepNoteInput;
  try {
    patch = (await req.json()) as UpdateRepNoteInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const validation = validateUpdatePatch(patch);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.reason },
      { status: 400 },
    );
  }

  let updated;
  try {
    updated = await updateNote({ tenantId, noteId: id, patch });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "update_failed";
    return NextResponse.json(
      { ok: false, error: "update_failed", detail },
      { status: 500 },
    );
  }
  if (!updated) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // Re-sync if a body/private change re-queued the note. The repository
  // already flipped sync_status to 'pending' for those changes; pattern-
  // only edits are Mallin-side metadata and don't trigger CRM I/O.
  const synced =
    updated.sync_status === "pending" ? await syncNote(updated) : updated;

  return NextResponse.json({ ok: true, note: synced });
}

function validateUpdatePatch(
  patch: UpdateRepNoteInput,
): { ok: true } | { ok: false; reason: string } {
  if (
    patch.body === undefined &&
    patch.is_pattern === undefined &&
    patch.is_private === undefined
  ) {
    return { ok: false, reason: "no fields to update" };
  }
  if (patch.body !== undefined) {
    if (typeof patch.body !== "string" || patch.body.trim().length === 0) {
      return { ok: false, reason: "body must be a non-empty string" };
    }
    if (patch.body.length > 8000) {
      return { ok: false, reason: "body too long (max 8000)" };
    }
  }
  return { ok: true };
}

// ─── DELETE /api/notes/[id] ───────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated" },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "missing_id" },
      { status: 400 },
    );
  }

  const tenantId = await resolveTenantIdForNote(id);
  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // Pull the note first so we can include any context the cockpit
  // wants in the response (e.g. external_activity_id so it can show
  // "deleted from Mallin; CRM record kept" with a link).
  const existing = await getNoteById(tenantId, id);
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  try {
    const ok = await deleteNote(tenantId, id);
    return NextResponse.json({
      ok,
      crm_record_kept: !!existing.external_activity_id,
      external_activity_id: existing.external_activity_id,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "delete_failed";
    return NextResponse.json(
      { ok: false, error: "delete_failed", detail },
      { status: 500 },
    );
  }
}
