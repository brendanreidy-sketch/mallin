"use client";

import { useState } from "react";

/**
 * One-tap brief feedback (👍/👎 + optional why). The only direct read on
 * whether the output earns the rep's trust. Sits at the end of the brief.
 */
const ck = (v: string) => `var(${v})`;

export default function BriefFeedback({ opportunityId }: { opportunityId: string }) {
  const [done, setDone] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  async function send(rating: "up" | "down", reasonText?: string) {
    try {
      await fetch("/api/brief-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, rating, reason: reasonText }),
      });
    } catch {
      // best-effort — never surface a feedback error to the rep
    }
  }

  if (done) {
    return (
      <div style={wrap}>
        <span style={{ color: ck("--ck-good"), fontWeight: 600, fontSize: 13.5 }}>
          Thanks — noted. ✓
        </span>
      </div>
    );
  }

  return (
    <div style={wrap}>
      {!showReason ? (
        <>
          <span style={{ color: ck("--ck-ink-3"), fontSize: 13.5, marginRight: 4 }}>
            Was this brief useful?
          </span>
          <button
            type="button"
            style={btn}
            onClick={() => {
              void send("up");
              setDone(true);
            }}
          >
            👍 Yes
          </button>
          <button type="button" style={btn} onClick={() => setShowReason(true)}>
            👎 Not really
          </button>
        </>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", maxWidth: 480 }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What was off? (optional)"
            style={input}
            autoFocus
          />
          <button
            type="button"
            style={btnSolid}
            onClick={() => {
              void send("down", reason.trim() || undefined);
              setDone(true);
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "16px 22px",
  borderTop: "0.5px solid var(--ck-rule)",
  marginTop: 8,
};
const btn: React.CSSProperties = {
  padding: "7px 13px",
  fontSize: 13,
  fontWeight: 600,
  color: ck("--ck-ink-2"),
  background: "transparent",
  border: `1px solid ${ck("--ck-rule-2")}`,
  borderRadius: 7,
  cursor: "pointer",
};
const btnSolid: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  color: ck("--ck-paper"),
  background: ck("--ck-ink"),
  border: `1px solid ${ck("--ck-ink")}`,
  borderRadius: 7,
  cursor: "pointer",
};
const input: React.CSSProperties = {
  flex: 1,
  padding: "8px 11px",
  fontSize: 13.5,
  color: ck("--ck-ink"),
  background: ck("--ck-paper"),
  border: `1px solid ${ck("--ck-rule-2")}`,
  borderRadius: 7,
  outline: "none",
  fontFamily: "inherit",
};
