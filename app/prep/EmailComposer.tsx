"use client";

/**
 * EmailComposer — the cockpit's "send the follow-up" surface.
 *
 * Mallín pre-fills To / Subject / Body from the deal substrate. The
 * rep reviews + (optionally) edits + chooses:
 *
 *   - Send via Gmail   (primary — fires gmail.send immediately)
 *   - Save to Drafts   (secondary — drafts.create immediately)
 *   - Queue for batch  (NEW — adds to action_queue for batch approval)
 *   - Edit             (toggle — flips fields into <textarea> mode)
 *   - Rewrite with Mallín (hand off to AskBar with context)
 *
 * Voice-line displayed at all times: "Mallín never sends without your click."
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./emailComposer.module.css";

export interface EmailComposerProps {
  /** Pre-filled by the server-side draft generator. */
  initialDraft: {
    to: string;
    to_name?: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    attribution: string;
    confidence: number;
  };
  /** True when the current user has connected Gmail. Disables Send. */
  gmailConnected: boolean;
  /** Optional Gmail thread ID to reply in-thread. */
  threadId?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "saving" }
  | { kind: "queueing" }
  | { kind: "sent"; messageId?: string }
  | { kind: "saved"; draftId?: string }
  | { kind: "queued"; queueItemId?: string }
  | { kind: "error"; message: string };

