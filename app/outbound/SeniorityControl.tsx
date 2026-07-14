"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./outbound.module.css";

/**
 * The target-seniority dial — who the agent prospects into. A role preset:
 * AE reaches C-suite/VP/Director; SDR casts wider, adding Manager. The band is
 * size-adaptive server-side (seniority.ts): the sourcing prompt maps it to the
 * real decision-maker for each company's scale. Posts { seniority } to
 * /api/outbound/settings.
 */
const OPTS = [
  {
    key: "ae" as const,
    name: "AE",
    desc: "C-suite, VP, Director — senior and surgical.",
  },
  {
    key: "sdr" as const,
    name: "SDR",
    desc: "The AE band plus Manager — the wider volume net.",
  },
];

export default function SeniorityControl({ preset }: { preset: "ae" | "sdr" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(seniority: "ae" | "sdr") {
    setBusy(true);
    try {
      await fetch("/api/outbound/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seniority }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.autonomy}>
      <div className={styles.autonomyHead}>
        <div>
          <div className={styles.autonomyTitle}>Who to reach</div>
          <div className={styles.autonomySub}>
            Target seniority — size-adaptive. It maps the band to the real
            decision-maker for each company's scale.
          </div>
        </div>
      </div>
      <div className={styles.senRow}>
        {OPTS.map((o) => {
          const selected = o.key === preset;
          return (
            <button
              key={o.key}
              type="button"
              disabled={busy || selected}
              onClick={() => set(o.key)}
              className={`${styles.senOpt} ${selected ? styles.senOptSelected : ""}`}
            >
              <span className={styles.senName}>
                {o.name}
                {selected && <span className={styles.tierCurrent}>current</span>}
              </span>
              <span className={styles.senDesc}>{o.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
