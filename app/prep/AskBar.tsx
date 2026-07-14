"use client";

/**
 * Coach AskBar — the "what should I do about X?" surface.
 *
 * Sits below the brief and lets the rep ask a question. Streams an
 * answer from /api/coach in real time. Multi-turn history kept in
 * component state (not persisted) so the rep can iterate within a
 * session.
 *
 * Design rationale:
 *  - The coach is a *crutch* for next-step decisions, not a research
 *    tool. Keep responses short. Don't show a thread that scrolls
 *    forever — show the latest exchange + a clear "Reset" affordance.
 *  - Streamed tokens land in real time so the rep sees the agent
 *    thinking. Idle state explains what to ask, with example prompts
 *    seeded from the AE expectations + governance layers.
 */

import { useEffect, useRef, useState } from "react";
import s from "./askbar.module.css";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Render inline markdown for coach output. Scope intentionally narrow:
 *   - **bold** → <strong>bold</strong>
 *   - everything else passes through as text
 * Newlines are preserved by .turnBody's `white-space: pre-wrap`, so we
 * don't need paragraph handling here. Streaming-safe: an unmatched
 * trailing `**` (close pair hasn't arrived yet) is left as literal,
 * and re-parses correctly on the next render once the close lands.
 *
 * Coach output occasionally includes other markdown (italics, lists)
 * but bold is what materially affects scanability — bold inside a
 * paragraph is hierarchy. Add other styles if/when the coach starts
 * leaning on them.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  const regex = /\*\*([^*]+?)\*\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      out.push(text.slice(lastIdx, match.index));
    }
    out.push(<strong key={`b-${key++}`}>{match[1]}</strong>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    out.push(text.slice(lastIdx));
  }
  return out;
}

export interface AskBarProps {
  /** UUID dealId; required to scope coach context to the current brief. */
  dealId: string | null;
}

/**
 * Context the AskBar may receive from another cockpit surface via the
 * URL-hash protocol. Surfaces a visible badge in the panel header so
 * the rep knows "I came from CRM update · Champion" was the trigger.
 */
type SurfaceContext = {
  surface: "email" | "crm_update" | "critical_risk";
  label?: string;
};

const SURFACE_DISPLAY: Record<SurfaceContext["surface"], string> = {
  email: "Email draft",
  crm_update: "CRM update",
  critical_risk: "Critical risk",
};

