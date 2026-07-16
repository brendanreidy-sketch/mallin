"use client";

/**
 * AskPanel — the interactive client for Ask Mallín. Streams answers from
 * /api/ask (pipeline-level), mirroring the per-deal AskBar's SSE handling.
 * Multi-turn; grounded in the rep's real deals server-side.
 */

import { useState } from "react";
import s from "./surfaces.module.css";

type Turn = { role: "user" | "assistant"; content: string };

export default function AskPanel({ starters }: { starters: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(qRaw: string) {
    const q = qRaw.trim();
    if (!q || streaming) return;
    setError(null);
    const history = turns;
    setTurns((t) => [
      ...t,
      { role: "user", content: q },
      { role: "assistant", content: "" },
    ]);
    setDraft("");
    setStreaming(true);
    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!resp.ok || !resp.body) {
        setError("Couldn't reach Mallín. Try again.");
        setStreaming(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "");
          if (line === "[DONE]") continue;
          if (line.startsWith("[ERROR]")) {
            setError(line.slice(7).trim() || "stream error");
            continue;
          }
          const text = line.replace(/\\n/g, "\n");
          setTurns((t) => {
            const copy = [...t];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: last.content + text };
            }
            return copy;
          });
        }
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div>
      {turns.length === 0 ? (
        <div className={s.chips} style={{ marginBottom: 24 }}>
          {starters.map((q) => (
            <button key={q} className={s.chip2} onClick={() => ask(q)} type="button">
              {q} ↗
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div className={s.qrow} key={i}>
                <span className={s.qav}>You</span>
                <span className={s.q}>{t.content}</span>
              </div>
            ) : (
              <div className={s.arow} key={i} style={{ marginBottom: 18 }}>
                <span className={s.aav}>M</span>
                <div style={{ flex: 1 }}>
                  <p className={s.aline} style={{ whiteSpace: "pre-wrap" }}>
                    {t.content || (streaming ? "…" : "")}
                  </p>
                </div>
              </div>
            ),
          )}
        </div>
      )}
      {error && (
        <p style={{ color: "var(--ck-crit)", fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className={s.askbar}
        style={{ marginTop: 8 }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Mallín anything about your pipeline…"
          disabled={streaming}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            outline: "none",
            color: "var(--ck-ink)",
            fontSize: 14,
            padding: "7px 0",
          }}
        />
        <button
          type="submit"
          disabled={streaming}
          className={s.chip2}
          style={{ borderRadius: 8 }}
        >
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
