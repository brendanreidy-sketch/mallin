'use client';

import Link from 'next/link';
import type { ReferenceMatch } from '@/lib/cockpit/match-reference';
import { MODULE_LABELS } from '@/lib/cockpit/reference-library';
import s from './referenceCard.module.css';

/**
 * Reference customer — Altitude 2 ammo. ONE opinionated closed-won comparable
 * matched to the open opp by industry + module footprint. Not a logo wall: it
 * links back to a real deal's cockpit (its own evidence trail). Honest framing —
 * "closest closed-won comparable", not an asserted public reference.
 */
export function ReferenceCard({ match }: { match: ReferenceMatch | null }) {
  if (!match) return null;
  const { reference, sharedModules, competitorOverlap, reason } = match;

  return (
    <section className={s.card} aria-label="Reference customer">
      <div className={s.head}>
        <span className={s.eyebrow}>Reference customer</span>
        <span className={s.outcome}>{reference.outcome}</span>
      </div>

      <div className={s.body}>
        <div className={s.lead}>
          <Link href={`/cockpit-views/${reference.dealId}`} className={s.name}>
            {reference.name}
            <span className={s.open} aria-hidden>
              {' '}
              →
            </span>
          </Link>
          <div className={s.reason}>
            <span className={s.reasonLabel}>Why this surfaced</span>
            <span className={s.reasonText}>{reason}</span>
          </div>
        </div>

        {competitorOverlap.length > 0 && (
          <div className={s.competitor}>
            <span className={s.competitorDot} aria-hidden />
            Beat {competitorOverlap.join(' & ')} — live in this deal
          </div>
        )}

        <p className={s.proof}>{reference.proofPoint}</p>

        {sharedModules.length > 0 && (
          <div className={s.modules}>
            <span className={s.modulesLabel}>Shared modules</span>
            <div className={s.chips}>
              {sharedModules.map((m) => (
                <span key={m} className={s.chip}>
                  {MODULE_LABELS[m]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={s.foot}>
        Closest closed-won comparable in your book · confirm referenceability before citing
      </div>
    </section>
  );
}
