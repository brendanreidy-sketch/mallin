"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The embeddable chat. Self-contained (no app chrome) so it renders cleanly
 * inside the customer's site via an iframe. Talks to the public endpoint
 * /api/sdr/widget/chat, carrying the embed `key` (the tenant id) + the running
 * conversationId. Only the agent's reply comes back — never the triage/state.
 */
type Msg = { role: "prospect" | "agent"; content: string };

export default function WidgetChat({ widgetKey }: { widgetKey: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", content: "Hi — happy to help. What brings you in today?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMsgs((m) => [...m, { role: "prospect", content: text }]);
    setSending(true);
    try {
      const r = await fetch("/api/sdr/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: widgetKey, conversationId, message: text }),
      });
      const d = await r.json();
      if (r.ok) {
        setConversationId(d.conversationId);
        setMsgs((m) => [...m, { role: "agent", content: d.reply }]);
      } else {
        setMsgs((m) => [
          ...m,
          { role: "agent", content: "Sorry — something went wrong. Try again in a moment." },
        ]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "agent", content: "Sorry — connection issue. Try again." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#fff",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "prospect" ? "flex-end" : "flex-start",
              maxWidth: "82%",
              padding: "9px 13px",
              borderRadius: 14,
              fontSize: 14,
              lineHeight: 1.5,
              background: m.role === "prospect" ? "#1a2230" : "#f1efe9",
              color: m.role === "prospect" ? "#f4f1ea" : "#1a2230",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: "flex-start", fontSize: 13, color: "#9aa3b0", padding: "4px 6px" }}>
            …
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "0.5px solid #e4ddcf" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Type a message…"
          style={{
            flex: 1,
            padding: "10px 12px",
            fontSize: 14,
            border: "0.5px solid #dcd6ca",
            borderRadius: 10,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={send}
          disabled={sending}
          style={{
            background: "#1a2230",
            color: "#f4f1ea",
            border: "none",
            borderRadius: 10,
            padding: "0 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: sending ? "default" : "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
