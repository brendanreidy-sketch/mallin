"use client";

/**
 * SuggestedUpdates — Stage 1 Suggest cards on the cockpit /prep page.
 *
 * Cards rendered server-side from derived intelligence (Pass 4 + Pass 2
 * substrate). Rep interacts with four buttons per card:
 *
 *   ✓ Looks right  → POST /api/crm/apply-suggestion → writes via lib/crm
 *                    immediately (provider-routed by tenant.crm_provider)
 *   📋 Queue       → POST /api/queue/enqueue → add to action queue for
 *                    batch review later (instead of writing now)
 *   ✗ Looks wrong  → dismiss locally (optimistic; audit later)
 *   ✏️ Edit        → toggle the value to an inline input
 *   💡 Why?        → hand off to AskBar with context
 *
 * Forecast-critical fields are blocked by lib/crm.updateDealField.
 *
 * Both paths (immediate apply + queue) coexist intentionally — keep
 * velocity high for high-confidence single approvals while letting reps
 * batch lower-confidence items.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmSuggestion } from "@/lib/agents/derive-crm-suggestions";
import s from "./suggestedUpdates.module.css";

export interface SuggestedUpdatesProps {
  suggestions: CrmSuggestion[];
  tenantId: string;
  /** External CRM ID for the deal — passed to /api/crm/apply-suggestion. */
  dealRef: string;
  /** Provider name surfaced as a badge ("Salesforce" / "HubSpot"). */
  providerName: string;
}

type CardStatus =
  | { kind: "pending" }
  | { kind: "applying" }
  | { kind: "applied" }
  | { kind: "rejected" }
  | { kind: "editing" }
  | { kind: "error"; message: string };

type CardStatusWithQueued =
  | CardStatus
  | { kind: "queued"; queueItemId: string };

