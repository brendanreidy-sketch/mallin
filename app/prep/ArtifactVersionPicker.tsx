"use client";

/**
 * Brief history navigator — pill row of every PrepArtifact version for
 * this deal (newest → oldest). Clicking a pill loads that historical
 * version into the page via the `artifactId` URL param.
 *
 * Always reads the current dealId from the URL so navigation works even
 * when the rep clicks back/forward; no client state outside the URL.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { ArtifactVersionSummary } from "@/lib/db/load-deal";
import s from "./prep.module.css";

export default function ArtifactVersionPicker({
  versions,
  currentArtifactId,
}: {
  versions: ArtifactVersionSummary[];
  currentArtifactId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const path = usePathname();

  // No picker until there's at least 2 — single version is the trivial case
  // and rendering a picker for it would just be visual noise.
  if (versions.length < 2) return null;

  function go(versionId: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (versionId) {
      next.set("artifactId", versionId);
    } else {
      next.delete("artifactId");
    }
    router.push(`${path}?${next.toString()}`);
  }

  return (
    <div className={s.versionPicker}>
      <span className={s.versionPickerLabel}>Brief history</span>
      <div className={s.versionPickerRow}>
        {versions.map((v) => {
          const active = v.id === currentArtifactId;
          return (
            <button
              key={v.id}
              type="button"
              className={`${s.versionPill} ${active ? s.versionPillActive : ""}`}
              onClick={() => go(v.is_current ? null : v.id)}
              title={`${v.label} — ${v.is_current ? "current" : "historical"}`}
            >
              <span className={s.versionPillLabel}>{v.label}</span>
              {v.is_current && (
                <span className={s.versionPillCurrent}>current</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
