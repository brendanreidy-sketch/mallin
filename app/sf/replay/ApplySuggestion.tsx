"use client";

/**
 * Single-field "Apply" button for a suggest-tier card.
 *
 * Posts to /api/sf/apply-suggestion. Shows three states:
 *   - idle    : "Apply"
 *   - busy    : "Applying…"
 *   - applied : "✓ Applied · audit <id>"
 *   - error   : red error message + "Try again"
 *
 * The button is the rep's explicit click — we never write a suggest
 * field without it.
 */

import { useState } from "react";

interface Props {
  dealId: string;
  sfOppId: string;
  field: string;
  value: string | number | boolean | null;
  callSource: string;
  evidence?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "applied"; auditId: string }
  | { kind: "error"; message: string };

export default function ApplySuggestion(props: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleClick() {
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/sf/apply-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: props.dealId,
          sfOppId: props.sfOppId,
          field: props.field,
          value: props.value,
          callSource: props.callSource,
          evidence: props.evidence,
        }),
      });
      const json = await res.json();
      if (json.ok && (json.status === "success" || json.status === "partial")) {
        setState({
          kind: "applied",
          auditId: json.audit_id ?? "(no audit id)",
        });
        return;
      }
      // Friendly error mapping
      let message = json.message || `HTTP ${res.status}`;
      if (json.status === "rejected_pre_flight") {
        if (json.status_detail === "readonly")
          message = "Refused: readonly field. Edit in Salesforce directly.";
        else if (json.status_detail === "system_managed")
          message =
            "Refused: SF system-managed field (computed by Salesforce, not writable).";
        else if (json.status_detail === "no_active_link")
          message = "No confirmed link between this deal and Salesforce.";
      }
      // SF errors often look like "No such column 'X'" — handle gracefully
      if (
        json.field_outcomes?.[0]?.error?.toLowerCase().includes("no such column")
      ) {
        message = `Field "${props.field}" doesn't exist in this Salesforce org. (Will work when wired to Northwind's real SF.)`;
      }
      setState({ kind: "error", message });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  if (state.kind === "applied") {
    return (
      <span style={appliedStyle}>
        ✓ Applied
        <span style={auditStyle}>· audit {state.auditId.slice(0, 8)}…</span>
      </span>
    );
  }

  return (
    <span style={containerStyle}>
      <button
        onClick={handleClick}
        disabled={state.kind === "busy"}
        style={buttonStyle(state.kind)}
      >
        {state.kind === "busy" ? "Applying…" : "Apply"}
      </button>
      {state.kind === "error" ? (
        <span style={errorStyle}>{state.message}</span>
      ) : null}
    </span>
  );
}

const containerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  marginTop: 4,
};

const buttonStyle = (kind: State["kind"]): React.CSSProperties => ({
  background: kind === "busy" ? "#cdcdcd" : "#0176d3",
  color: "white",
  border: "none",
  padding: "5px 14px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  cursor: kind === "busy" ? "not-allowed" : "pointer",
  fontFamily: "inherit",
});

const appliedStyle: React.CSSProperties = {
  color: "#2e7d4f",
  fontSize: 11,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginTop: 4,
};

const auditStyle: React.CSSProperties = {
  color: "#706e6b",
  fontSize: 10,
  fontWeight: 400,
  fontFamily: "ui-monospace, monospace",
};

const errorStyle: React.CSSProperties = {
  color: "#b3261e",
  fontSize: 11,
  fontStyle: "italic",
  maxWidth: 420,
  lineHeight: 1.4,
};
