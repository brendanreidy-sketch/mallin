"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./outbound.module.css";
import { AUTONOMY_TIERS, type AutonomyLevel } from "@/lib/sdr/outbound/autonomy";

/**
 * The autonomy ladder + kill-switch. Shows the three tiers top-down
 * (Level 3 Assist → Level 1 Autonomous), lets you set the level, and carries
 * the load-bearing "Pause all outreach" kill-switch. Posts to
 * /api/outbound/settings; the pause ALWAYS wins server-side (resolveDisposition).
 */
export default function AutonomyBanner({
  level,
  paused,
}: {
  level: AutonomyLevel;
  paused: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/outbound/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.autonomy} ${paused ? styles.autonomyPaused : ""}`}>
      <div className={styles.autonomyHead}>
        <div>
          <div className={styles.autonomyTitle}>Agent autonomy</div>
          <div className={styles.autonomySub}>
            How much the agent does on its own. AEs start high; the SDR volume
            motion runs at Level&nbsp;1.
          </div>
        </div>
        <button
          type="button"
          className={paused ? styles.btnPrimary : styles.killBtn}
          onClick={() => post({ paused: !paused })}
          disabled={busy}
        >
          {busy ? "…" : paused ? "Resume outreach" : "Pause all outreach"}
        </button>
      </div>

      {paused && (
        <div className={styles.pausedNote}>
          Paused — nothing sends at any level. Approvals stay held until you resume.
        </div>
      )}

      <div className={styles.ladder}>
        {AUTONOMY_TIERS.map((t) => {
          const selected = t.key === level;
          return (
            <button
              key={t.key}
              type="button"
              disabled={busy || selected}
              onClick={() => post({ level: t.key })}
              className={`${styles.tier} ${selected ? styles.tierSelected : ""}`}
            >
              <span className={styles.tierRadio} aria-hidden="true" />
              <span className={styles.tierBody}>
                <span className={styles.tierName}>
                  <span className={styles.tierNum}>Level {t.level}</span> {t.name}
                  {t.role && <span className={styles.tierRole}>{t.role}</span>}
                  {selected && <span className={styles.tierCurrent}>current</span>}
                </span>
                <span className={styles.tierBlurb}>{t.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