export default function EmailComposer({
  initialDraft,
  gmailConnected,
  threadId,
}: EmailComposerProps) {
  const router = useRouter();
  const [to, setTo] = useState(initialDraft.to);
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.bodyText);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSend() {
    if (!gmailConnected) return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          bodyText: body,
          bodyHtml: bodyTextToHtml(body),
          threadId,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setStatus({
          kind: "error",
          message: json.detail || json.error || "send failed",
        });
        return;
      }
      setStatus({ kind: "sent", messageId: json.message_id });
    } catch (err: unknown) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  async function handleQueue() {
    setStatus({ kind: "queueing" });
    try {
      const res = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            type: "email_send",
            to,
            subject,
            body_text: body,
            body_html: bodyTextToHtml(body),
            thread_id: threadId,
          },
          rationale: `Voice-matched ${Math.round(initialDraft.confidence * 100)}% · drafted by Mallín`,
          source_surface: "email_composer",
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setStatus({
          kind: "error",
          message: json.detail || json.error || "queue failed",
        });
        return;
      }
      setStatus({ kind: "queued", queueItemId: json.item?.id });
      // Refresh server props so the ActionQueue panel re-renders with
      // the newly-enqueued item.
      router.refresh();
    } catch (err: unknown) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "queue failed",
      });
    }
  }

  async function handleSaveDraft() {
    if (!gmailConnected) return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/gmail/drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Bare minimum auth shim — the route reads x-user-id. The real
          // auth path is via Clerk on the route handler when the page
          // is rendered server-side. For now we let the route's own
          // auth() lookup handle this; we don't need to set the header.
        },
        body: JSON.stringify({
          to,
          subject,
          bodyText: body,
          bodyHtml: bodyTextToHtml(body),
          threadId,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setStatus({
          kind: "error",
          message: json.detail || json.error || "save failed",
        });
        return;
      }
      setStatus({ kind: "saved", draftId: json.draft?.id });
    } catch (err: unknown) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "save failed",
      });
    }
  }

  return (
    <section id="cockpit-email" className={s.composer} aria-label="Email composer">
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>SUGGESTED FOLLOW-UP</div>
          <h3 className={s.title}>Email draft</h3>
        </div>
        <div className={s.confidence} title="Mallín's confidence in this draft">
          {Math.round(initialDraft.confidence * 100)}% match
        </div>
      </header>

      <div className={s.fields}>
        {/* To */}
        <div className={s.field}>
          <label className={s.label}>To</label>
          {editing ? (
            <input
              className={s.input}
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          ) : (
            <div className={s.value}>
              {to || <span className={s.empty}>(no recipient — edit to add)</span>}
              {initialDraft.to_name ? (
                <span className={s.tag}>{initialDraft.to_name}</span>
              ) : null}
            </div>
          )}
        </div>

        {/* Subject */}
        <div className={s.field}>
          <label className={s.label}>Subject</label>
          {editing ? (
            <input
              className={s.input}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          ) : (
            <div className={s.value}>{subject}</div>
          )}
        </div>

        {/* Body */}
        <div className={s.field}>
          <label className={s.label}>Body</label>
          {editing ? (
            <textarea
              className={s.textarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
            />
          ) : (
            <pre className={s.bodyPreview}>{body}</pre>
          )}
        </div>
      </div>

      <div className={s.meta}>
        <span className={s.attribution}>{initialDraft.attribution}</span>
      </div>

      {/* Status banners */}
      {status.kind === "sent" ? (
        <div className={`${s.banner} ${s.bannerSuccess}`}>
          ✓ Sent. Message id: <code>{status.messageId ?? "unknown"}</code>
        </div>
      ) : null}
      {status.kind === "saved" ? (
        <div className={`${s.banner} ${s.bannerInfo}`}>
          ✓ Saved to Gmail Drafts. Open Gmail to review + send when ready.
        </div>
      ) : null}
      {status.kind === "queued" ? (
        <div className={`${s.banner} ${s.bannerWarn}`}>
          📋 Queued for batch approval. Review with other pending actions
          in the Action Queue above, then approve when ready.
        </div>
      ) : null}
      {status.kind === "error" ? (
        <div className={`${s.banner} ${s.bannerError}`}>
          ✗ {status.message}
        </div>
      ) : null}

      <div className={s.actions}>
        <button
          type="button"
          className={s.btnPrimary}
          onClick={handleSend}
          disabled={!gmailConnected || status.kind === "sending" || !to}
        >
          {status.kind === "sending" ? "Sending…" : "✉ Send via Gmail"}
        </button>
        <button
          type="button"
          className={s.btnSecondary}
          onClick={handleSaveDraft}
          disabled={!gmailConnected || status.kind === "saving" || !to}
        >
          {status.kind === "saving" ? "Saving…" : "💾 Save to Drafts"}
        </button>
        <button
          type="button"
          className={s.btnQueue}
          onClick={handleQueue}
          disabled={status.kind === "queueing" || !to}
          title="Queue for batch approval alongside other pending actions"
        >
          {status.kind === "queueing" ? "Queueing…" : "📋 Queue"}
        </button>
        <button
          type="button"
          className={s.btnTertiary}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Done editing" : "✏️ Edit"}
        </button>
        <button
          type="button"
          className={s.btnTertiary}
          onClick={() => askMallinAbout(subject, body, to)}
        >
          💡 Rewrite with Mallín
        </button>
        <span className={s.never}>
          Mallín never sends without your click
        </span>
      </div>

      {!gmailConnected ? (
        <div className={`${s.banner} ${s.bannerWarn}`}>
          Connect Gmail to send from this surface.{" "}
          <a className={s.link} href="/settings/integrations">
            Go to Settings → Integrations →
          </a>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Hand the rep off to AskBar with a prefilled "rewrite this draft" prompt.
 * Uses the URL-hash protocol that AskBar listens to (#cockpit-ask?q=...&auto=1).
 * Navigating to the hash both opens AskBar AND scrolls to it.
 */
function askMallinAbout(subject: string, body: string, to: string): void {
  // Keep the prompt compact — the coach has access to the deal context via
  // dealId; we just need to point it at THIS draft, not re-explain the deal.
  const prompt =
    `Rewrite this follow-up to ${to || "the champion"}. ` +
    `Subject: ${subject}\n\n${body.slice(0, 1200)}\n\n` +
    `Make it tighter and more action-oriented — but keep my voice.`;
  const params = new URLSearchParams({
    q: prompt,
    auto: "1",
    surface: "email",
  });
  const hash = `#cockpit-ask?${params.toString()}`;
  if (typeof window !== "undefined") {
    window.location.hash = hash;
  }
}

/**
 * Cheap text-to-HTML for the bodyText the user typed in the textarea.
 * Paragraphs separated by blank line; line breaks become <br>. Good
 * enough for follow-up emails; the full HTML rendering lives in the
 * server-side draft generator.
 */
function bodyTextToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
