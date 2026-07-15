"use client";

import { useState } from "react";

/**
 * "Mark closed" — captures how a deal ended + Mallín attribution, closing the
 * action→outcome loop. The two flags (risk materialized / move taken) are what
 * make realized ROI defensible later. Compact modal off the brief top bar.
 */
type Outcome = "won" | "lost" | "no_decision";
type Flag = boolean | null;

const ck = (v: string) => `var(${v})`;

export default function DealOutcome({ opportunityId }: { opportunityId: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [closedAt, setClosedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [riskMaterialized, setRiskMaterialized] = useState<Flag>(null);
  const [moveTaken, setMoveTaken] = useState<Flag>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!outcome || !notes.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/deal-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, outcome, closedAt, amount, riskMaterialized, moveTaken, notes: notes.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.message || data.error || "Couldn't save the outcome.");
      setSaved(true);
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const trigger: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginRight: 12,
    padding: "7px 13px",
    fontSize: 13,
    fontWeight: 600,
    color: saved ? ck("--ck-good") : ck("--ck-ink-2"),
    background: "transparent",
    border: `1px solid ${saved ? ck("--ck-good") : ck("--ck-rule-2")}`,
    borderRadius: 7,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <>
      <button type="button" style={trigger} onClick={() => setOpen(true)}>
        {saved ? "✓ Outcome logged" : "Mark closed"}
      </button>

      {open && (
        <div
          onClick={() => !busy && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,14,22,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              background: ck("--ck-surface"),
              border: `1px solid ${ck("--ck-rule-2")}`,
              borderRadius: 14,
              padding: "26px 24px",
              color: ck("--ck-ink"),
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              boxShadow: "0 24px 60px -20px rgba(0,0,0,0.4)",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>How did this deal end?</h2>
            <p style={{ fontSize: 13, color: ck("--ck-ink-3"), margin: "0 0 18px" }}>
              This closes the loop — it&apos;s how Mallín learns whether its read was right.
            </p>

            <Field label="Outcome">
              <Segmented
                options={[
                  ["won", "Won"],
                  ["lost", "Lost"],
                  ["no_decision", "No decision"],
                ]}
                value={outcome}
                onChange={(v) => setOutcome(v as Outcome)}
              />
            </Field>

            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Close date" flex>
                <input
                  type="date"
                  value={closedAt}
                  onChange={(e) => setClosedAt(e.target.value)}
                  style={input}
                />
              </Field>
              <Field label="Amount (optional)" flex>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 40000"
                  style={input}
                />
              </Field>
            </div>

            <Field label="Did the risk Mallín flagged actually happen?">
              <Segmented
                options={[["yes", "Yes"], ["no", "No"]]}
                value={riskMaterialized === null ? "" : riskMaterialized ? "yes" : "no"}
                onChange={(v) => setRiskMaterialized(v === "yes")}
              />
            </Field>
            <Field label="Did you run the move Mallín recommended?">
              <Segmented
                options={[["yes", "Yes"], ["no", "No"]]}
                value={moveTaken === null ? "" : moveTaken ? "yes" : "no"}
                onChange={(v) => setMoveTaken(v === "yes")}
              />
            </Field>

            <Field label="Why did it end this way? — required. This becomes coaching on every future deal.">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Name the behavior, not the label. e.g. 'Rep caved on term without approval, bashed the competitor to the CFO, and guaranteed an unbuilt feature — the economic buyer's trust broke and she reopened the competitor.'"
                style={{ ...input, minHeight: 76, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              />
            </Field>

            {err && <p style={{ color: ck("--ck-crit"), fontSize: 13, margin: "4px 0 0" }}>{err}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} style={btnGhost}>
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !outcome || !notes.trim()}
                style={{ ...btnSolid, opacity: busy || !outcome || !notes.trim() ? 0.5 : 1 }}
              >
                {busy ? "Saving…" : "Save outcome"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, flex, children }: { label: string; flex?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 14, flex: flex ? 1 : undefined }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: ck("--ck-ink-2"), marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map(([v, label]) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              borderRadius: 7,
              color: active ? ck("--ck-paper") : ck("--ck-ink-2"),
              background: active ? ck("--ck-ink") : "transparent",
              border: `1px solid ${active ? ck("--ck-ink") : ck("--ck-rule-2")}`,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 14,
  color: ck("--ck-ink"),
  background: ck("--ck-paper"),
  border: `1px solid ${ck("--ck-rule-2")}`,
  borderRadius: 8,
  outline: "none",
  fontFamily: "inherit",
};
const btnGhost: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 13.5,
  fontWeight: 600,
  color: ck("--ck-ink-2"),
  background: "transparent",
  border: `1px solid ${ck("--ck-rule-2")}`,
  borderRadius: 8,
  cursor: "pointer",
};
const btnSolid: React.CSSProperties = {
  padding: "9px 16px",
  fontSize: 13.5,
  fontWeight: 600,
  color: ck("--ck-paper"),
  background: ck("--ck-ink"),
  border: `1px solid ${ck("--ck-ink")}`,
  borderRadius: 8,
  cursor: "pointer",
};
