"use client";

/**
 * RiskQueueActions — tiny client component embedded inside the
 * server-rendered CriticalRisksBlock so each risk can queue an action.
 *
 * One button for now: "📋 Queue escalation" — enqueues a
 * manager_escalate action with the risk title as the reason. Renders
 * a small status banner after click.
 *
 * Risk ack (typed "what I did about this") is a v2 — the action_type
 * + executor exist in lib/action-queue, but the UI needs a textarea
 * + submit flow that's heavier than this button. Add when there's
 * signal reps want it.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./riskQueueActions.module.css";

export interface RiskQueueActionsProps {
  riskId: string;
  riskTitle: string;
  riskSeverity: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "queueing" }
  | { kind: "queued" }
  | { kind: "error"; message: string };

export default function RiskQueueActions({
  riskId,
  riskTitle,
  riskSeverity,
}: RiskQueueActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function queueEscalation() {
    setStatus({ kind: "queueing" });
    try {
      const res = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            type: "manager_escalate",
            reason: `${riskSeverity.toUpperCase()} risk on deal: ${riskTitle}`,
          },
          rationale: `Risk needs manager visibility: ${riskTitle}`,
          source_surface: "risk_card",
          source_item_id: riskId,
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
      setStatus({ kind: "queued" });
      router.refresh();
    } catch (err: unknown) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "queue failed",
      });
    }
  }

  if (status.kind === "queued") {
    return (
      <span className={s.queuedBadge}>
        📋 Queued for manager escalation
      </span>
    );
  }
  if (status.kind === "error") {
    return (
      <span className={s.errorBadge}>
        ✗ {status.message}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={s.btn}
      onClick={queueEscalation}
      disabled={status.kind === "queueing"}
      title="Queue an escalation to your manager about this risk"
    >
      {status.kind === "queueing"
        ? "Queueing…"
        : "📋 Queue manager escalation"}
    </button>
  );
}
