"use client";

/**
 * LiveCoach — the real-time in-call advisor surface.
 *
 * Replaces the static "Likely pushback" section. The rep, during or
 * right after a moment on the call, types what just happened (or what
 * they're stuck on). Mallín responds with:
 *   - One line of interpretation
 *   - ONE specific next move
 *   - Brief why
 *
 * v0 design choices (deliberate):
 *   - Text only (no audio capture yet). Audio capture is a separate
 *     2-week build gated on usage signal from this surface.
 *   - Local message state only (no DB persistence). Lost on reload.
 *     Tests whether the live-chat pattern is what reps reach for
 *     before we invest in persistence + audio.
 *   - Non-streaming (full response on submit). Streaming can come
 *     later if responses feel slow.
 *   - No proactive triggers. Pure reactive — rep posts, Mallín
 *     responds.
 *
 * See memory: stable_cognition_layer.md (manual + lightweight first,
 * automate only the part the signal demanded).
 */

import { useState, useRef, useEffect, type FormEvent } from "react";
import s from "./liveCoach.module.css";

interface Props {
  dealId: string;
  accountName?: string | null;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export default function LiveCoach({ dealId, accountName }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, pending]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Hydrate history from DB on mount. Survives reloads + survives
  // across sessions. If the user is anonymous (demo bypass), the
  // history endpoint returns an empty array — same shape as a
  // never-used coach. Errors are silent: the chat still works,
  // just starts fresh on hydration failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/live-coach/history?dealId=${encodeURIComponent(dealId)}`,
          { method: "GET" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as
          | { ok: true; turns: ChatTurn[] }
          | { ok: false; error: string };
        if (!cancelled && data.ok && data.turns.length > 0) {
          setHistory(
            data.turns.map((t) => ({ role: t.role, content: t.content })),
          );
        }
      } catch {
        // History hydration is best-effort. Silent fail.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setError(null);
    const newHistory: ChatTurn[] = [...history, { role: "user", content: text }];
    setHistory(newHistory);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/live-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          message: text,
          history,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; message: string }
        | { ok: false; error: string };
      if (!data.ok) {
        throw new Error(data.error || "Coach error");
      }
      setHistory([
        ...newHistory,
        { role: "assistant", content: data.message },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Standard chat behavior: Enter sends. Shift+Enter inserts a newline
    // for the rare multi-line input. Cmd/Ctrl+Enter still works too
    // (some reps muscle-memory'd into it from the previous version).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <section className={s.coach} aria-label="Live coach">
      {!open ? (
        <button
          type="button"
          className={s.toggleBtn}
          onClick={() => setOpen(true)}
        >
          <span className={s.toggleDot} aria-hidden="true" />
          Live coach
          <span className={s.toggleHint}>
            click during the call to get real-time guidance
          </span>
        </button>
      ) : (
        <div className={s.panel}>
          <header className={s.panelHead}>
            <div className={s.panelHeadLeft}>
              <span className={s.panelDot} aria-hidden="true" />
              <span className={s.panelTitle}>Live coach</span>
              {accountName && (
                <span className={s.panelAccount}>· {accountName}</span>
              )}
            </div>
            <button
              type="button"
              className={s.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close live coach"
            >
              ×
            </button>
          </header>

          <div className={s.chat} ref={scrollRef}>
            {history.length === 0 && (
              <div className={s.empty}>
                <p className={s.emptyPrompt}>
                  Tell me what just happened on the call — or what
                  you&apos;re stuck on.
                </p>
                <p className={s.emptyHint}>
                  Examples: <em>&ldquo;Kevin just asked about
                  pricing&rdquo;</em> · <em>&ldquo;They said they&apos;re
                  not evaluating right now&rdquo;</em> · <em>&ldquo;How
                  do I close out this call?&rdquo;</em>
                </p>
              </div>
            )}
            {history.map((turn, i) => (
              <div
                key={i}
                className={`${s.turn} ${
                  turn.role === "user" ? s.turnUser : s.turnAssistant
                }`}
              >
                {turn.role === "assistant" && (
                  <span className={s.turnLabel}>Mallín</span>
                )}
                <div className={s.turnText}>{turn.content}</div>
              </div>
            ))}
            {pending && (
              <div className={`${s.turn} ${s.turnAssistant}`}>
                <span className={s.turnLabel}>Mallín</span>
                <div className={s.turnPending}>
                  <span className={s.pendingDot} />
                  <span className={s.pendingDot} />
                  <span className={s.pendingDot} />
                </div>
              </div>
            )}
            {error && (
              <div className={s.error}>
                Error: {error}
              </div>
            )}
          </div>

          <form className={s.form} onSubmit={submit}>
            <textarea
              ref={inputRef}
              className={s.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What just happened on the call?"
              rows={2}
              maxLength={2000}
              disabled={pending}
            />
            <div className={s.formFoot}>
              <span className={s.formHint}>
                <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for newline
              </span>
              <button
                type="submit"
                className={s.submitBtn}
                disabled={!input.trim() || pending}
              >
                {pending ? "…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
