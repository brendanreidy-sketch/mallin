"use client";

/**
 * PrimaryDecisionActions — review-controls island for PrimaryDecisionFocus.
 *
 * Three actions: Approve · Modify · Reject. Visual model is PR-review /
 * deployment-confirmation, not "SaaS dashboard buttons" — subtle
 * borders, minimal color, consequential tone.
 *
 * For the demo, these don't yet wire into the action queue — they
 * surface a transient confirmation and lock the block into a
 * resolved state. The simulation banner at the top of /prep is the
 * cue that this is sandbox; the controls feel like the real thing
 * but write nothing externally.
 *
 * When this graduates to production (post first design-partner
 * conversion), the handlers will:
 *   - Approve → enqueue an action_queue row with the recommended_move
 *   - Modify → open an inline editor on the move text, then enqueue
 *   - Reject → record the dismissal with provenance for coach feedback
 */

import { useState } from "react";
import s from "./primaryDecisionFocus.module.css";

type ResolvedState = "open" | "approved" | "rejected";

export default function PrimaryDecisionActions() {
  const [state, setState] = useState<ResolvedState>("open");

  if (state === "approved") {
    return (
      <div className={`${s.actions} ${s.actionsResolved}`}>
        <div className={s.resolvedBadge}>
          <span className={s.resolvedDot} aria-hidden="true" />
          Approved · queued for execution
        </div>
        <button
          type="button"
          className={s.undo}
          onClick={() => setState("open")}
        >
          Undo
        </button>
      </div>
    );
  }

  if (state === "rejected") {
    return (
      <div className={`${s.actions} ${s.actionsResolved} ${s.actionsRejected}`}>
        <div className={s.resolvedBadge}>
          <span className={s.resolvedDot} aria-hidden="true" />
          Rejected · noted for coaching feedback
        </div>
        <button
          type="button"
          className={s.undo}
          onClick={() => setState("open")}
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className={s.actions}>
      <button
        type="button"
        className={`${s.actionBtn} ${s.actionApprove}`}
        onClick={() => setState("approved")}
      >
        Approve recommendation
      </button>
      <button
        type="button"
        className={s.actionBtn}
        disabled
        title="Inline editor coming after first design-partner conversion"
      >
        Modify
      </button>
      <button
        type="button"
        className={s.actionBtn}
        onClick={() => setState("rejected")}
      >
        Reject
      </button>
    </div>
  );
}
