"use client";

import { useState } from "react";
import s from "./prep.module.css";

/** Mirrors the artifact's Deliverables (execution-agent-output). */
type DeliverableItem = { label: string; detail?: string; route?: string };
type Deliverables = { title: string; items: DeliverableItem[] };

/**
 * Deliverables checklist (top of cockpit) — the approved v5 design.
 *
 * The "what {buyer} is waiting on before they decide" list: the concrete
 * things standing between now and a decision, as tickable rows. Ticking
 * is local session state — a rep marking what they've sent — with a
 * progress readout and an all-clear banner. Read-only source (the agent
 * generates the list); the checkboxes don't write anywhere yet.
 */
export default function DeliverablesChecklist({
  deliverables,
}: {
  deliverables: Deliverables;
}) {
  const items = deliverables.items ?? [];
  const [sent, setSent] = useState<boolean[]>(() => items.map(() => false));
  if (items.length === 0) return null;

  const toggle = (i: number) =>
    setSent((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  const count = sent.filter(Boolean).length;
  const allSent = count === items.length;

  return (
    <section className={s.delivCard}>
      <header className={s.delivHead}>
        <span className={s.delivTitle}>{deliverables.title}</span>
        <span
          className={allSent ? `${s.delivProgress} ${s.delivProgressDone}` : s.delivProgress}
        >
          {count} of {items.length} sent
        </span>
      </header>
      <ul className={s.delivList}>
        {items.map((item, i) => (
          <li key={i} className={s.delivItem}>
            <label className={s.delivLabel}>
              <input
                type="checkbox"
                className={s.delivCheck}
                checked={sent[i]}
                onChange={() => toggle(i)}
              />
              <span className={sent[i] ? s.delivTextDone : s.delivText}>
                {item.label}
                {item.detail && <span className={s.delivDetail}> {item.detail}</span>}
                {item.route && <span className={s.delivRoute}> → {item.route}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {allSent && (
        <div className={s.delivDone}>
          All {items.length} sent — ask for the decision.
        </div>
      )}
    </section>
  );
}