export default function SuggestedUpdates({
  suggestions,
  tenantId,
  dealRef,
  providerName,
}: SuggestedUpdatesProps) {
  const router = useRouter();
  // One status + edited-value entry per card.
  const [statuses, setStatuses] = useState<Record<string, CardStatusWithQueued>>(
    Object.fromEntries(suggestions.map((s) => [s.id, { kind: "pending" }])),
  );
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (suggestions.length === 0) {
    return (
      <section id="cockpit-crm" className={s.section} aria-label="CRM suggestions">
        <header className={s.head}>
          <div>
            <div className={s.eyebrow}>SUGGESTED CRM UPDATES</div>
            <h3 className={s.title}>No suggestions ready</h3>
          </div>
        </header>
        <p className={s.empty}>
          Mallín needs more substrate (calls processed, stakeholders
          identified) before it can suggest CRM updates. Process a call
          to generate suggestions.
        </p>
      </section>
    );
  }

  async function applyCard(c: CrmSuggestion, valueOverride?: string) {
    setStatuses((prev) => ({ ...prev, [c.id]: { kind: "applying" } }));
    try {
      const res = await fetch("/api/crm/apply-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          dealRef,
          field: c.field,
          value: valueOverride ?? c.value,
          rationale: c.rationale,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setStatuses((prev) => ({
          ...prev,
          [c.id]: {
            kind: "error",
            message: json.detail || json.error || "apply failed",
          },
        }));
        return;
      }
      setStatuses((prev) => ({ ...prev, [c.id]: { kind: "applied" } }));
    } catch (err: unknown) {
      setStatuses((prev) => ({
        ...prev,
        [c.id]: {
          kind: "error",
          message: err instanceof Error ? err.message : "apply failed",
        },
      }));
    }
  }

  function reject(c: CrmSuggestion) {
    setStatuses((prev) => ({ ...prev, [c.id]: { kind: "rejected" } }));
  }

  function startEdit(c: CrmSuggestion) {
    setEdits((prev) => ({ ...prev, [c.id]: c.value }));
    setStatuses((prev) => ({ ...prev, [c.id]: { kind: "editing" } }));
  }

  function cancelEdit(c: CrmSuggestion) {
    setStatuses((prev) => ({ ...prev, [c.id]: { kind: "pending" } }));
  }

  async function queueCard(c: CrmSuggestion, valueOverride?: string) {
    setStatuses((prev) => ({ ...prev, [c.id]: { kind: "applying" } }));
    try {
      const res = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity_id: dealRef,
          payload: {
            type: "crm_update",
            field: c.field,
            field_label: c.field_label,
            value: valueOverride ?? c.value,
            deal_ref: dealRef,
          },
          rationale: c.rationale,
          source_surface: "crm_suggestion",
          source_item_id: c.id,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setStatuses((prev) => ({
          ...prev,
          [c.id]: {
            kind: "error",
            message: json.detail || json.error || "queue failed",
          },
        }));
        return;
      }
      setStatuses((prev) => ({
        ...prev,
        [c.id]: { kind: "queued", queueItemId: json.item?.id ?? "" },
      }));
      // Refresh server props so the ActionQueue panel re-renders with the
      // newly-enqueued item.
      router.refresh();
    } catch (err: unknown) {
      setStatuses((prev) => ({
        ...prev,
        [c.id]: {
          kind: "error",
          message: err instanceof Error ? err.message : "queue failed",
        },
      }));
    }
  }

  /**
   * Hand the rep off to AskBar with a prefilled "explain this CRM update"
   * prompt. Uses the URL-hash protocol AskBar listens to. Includes
   * surface + label so AskBar shows "Coach context: CRM update · Champion".
   */
  function askAboutSuggestion(c: CrmSuggestion): void {
    const prompt =
      `Why does Mallín suggest writing "${c.value}" to ${c.field_label} ` +
      `(${c.field}) on this deal? What's the evidence underneath this and ` +
      `how confident should I be before clicking Looks right?`;
    const params = new URLSearchParams({
      q: prompt,
      auto: "1",
      surface: "crm_update",
      label: c.field_label,
    });
    const hash = `#cockpit-ask?${params.toString()}`;
    if (typeof window !== "undefined") {
      window.location.hash = hash;
    }
  }

  return (
    <section id="cockpit-crm" className={s.section} aria-label="CRM suggestions">
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>SUGGESTED CRM UPDATES</div>
          <h3 className={s.title}>
            {suggestions.length} captured from recent calls
          </h3>
        </div>
        <div className={s.providerBadge}>{providerName}</div>
      </header>

      <div className={s.list}>
        {suggestions.map((c) => {
          const status = statuses[c.id] ?? { kind: "pending" };
          return (
            <article
              key={c.id}
              className={`${s.card} ${
                status.kind === "applied"
                  ? s.cardApplied
                  : status.kind === "rejected"
                    ? s.cardRejected
                    : ""
              }`}
            >
              <div className={s.cardHead}>
                <span className={s.stageTag}>STAGE 1 · SUGGEST</span>
                <span className={s.confidence}>
                  {Math.round(c.confidence * 100)}% confidence
                </span>
              </div>

              <div className={s.fieldRow}>
                <code className={s.fieldName}>{c.field_label}</code>
                <span className={s.arrow}>→</span>
                {status.kind === "editing" ? (
                  <input
                    className={s.editInput}
                    value={edits[c.id] ?? ""}
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                  />
                ) : (
                  <span className={s.fieldValue}>{c.value}</span>
                )}
              </div>

              <p className={s.rationale}>{c.rationale}</p>
              <p className={s.capturedFrom}>{c.captured_from}</p>

              {status.kind === "applied" ? (
                <div className={s.bannerApplied}>
                  ✓ Applied to {providerName}
                </div>
              ) : status.kind === "rejected" ? (
                <div className={s.bannerRejected}>Dismissed</div>
              ) : status.kind === "queued" ? (
                <div className={s.bannerQueued}>
                  📋 Queued for batch review (see Action Queue above)
                </div>
              ) : status.kind === "error" ? (
                <div className={s.bannerError}>✗ {status.message}</div>
              ) : null}

              {status.kind === "pending" || status.kind === "error" ? (
                <div className={s.actions}>
                  <button
                    className={s.btnApply}
                    onClick={() => applyCard(c)}
                  >
                    ✓ Looks right
                  </button>
                  <button
                    className={s.btnQueue}
                    onClick={() => queueCard(c)}
                    title="Queue for batch approval instead of writing now"
                  >
                    📋 Queue
                  </button>
                  <button
                    className={s.btnReject}
                    onClick={() => reject(c)}
                  >
                    ✗ Looks wrong
                  </button>
                  <button
                    className={s.btnEdit}
                    onClick={() => startEdit(c)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className={s.btnAsk}
                    onClick={() => askAboutSuggestion(c)}
                    title="Ask Mallín to explain this suggestion"
                  >
                    💡 Why?
                  </button>
                </div>
              ) : null}

              {status.kind === "editing" ? (
                <div className={s.actions}>
                  <button
                    className={s.btnApply}
                    onClick={() => applyCard(c, edits[c.id])}
                  >
                    ✓ Save + apply
                  </button>
                  <button
                    className={s.btnEdit}
                    onClick={() => cancelEdit(c)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {status.kind === "applying" ? (
                <div className={s.applying}>Applying…</div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className={s.neverAuto}>
        <strong>NEVER AUTO-WRITTEN:</strong>{" "}
        Stage · Amount · Close Date · Forecast Category
      </div>
    </section>
  );
}
