/**
 * RepNotesPanel — the working layer in the cockpit.
 *
 * Mounts inside AccountIntelligence below the brief content. Lists
 * existing notes (newest first), exposes the composer to add a new
 * one, handles inline updates + delete + retry.
 *
 * All CRM I/O routes through /api/notes which routes through
 * lib/crm.createNote at the neutrality boundary. This component never
 * sees a provider name except as a render-time label for the sync
 * chip.
 *
 * Doctrine references:
 *   memory:write_through_operating_layer.md
 *   memory:write_through_surface_contract.md
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./repNotes.module.css";
import { AddNoteEditor } from "./AddNoteEditor";
import { RepNoteCard } from "./RepNoteCard";
import {
  createNote as apiCreate,
  deleteNote as apiDelete,
  listNotesByDeal,
  updateNote as apiUpdate,
} from "@/lib/notes/client";
import type {
  CreateRepNoteInput,
  RepNote,
  UpdateRepNoteInput,
} from "@/lib/notes/types";

interface RepNotesPanelProps {
  opportunityId: string;
  accountId?: string | null;
  /** Provider label resolved server-side (e.g. "HubSpot", "Salesforce").
   *  Optional — when null, the sync chip says "Synced to CRM" generically. */
  providerLabel?: string | null;
}

export function RepNotesPanel({
  opportunityId,
  accountId,
  providerLabel,
}: RepNotesPanelProps) {
  const [notes, setNotes] = useState<RepNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load — list notes attached to this deal.
  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await listNotesByDeal(opportunityId);
      if (!alive) return;
      if (result.ok) {
        setNotes(result.data.notes);
      } else {
        setError(`Couldn't load notes: ${result.error}`);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [opportunityId]);

  // ── Note creation ────────────────────────────────────────────────────
  const handleCreate = useCallback(
    async (input: CreateRepNoteInput): Promise<{ ok: boolean; error?: string }> => {
      const result = await apiCreate(input);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      // Prepend so newest-first ordering matches the list query.
      setNotes((prev) => [result.data.note, ...prev]);
      return { ok: true };
    },
    [],
  );

  // ── Note update (toggles + retry) ────────────────────────────────────
  const handleUpdate = useCallback(
    async (
      noteId: string,
      patch: UpdateRepNoteInput,
    ): Promise<{ ok: boolean; error?: string }> => {
      const result = await apiUpdate(noteId, patch);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? result.data.note : n)),
      );
      return { ok: true };
    },
    [],
  );

  // ── Note delete ──────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (
      noteId: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const result = await apiDelete(noteId);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      return { ok: true };
    },
    [],
  );

  // ── Retry (re-queue a pending/failed note for sync) ──────────────────
  // We re-PATCH with the current body which flips sync_status back to
  // 'pending' server-side, triggering a fresh syncNote() call.
  const handleRetry = useCallback(
    async (noteId: string): Promise<void> => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      const result = await apiUpdate(noteId, { body: note.body });
      if (result.ok) {
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? result.data.note : n)),
        );
      }
    },
    [notes],
  );

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.label}>📝 Your notes on this deal</span>
        <span className={s.meta}>
          {notes.length === 0
            ? "Syncs to your CRM under existing permissions"
            : `${notes.length} note${notes.length === 1 ? "" : "s"} · syncs to CRM`}
        </span>
      </div>

      {error && (
        <div className={s.error}>
          <strong>Couldn&apos;t load</strong> — {error}
        </div>
      )}

      {loading ? null : notes.length === 0 ? (
        <p className={s.empty}>
          Anything you save here lands in your CRM as a note on this deal
          and stays in Mallín&apos;s memory for future briefs.{" "}
          <strong>The CRM is the system of record;</strong> Mallín is
          where you work.
        </p>
      ) : (
        <div className={s.list}>
          {notes.map((n) => (
            <RepNoteCard
              key={n.id}
              note={n}
              providerLabel={providerLabel ?? null}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}

      <AddNoteEditor
        opportunityId={opportunityId}
        accountId={accountId}
        sectionKey={null}
        onSave={handleCreate}
      />
    </div>
  );
}
