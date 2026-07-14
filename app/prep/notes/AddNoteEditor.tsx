/**
 * AddNoteEditor — the composer for writing a new rep note.
 *
 * Two states:
 *   1. Collapsed — a small "+ Add note" button. Default.
 *   2. Expanded — textarea + pattern/private toggles + Save/Cancel.
 *
 * On Save: calls onSave(input) which the parent (RepNotesPanel) wires
 * to lib/notes/client.createNote(). The parent handles the optimistic
 * insert + sync state update so this component stays presentation-only.
 *
 * Cmd/Ctrl+Enter saves. Esc cancels.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import s from "./repNotes.module.css";
import type { CreateRepNoteInput } from "@/lib/notes/types";

interface AddNoteEditorProps {
  opportunityId?: string | null;
  accountId?: string | null;
  sectionKey?: string | null;
  onSave: (input: CreateRepNoteInput) => Promise<{ ok: boolean; error?: string }>;
  /** Optional — when true, the composer mounts expanded (used after a
   *  failed submit so the rep doesn't lose their text). */
  defaultExpanded?: boolean;
}

export function AddNoteEditor({
  opportunityId,
  accountId,
  sectionKey,
  onSave,
  defaultExpanded = false,
}: AddNoteEditorProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [body, setBody] = useState("");
  const [isPattern, setIsPattern] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (expanded) {
      // Focus + autosize on mount/expand
      setTimeout(() => taRef.current?.focus(), 30);
    }
  }, [expanded]);

  function reset() {
    setBody("");
    setIsPattern(false);
    setIsPrivate(false);
    setError(null);
    setBusy(false);
  }

  function cancel() {
    reset();
    setExpanded(false);
  }

  async function save() {
    const trimmed = body.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setError(null);

    // Attach target — currently always 'deal' in v1. Account attachment
    // is a v2 extension (lib/crm.createNote doesn't support it yet).
    const input: CreateRepNoteInput = {
      body: trimmed,
      attach_to: "deal",
      opportunity_id: opportunityId ?? null,
      account_id: accountId ?? null,
      section_key: sectionKey ?? null,
      is_pattern: isPattern,
      is_private: isPrivate,
    };

    const result = await onSave(input);
    if (result.ok) {
      reset();
      setExpanded(false);
    } else {
      setBusy(false);
      setError(result.error ?? "Save failed");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        className={s.addNoteBtn}
        onClick={() => setExpanded(true)}
      >
        ＋ Add note
      </button>
    );
  }

  return (
    <div className={`${s.editor} ${s.editorFocused}`}>
      <textarea
        ref={taRef}
        className={s.editorTextarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type a note about this call. Your contribution syncs to the CRM under existing permissions — Mallín tracks the pattern, the CRM keeps the record."
        rows={3}
        maxLength={8000}
        disabled={busy}
      />
      <div className={s.editorFoot}>
        <div className={s.editorFootMeta}>
          <button
            type="button"
            className={`${s.toggle} ${s.togglePattern} ${isPattern ? s.active : ""}`}
            onClick={() => setIsPattern((v) => !v)}
            disabled={busy}
            title="Mallín-only tag. Surfaces this note on future similar deals in your tenant. Note still syncs to CRM as a normal deal note."
          >
            ⚐ <span>Cross-deal pattern</span>
          </button>
          <button
            type="button"
            className={`${s.toggle} ${s.togglePrivate} ${isPrivate ? s.active : ""}`}
            onClick={() => setIsPrivate((v) => !v)}
            disabled={busy}
            title="Maps to your CRM's native private-note flag where supported. Your CRM's permissions enforce it."
          >
            🔒 <span>Private in CRM</span>
          </button>
        </div>
        <div className={s.editorButtons}>
          <button
            type="button"
            className={s.editorBtn}
            onClick={cancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${s.editorBtn} ${s.editorBtnPrimary}`}
            onClick={save}
            disabled={busy || body.trim().length === 0}
          >
            {busy ? "Saving…" : "Save · ⌘↵"}
          </button>
        </div>
      </div>
      {error && (
        <div className={s.error}>
          <strong>Couldn&apos;t save</strong> — {error}
        </div>
      )}
    </div>
  );
}
