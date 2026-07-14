"use client";

import { useEffect, useState } from "react";

interface Pending {
  id: string;
  conversation_id: string;
  tool: string;
  input: Record<string, unknown>;
  result: string;
  created_at: string;
}

const CK = { ink: "#1a2230", sub: "#6b7689", line: "#dcd6ca", card: "#fff", paper: "#f4f1ea" };

export default function ApprovalsInbox() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/sdr/approvals");
    const d = await r.json();
    setPending(d.pending ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, decision: "approve" | "deny") {
    setBusy(id);
    setMsg("");
    try {
      const r = await fetch("/api/sdr/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: id, decision }),
      });
      const d = await r.json();
      if (r.ok) {
        setMsg(decision === "approve" ? `Approved — ${d.result ?? "done"}` : "Denied.");
        setPending((p) => (p ?? []).filter((x) => x.id !== id));
      } else {
        setMsg(d.error ?? "Failed");
      }
    } finally {
      setBusy(null);
    }
  }

  if (pending === null) return <p style={{ color: CK.sub, fontSize: 14 }}>Loading…</p>;
  if (pending.length === 0)
    return (
      <p style={{ color: CK.sub, fontSize: 14 }}>
        Nothing waiting. Actions your agent queues for approval show up here.
      </p>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {msg && <p style={{ fontSize: 13, color: "#2f7a4f", margin: 0 }}>{msg}</p>}
      {pending.map((a) => (
        <div
          key={a.id}
          style={{
            background: CK.card,
            border: `0.5px solid ${CK.line}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: CK.ink }}>{a.tool}</span>
            <span style={{ fontSize: 12, color: CK.sub }}>{new Date(a.created_at).toLocaleString()}</span>
          </div>
          <div style={{ fontSize: 13, color: "#4a5568", lineHeight: 1.5, marginBottom: 12 }}>
            {a.tool === "hand_off"
              ? String(a.input.lead_summary ?? a.result)
              : a.tool === "send_resource"
                ? `Send resource: ${String(a.input.resource_id ?? "")}`
                : a.result}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => decide(a.id, "approve")}
              disabled={busy === a.id}
              style={{
                background: CK.ink,
                color: CK.paper,
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {busy === a.id ? "…" : "Approve"}
            </button>
            <button
              onClick={() => decide(a.id, "deny")}
              disabled={busy === a.id}
              style={{
                background: "none",
                color: "#b4453a",
                border: `0.5px solid ${CK.line}`,
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
