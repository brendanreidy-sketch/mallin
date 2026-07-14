"use client";

/**
 * CockpitActionBar — sticky anchor strip at the top of /prep.
 *
 * Sits below the Header, above all the deal-detail sections. Acts as
 * the cockpit's table of contents — chips anchor-jump to the surfaces
 * the rep needs to act on.
 *
 * Chip set is constructed server-side based on what's actually
 * rendered for this deal (don't show a "💬 Slack" chip if Slack isn't
 * wired for the tenant yet). Each chip is an <a href="#section-id">
 * so it works without JS — graceful baseline. JS adds smooth scroll +
 * count badges that pulse on update.
 *
 * Counts: shown as small badges (e.g. "CRM · 3"). Pulled from server
 * props — caller passes the actual numbers.
 *
 * Visual: matches the cockpit-mock at /cockpit-mock. Pill-shaped chips,
 * cream background, ink text, "Ask Mallín →" as the right-anchored
 * primary CTA.
 */

import s from "./cockpitActionBar.module.css";

export interface ActionBarChip {
  id: string;
  emoji: string;
  label: string;
  count?: number;
  targetHash: string;
}

export interface CockpitActionBarProps {
  chips: ActionBarChip[];
  /** Optional primary action — usually "Ask Mallín →". Right-anchored. */
  primaryAction?: {
    label: string;
    href: string;
  };
}

export default function CockpitActionBar({
  chips,
  primaryAction,
}: CockpitActionBarProps) {
  return (
    <nav className={s.bar} aria-label="Cockpit actions">
      {chips.map((c) => (
        <a key={c.id} href={c.targetHash} className={s.chip}>
          <span className={s.emoji} aria-hidden="true">
            {c.emoji}
          </span>
          {c.label}
          {typeof c.count === "number" && c.count > 0 ? (
            <span className={s.count}>{c.count}</span>
          ) : null}
        </a>
      ))}
      {primaryAction ? (
        <a href={primaryAction.href} className={s.primary}>
          {primaryAction.label}
        </a>
      ) : null}
    </nav>
  );
}
