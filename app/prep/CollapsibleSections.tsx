/**
 * CollapsibleSections — progressive-disclosure UI for the prep page.
 *
 * Activates the queued pull signal from `pull_signal_log.md`:
 *   "recommendation compression — progressive disclosure not less
 *    intelligence, queued"
 *
 * Visual + interaction spec:
 *   docs/landing-concepts/23-prep-style-variants.html (laughing-visvesvaraya-9af60b)
 *
 * Behavior:
 *   - All sections default to collapsed (rendered as chips below)
 *   - Click a chip → that section expands inline above the chip strip
 *   - Hover an expanded section → eye icon appears top-right
 *   - Click the eye → section re-collapses to a chip
 *
 * Persistence: NOT in v1. State lives in client memory only — if the
 * rep refreshes, all sections collapse back to defaults. Persistence
 * per-rep per-deal is the next iteration (gated on usage signal).
 *
 * The Primary Decision Focus is NOT a member of this set — it lives
 * above this component, always visible, never collapsible. Per
 * product_north_star.md it's THE single elevated thing.
 */

"use client";

import { useState, type ReactNode } from "react";
import s from "./collapsibleSections.module.css";

export interface CollapsibleSection {
  id: string;
  label: string;
  content: ReactNode;
  /** Default to open. Use sparingly; the design intent is compact-by-default. */
  defaultOpen?: boolean;
}

export default function CollapsibleSections({
  sections,
}: {
  sections: CollapsibleSection[];
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(sections.filter((sec) => sec.defaultOpen).map((sec) => sec.id)),
  );

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hiddenSections = sections.filter((sec) => !openIds.has(sec.id));
  const anyOpen = sections.some((sec) => openIds.has(sec.id));

  return (
    <>
      {sections.map((sec) => {
        if (!openIds.has(sec.id)) return null;
        return (
          <div
            key={sec.id}
            className={s.section}
            data-section-id={sec.id}
            data-first={anyOpen && sec.id === sections.find((x) => openIds.has(x.id))?.id ? "true" : undefined}
          >
            <div className={s.sectionHead}>
              <span className={s.sectionLabel}>{sec.label}</span>
              <button
                type="button"
                className={s.visibilityToggle}
                onClick={() => toggle(sec.id)}
                title="Hide section"
                aria-label={`Hide ${sec.label} section`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a17.62 17.62 0 0 1 4.06-5.94" />
                  <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                  <path d="M1 1l22 22" />
                  <path d="M10.58 5.08A10 10 0 0 1 12 5c7 0 10 7 10 7a17.43 17.43 0 0 1-2.16 3.19" />
                </svg>
              </button>
            </div>
            <div className={s.sectionBody}>{sec.content}</div>
          </div>
        );
      })}

      {hiddenSections.length > 0 && (
        <div className={s.drawer} role="region" aria-label="Hidden sections">
          <div className={s.drawerHead}>— Hidden · click to restore</div>
          <ul className={s.drawerList}>
            {hiddenSections.map((sec) => (
              <li key={sec.id}>
                <button
                  type="button"
                  className={s.chip}
                  onClick={() => toggle(sec.id)}
                  aria-label={`Show ${sec.label} section`}
                >
                  + {sec.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
