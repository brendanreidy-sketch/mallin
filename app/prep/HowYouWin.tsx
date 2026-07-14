"use client";

/**
 * HowYouWin — the two deal-framing blocks above the per-call tactics:
 *
 *   HOW YOU WIN THIS          {the one play that closes it}   [✕ confirm]
 *   WHAT COULD GO WRONG       {1–3 silent-killer risks}       [acknowledge]
 *
 * Content (feature A): reads artifact.how_you_win + artifact.what_could_go_wrong.
 *
 * Governed gestures (feature C): the win block carries an alert the rep clears
 * by hitting ✕ — and clearing it IS the confirmation that they actually talked
 * the play through with the prospect (not "I clicked an AI button"). The risk
 * block carries an "acknowledge" the rep hits to say "I have a plan for this".
 * Both persist to /api/cockpit-action and hydrate on mount so the ✓ survives
 * reload. On a deal-less brief (static fixture) the gesture is optimistic-only.
 *
 * Why the ✕ and not a generic checkbox: per the approval emotional contract,
 * the gesture should mean "we're aligned / I did this", and in the team tier a
 * manager reads strategy_confirmed to know the play reached the room.
 */

import { useEffect, useState } from "react";
import s from "./howYouWin.module.css";
import { recordCockpitAction, fetchCockpitActions } from "./cockpitActions";

const WIN_REF = "how_you_win";
const RISK_REF = "what_could_go_wrong";

interface Props {
  howYouWin?: string;
  whatCouldGoWrong?: string[];
  /** Deal UUID for gesture persistence. Null on static/fixture briefs —
   *  gestures then apply optimistically without a server write. */
  dealId?: string | null;
}

export default function HowYouWin({ howYouWin, whatCouldGoWrong, dealId }: Props) {
  const play = howYouWin?.trim();
  const risks = (whatCouldGoWrong ?? []).map((r) => r.trim()).filter(Boolean);

  const [confirmed, setConfirmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Hydrate prior gestures so ✓ survives reload.
  useEffect(() => {
    let alive = true;
    void fetchCockpitActions(dealId ?? null).then((actions) => {
      if (!alive) return;
      for (const a of actions) {
        if (a.action_type === "strategy_confirmed" && a.target_ref === WIN_REF) {
          setConfirmed(true);
        }
        if (a.action_type === "risk_acknowledged" && a.target_ref === RISK_REF) {
          setAcknowledged(true);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [dealId]);

  if (!play && risks.length === 0) return null;

  const confirm = () => {
    if (confirmed) return;
    setConfirmed(true); // optimistic
    void recordCockpitAction({
      dealId: dealId ?? null,
      actionType: "strategy_confirmed",
      targetRef: WIN_REF,
      detail: play ? { play } : undefined,
    });
  };

  const acknowledge = () => {
    if (acknowledged) return;
    setAcknowledged(true); // optimistic
    void recordCockpitAction({
      dealId: dealId ?? null,
      actionType: "risk_acknowledged",
      targetRef: RISK_REF,
      detail: risks.length ? { count: risks.length } : undefined,
    });
  };

  return (
    <div className={s.wrap}>
      {play && (
        <section className={`${s.block} ${s.win}`} aria-label="How you win this">
          <header className={s.head}>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.label}>How you win this</span>
            {confirmed ? (
              <span className={s.confirmedPill}>✓ Confirmed with the prospect</span>
            ) : (
              <button
                type="button"
                className={s.ackx}
                onClick={confirm}
                aria-label="Confirm you discussed this play with the prospect"
                title="Discussed it? Clear this — it confirms you talked the play through with the prospect."
              >
                ✕
              </button>
            )}
          </header>
          <p className={s.play}>{play}</p>
        </section>
      )}

      {risks.length > 0 && (
        <section
          className={`${s.block} ${s.watch}`}
          aria-label="What could go wrong"
        >
          <header className={s.head}>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.label}>What could go wrong</span>
            {acknowledged && (
              <span className={s.confirmedPill}>✓ Acknowledged — you have a plan</span>
            )}
          </header>
          <ul className={s.riskList}>
            {risks.map((risk, i) => (
              <li key={i} className={s.riskItem}>
                <svg
                  className={s.riskMark}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8 1.5 15 14H1L8 1.5Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 6.2v3.1"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <circle cx="8" cy="11.4" r="0.85" fill="currentColor" />
                </svg>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
          {!acknowledged && (
            <button type="button" className={s.ackBtn} onClick={acknowledge}>
              Acknowledge — I have a plan
            </button>
          )}
        </section>
      )}
    </div>
  );
}
