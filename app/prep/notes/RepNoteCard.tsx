/**
 * RepNoteCard — single note displayed in the list.
 *
 * Shows: body (read-only in v1), pattern/private toggles, sync chip,
 * delete button. Toggles call onUpdate; delete calls onDelete.
 *
 * Inline body editing is deferred to v2 — for now, the rep deletes +
 * re-adds if they want to change a synced note's body. Keeps the v1
 * sync-state machine simple (one transition per write).
 */

"use client";

import { useState } from "react";
import s from "./repNotes.module.css";
import { SyncChip } from "./SyncChip";
import type { RepNote, UpdateRepNoteInput } from "@/lib/notes/types";

interface RepNoteCardProps {
  note: RepNote;
  providerLabel: string | null;
  onUpdate: (
    noteId: string,
    patch: UpdateRepNoteInput,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (
    noteId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onRetry: (noteId: string) => Promise<void>;
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RepNoteCard({
  note,
  providerLabel,
  onUpdate,
  onDelete,
  onRetry,
}: RepNoteCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePattern() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await onUpdate(note.id, { is_pattern: !note.is_pattern });
    if (!result.ok) setError(result.error ?? "Update failed");
    setBusy(false);
  }

  async function togglePrivate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await onUpdate(note.id, { is_private: !note.is_private });
    if (!result.ok) setError(result.error ?? "Update failed");
    setBusy(false);
  }

  async function remove() {
    if (busy) return;
    if (!confirm("Delete this note? The CRM record stays — only the Mallín row is removed.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onDelete(note.id);
    if (!result.ok) {
      setError(result.error ?? "Delete failed");
      setBusy(false);
    }
    // On success the parent removes the card from the list, so no
    // local state cleanup needed.
  }

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError(null);
    await onRetry(note.id);
    setBusy(false);
  }

  return (
    <div className={s.note}>
      <div className={s.noteHead}>
        <div className={s.noteHeadLeft}>
          <span>📝 Your note</span>
          <span className={s.noteAuthor}>
            · {fmtRelative(note.created_at)}
          </span>
        </div>
        <button
          type="button"
          className={s.noteDelete}
          onClick={remove}
          disabled={busy}
          aria-label="Delete this Mallín row (CRM record kept)"
          title="Delete the Mallín row · CRM record kept"
        >
          ×
        </button>
      </div>

      <p className={s.noteBody}>{note.body}</p>

      <div className={s.noteControls}>
        <button
          type="button"
          className={`${s.toggle} ${s.togglePattern} ${note.is_pattern ? s.active : ""}`}
          onClick={togglePattern}
          disabled={busy}
          title="Mallín-only tag — surfaces this note on future similar deals in your tenant. Note still syncs to CRM as a normal deal note."
        >
          ⚐ <span>Cross-deal pattern</span>
        </button>
        <button
          type="button"
          className={`${s.toggle} ${s.togglePrivate} ${note.is_private ? s.active : ""}`}
          onClick={togglePrivate}
          disabled={busy}
          title="Maps to your CRM's native private-note flag where supported."
        >
          🔒 <span>Private in CRM</span>
        </button>
        <SyncChip
          status={note.sync_status}
          providerLabel={providerLabel}
          retryCount={note.retry_count}
          failedReason={note.failed_reason}
          onRetry={note.sync_status === "failed" || note.sync_status === "pending" ? retry : undefined}
        />
      </div>

      {note.sync_status === "failed" && note.failed_reason && (
        <div className={s.syncDetail}>
          {note.failed_reason}
        </div>
      )}

      {error && (
        <div className={s.error}>
          <strong>Action failed</strong> — {error}
        </div>
      )}
    </div>
  );
}