export default function AskBar({ dealId }: AskBarProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surfaceContext, setSurfaceContext] = useState<SurfaceContext | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  // ── Context-awareness via URL hash protocol ───────────────────────────────
  // Other cockpit surfaces (EmailComposer, SuggestedUpdates,
  // CriticalRisksBlock) can hand the rep off to AskBar with a pre-filled
  // prompt by navigating to:
  //
  //   #cockpit-ask?q=<encoded-prompt>                  — just prefill input
  //   #cockpit-ask?q=<encoded-prompt>&auto=1           — prefill + submit
  //   #cockpit-ask?q=...&surface=email                 — also show badge
  //   #cockpit-ask?q=...&surface=crm_update&label=Champion
  //
  // The hash listener runs both on mount (deep-link case) and on every
  // hashchange (in-page click case). After consuming, the hash is cleared
  // so subsequent clicks on the same surface always re-fire.
  useEffect(() => {
    function consumeHash() {
      if (typeof window === "undefined") return;
      const raw = window.location.hash;
      if (!raw.startsWith("#cockpit-ask")) return;
      const qsStart = raw.indexOf("?");
      if (qsStart === -1) {
        // Plain anchor jump without params — open the panel, nothing else.
        setOpen(true);
        return;
      }
      const params = new URLSearchParams(raw.slice(qsStart + 1));
      const q = params.get("q");
      const auto = params.get("auto") === "1";
      const surface = params.get("surface");
      const label = params.get("label") ?? undefined;

      if (
        surface === "email" ||
        surface === "crm_update" ||
        surface === "critical_risk"
      ) {
        setSurfaceContext({ surface, label });
      }

      if (!q) {
        setOpen(true);
        return;
      }
      setOpen(true);
      setDraft(q);
      // Clear the hash so the same prompt can be re-fired by the same surface.
      // Preserve the bare #cockpit-ask anchor so back-button works.
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#cockpit-ask`);
      if (auto) {
        // Defer submit one tick so React commits the draft state first.
        setTimeout(() => {
          const form = document.querySelector(`form.${s.form}`);
          if (form instanceof HTMLFormElement) {
            form.requestSubmit();
          }
        }, 0);
      }
    }
    consumeHash();
    window.addEventListener("hashchange", consumeHash);
    return () => window.removeEventListener("hashchange", consumeHash);
  }, []);

  // The latest assistant turn is what we stream into. We mutate via setTurns
  // by replacing the last element.
  function appendToken(text: string) {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      const updated: Turn = { ...last, content: last.content + text };
      return [...prev.slice(0, -1), updated];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || streaming) return;
    if (!dealId) {
      setError("This page isn't connected to a deal — coach unavailable.");
      return;
    }
    setError(null);

    const question = draft.trim();
    setDraft("");

    // Optimistic: push the user turn + an empty assistant turn we'll fill.
    const baseTurns = [...turns, { role: "user" as const, content: question }];
    setTurns([...baseTurns, { role: "assistant" as const, content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          question,
          // Send only PRIOR history (not the just-pushed empty assistant turn).
          history: turns.filter((t) => t.content.trim().length > 0),
          // Surface context (when AskBar was opened via a cockpit "💡"
          // button). Lets the coach prompt prepend a "# COACH CONTEXT"
          // section so the model knows where the rep is coming from.
          ...(surfaceContext ? { context: surfaceContext } : {}),
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        let message = `coach failed (${resp.status})`;
        try {
          const parsed = JSON.parse(errBody) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {}
        setError(message);
        // Remove the empty assistant turn we optimistically added.
        setTurns(baseTurns);
        setStreaming(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        setError("no response stream");
        setStreaming(false);
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames — split on blank lines.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          // Preserve internal whitespace — only strip the trailing
          // newline that separates frames. SSE spec: one optional space
          // after "data:". Strip exactly that one space, never more.
          // .trim()/.trimStart() here was eating the leading space on
          // tokens like " has" → rendering as "demohas" run-on words.
          const line = frame.replace(/[\r\n]+$/, "");
          if (!line.startsWith("data:")) continue;
          const afterColon = line.slice(5);
          const payload = afterColon.startsWith(" ")
            ? afterColon.slice(1)
            : afterColon;
          if (payload === "[DONE]") {
            setStreaming(false);
            return;
          }
          if (payload.startsWith("[ERROR]")) {
            setError(payload.slice("[ERROR]".length).trim());
            setStreaming(false);
            return;
          }
          // Decode the encoded newlines we put on the wire.
          appendToken(payload.replace(/\\n/g, "\n"));
        }
      }
      setStreaming(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStreaming(false);
        return;
      }
      setError((err as Error).message);
      setStreaming(false);
    }
  }

  function reset() {
    if (streaming) {
      abortRef.current?.abort();
    }
    setTurns([]);
    setError(null);
    setStreaming(false);
    setDraft("");
    setSurfaceContext(null);
  }

  // Show the latest exchange. If the most recent turn is the streaming
  // assistant reply, show it together with the question that triggered it.
  const visibleTurns = turns.slice(-4);

  if (!open && turns.length === 0) {
    // Collapsed idle state — looks like the old static AskBar but is now
    // a button. Click expands the panel and focuses the input.
    return (
      <button
        type="button"
        className={s.askbarTrigger}
        onClick={() => setOpen(true)}
      >
        <span className={s.askLabel}>Coach</span>
        <span className={s.askPlaceholder}>
          Ask about this deal — &ldquo;What should I do about Nadia?&rdquo;
          · &ldquo;Is the Power Map gap a problem?&rdquo;
        </span>
        <span className={s.askEnter}>↵</span>
      </button>
    );
  }

  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <span className={s.panelTitle}>Coach</span>
        {surfaceContext ? (
          <span className={s.surfaceBadge} aria-label="Coach context">
            <span className={s.surfaceBadgeLabel}>Coach context:</span>{" "}
            {SURFACE_DISPLAY[surfaceContext.surface]}
            {surfaceContext.label ? ` · ${surfaceContext.label}` : ""}
          </span>
        ) : (
          <span className={s.panelHint}>
            Aware of methodology, governance, and your team&apos;s AE
            expectations.
          </span>
        )}
        {(turns.length > 0 || streaming) && (
          <button type="button" className={s.resetBtn} onClick={reset}>
            Reset
          </button>
        )}
      </div>

      {visibleTurns.length > 0 && (
        <div className={s.thread}>
          {visibleTurns.map((turn, i) => (
            <div
              key={i}
              className={turn.role === "user" ? s.turnUser : s.turnAssistant}
            >
              <div className={s.turnRole}>
                {turn.role === "user" ? "You" : "Coach"}
              </div>
              <div className={s.turnBody}>
                {turn.content ? (
                  renderInlineMarkdown(turn.content)
                ) : (
                  <span className={s.streamingDot}>thinking…</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className={s.errorBox}>{error}</div>}

      <form onSubmit={submit} className={s.form}>
        <textarea
          className={s.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(e as unknown as React.FormEvent);
            }
          }}
          placeholder={
            streaming
              ? "streaming response…"
              : turns.length === 0
                ? "What should I do about… ?"
                : "Follow up…"
          }
          rows={2}
          disabled={streaming}
          autoFocus
        />
        <button
          type="submit"
          className={s.submitBtn}
          disabled={streaming || !draft.trim()}
        >
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
