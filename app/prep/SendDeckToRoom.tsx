"use client";

/**
 * SendDeckToRoom — governed "send the deck to the meeting attendees."
 *
 * Revealed from GenerateDeckButton once a deck exists. The rep confirms
 * recipients and an editable message carrying the deck link, then queues one
 * email_draft per recipient into the action queue. DRAFTS-ONLY (2026-07-18):
 * on approval Mallín creates a draft per recipient in the rep's Gmail Drafts —
 * it never sends. The rep sends from their own inbox. Reuses the existing
 * enqueue rails (same shape as EmailComposer's handleQueue).
 *
 * Recipients: when the deal substrate has known buyer-side attendee emails, we
 * pre-fill them (via the `recipients` prop, resolved with
 * lib/deck/resolveDeckRecipients — buyer-side ONLY). Otherwise we start with a
 * blank row for the rep to fill in. Hard rule: this surface NEVER addresses the
 * rep's own inbox. Any rep-side address (from repEmails) is stripped before
 * queueing, so a deck can't be "sent" to the person sending it.
 */

import { useState, type CSSProperties } from "react";

const ACCENT = "#7aa8d8";
const INK = "#1a2230";
const INK3 = "#6b7689";
const RULE = "rgba(122,168,216,0.4)";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface Recipient {
  name: string;
  email: string;
}

const fieldStyle: CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  color: INK,
  background: "#faf7f0",
  border: `1px solid ${RULE}`,
  borderRadius: 7,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export default function SendDeckToRoom({
  dealId,
  deckUrl,
  gmailConnected = false,
  recipients: prefill = [],
  repEmails = [],
}: {
  dealId: string;
  deckUrl: string;
  gmailConnected?: boolean;
  /** Buyer-side attendees pre-resolved by resolveDeckRecipients (never the
   *  rep's own address). Empty when no buyer email is known. */
  recipients?: Recipient[];
  /** Rep-side addresses to strip defensively before queueing. */
  repEmails?: string[];
}) {
  const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${deckUrl}` : deckUrl;
  const blocked = new Set(repEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  // Pre-fill buyer-side attendees when known; otherwise a blank row. Rep-side
  // addresses are never seeded here.
  const seededRecipients = prefill.filter((r) => !blocked.has(r.email.trim().toLowerCase()));
  const [recipients, setRecipients] = useState<Recipient[]>(
    seededRecipients.length > 0 ? seededRecipients : [{ name: "", email: "" }],
  );
  const [subject, setSubject] = useState("The deck from our conversation");
  const [message, setMessage] = useState(
    `Great connecting today — here's the deck we walked through:\n\n${fullUrl}\n\nHappy to answer any questions.`,
  );
  const [status, setStatus] = useState<"idle" | "queueing" | "done" | "error">("idle");
  const [queued, setQueued] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Valid = a real email that is NOT the rep's own / a seller-side address.
  // The block guards against a deck ever being addressed to its sender.
  const valid = recipients.filter(
    (r) =>
      /.+@.+\..+/.test(r.email.trim()) &&
      !blocked.has(r.email.trim().toLowerCase()),
  );

  function update(i: number, field: keyof Recipient, v: string) {
    setRecipients((rs) => rs.map((r, k) => (k === i ? { ...r, [field]: v } : r)));
  }

  async function queueAll() {
    if (valid.length === 0) return;
    setStatus("queueing");
    setError(null);
    try {
      for (const r of valid) {
        const greeting = r.name.trim() ? `Hi ${r.name.trim().split(" ")[0]},\n\n` : "";
        const bodyText = greeting + message;
        const res = await fetch("/api/queue/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opportunity_id: dealId,
            payload: {
              type: "email_draft",
              to: r.email.trim(),
              subject,
              body_text: bodyText,
              body_html: bodyText.replace(/\n/g, "<br>"),
            },
            rationale: "Deck draft to meeting attendee — drafted by Mallín, pending approval",
            source_surface: "email_composer",
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
        if (!json.ok) throw new Error(json.detail || json.error || "queue failed");
      }
      setQueued(valid.length);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "queue failed");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div style={{ marginTop: 10, fontSize: 13, color: INK3, fontFamily: MONO }}>
        ✓ {queued} draft{queued === 1 ? "" : "s"} queued — approve them in your action queue to create drafts in your Gmail, then send from your inbox.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, padding: "16px 16px 14px", border: `1px solid ${RULE}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, fontFamily: MONO, letterSpacing: "0.04em", marginBottom: 10 }}>
        SEND DECK TO THE ROOM
      </div>

      {!gmailConnected && (
        <div
          style={{ marginBottom: 12, padding: "9px 11px", background: "#fbf3e6", border: "1px solid #e3d3ad", borderRadius: 7, fontSize: 12.5, color: "#8a6d1f", lineHeight: 1.45, fontFamily: MONO }}
        >
          Creating drafts in your Gmail needs a one-time setup — reach out to your Mallín
          contact to turn it on. You can still queue these now; they&apos;ll become drafts
          once you&apos;re connected.
        </div>
      )}

      {recipients.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...fieldStyle, flex: "0 0 34%" }}
            value={r.name}
            onChange={(e) => update(i, "name", e.target.value)}
            placeholder="Name (optional)"
          />
          <input
            style={{ ...fieldStyle, flex: 1 }}
            type="email"
            value={r.email}
            onChange={(e) => update(i, "email", e.target.value)}
            placeholder="email@company.com"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRecipients((rs) => [...rs, { name: "", email: "" }])}
        style={{ background: "none", border: "none", color: ACCENT, fontSize: 12.5, cursor: "pointer", fontFamily: MONO, padding: "2px 0 10px" }}
      >
        + add attendee
      </button>

      <input
        style={{ ...fieldStyle, width: "100%", marginBottom: 8 }}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
      />
      <textarea
        style={{ ...fieldStyle, width: "100%", minHeight: 96, resize: "vertical", lineHeight: 1.5 }}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {error && <p style={{ color: "#c25a4a", fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={queueAll}
          disabled={valid.length === 0 || status === "queueing"}
          style={{
            color: valid.length ? "#f4f1ea" : "#9aa3b3",
            background: valid.length ? INK : "#e7e2d6",
            border: "none",
            borderRadius: 7,
            padding: "9px 14px",
            fontSize: 13,
            fontFamily: MONO,
            cursor: valid.length ? "pointer" : "default",
          }}
        >
          {status === "queueing" ? "Queueing…" : `Queue ${valid.length || ""} for approval →`}
        </button>
        <span style={{ fontSize: 12, color: INK3, fontFamily: MONO }}>
          Nothing sends until you approve it in the action queue.
        </span>
      </div>
    </div>
  );
}
