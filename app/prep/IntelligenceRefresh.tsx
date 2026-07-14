"use client";

/**
 * Refresh button for the Intelligence Agent.
 *
 * UX shape: short blocking call to /api/intelligence (~30s for the
 * sweep + touch logging), then return. The API schedules the Pass 4
 * regen as background work (after()). The page's existing in-flight
 * banner pattern — "touch newer than artifact, < 5 min old" — takes
 * over: shows "Regenerating brief…" with meta-refresh until the new
 * artifact lands.
 *
 * Why this shape: the old version blocked the UI for ~3.5 min total
 * (30s sweep + 3min regen). Reps would think the button was broken.
 * Now the button unblocks after the sweep and the page handles the
 * rest like any other touch-triggered regen.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import s from "./prep.module.css";

export default function IntelligenceRefresh({
  dealId,
}: {
  dealId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "sweeping" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refresh() {
    setErrorMsg(null);
    setPhase("sweeping");
    try {
      const resp = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`sweep failed: ${txt.slice(0, 200)}`);
      }
      // Sweep done, regen scheduled in background. Reload to pick up
      // the new findings + render the in-flight banner.
      startTransition(() => {
        router.refresh();
        setPhase("idle");
      });
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase("error");
    }
  }

  const label = {
    idle: "Refresh intelligence",
    sweeping: "Sweeping web…",
    error: "Retry",
  }[phase];

  const busy = phase === "sweeping";

  return (
    <div className={s.intelRefreshWrap}>
      <button
        type="button"
        className={s.intelRefreshBtn}
        onClick={refresh}
        disabled={busy}
        aria-busy={busy}
      >
        {label}
      </button>
      {errorMsg && (
        <span className={s.intelRefreshError}>{errorMsg}</span>
      )}
    </div>
  );
}
