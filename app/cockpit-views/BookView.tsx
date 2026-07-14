'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BookRow } from '@/lib/cockpit/derive-book';
import type { BookReview as Review } from '@/lib/cockpit/book-agent';
import type { Tone } from '@/lib/cockpit/render-model';
import { BookReview } from './BookReview';
import s from './bookView.module.css';

/**
 * The book — Altitude 1. One row per deal in a rep's portfolio, each row the
 * deal's tier-1 governance read at lower resolution. Three lenses over the same
 * rows (how sales folks actually triage a book):
 *   attention  — what needs you first (posture + blocking risks + gaps)
 *   nextcall   — ordered by the next touch, agenda attached
 *   pipeline   — flat roster, neutral order
 * Click a row to drill into that deal's cockpit (Altitude 2).
 */

type Lens = 'attention' | 'nextcall' | 'pipeline';

const LENSES: { id: Lens; label: string; caption: string }[] = [
  { id: 'attention', label: 'Attention', caption: 'What needs you first' },
  { id: 'nextcall', label: 'Next call', caption: 'Ordered by your next touch' },
  { id: 'pipeline', label: 'Pipeline', caption: 'The whole book, flat' },
];

const toneClass: Record<Tone, string> = {
  neutral: s.tNeutral,
  positive: s.tPositive,
  caution: s.tCaution,
  critical: s.tCritical,
  accent: s.tAccent,
};

function postureLabel(p: string): string {
  return p.replace('_', ' ');
}

export function BookView({
  rows,
  rep,
  review,
  gmailConnected = false,
}: {
  rows: BookRow[];
  rep: string;
  review: Review;
  gmailConnected?: boolean;
}) {
  const [lens, setLens] = useState<Lens>('attention');

  const ordered = useMemo(() => {
    const r = [...rows];
    if (lens === 'attention') return r.sort((a, b) => b.attentionScore - a.attentionScore);
    if (lens === 'nextcall') return r.sort((a, b) => a.nextCall.inDays - b.nextCall.inDays);
    return r.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, lens]);

  const needAttention = rows.filter((r) => r.attentionScore >= 25).length;
  const activeCaption = LENSES.find((l) => l.id === lens)?.caption ?? '';

  return (
    <div className={s.page}>
      <div className={s.shell}>
        <header className={s.topbar}>
          <div>
            <div className={s.title}>The Book</div>
            <div className={s.sub}>
              {rep} · {rows.length} active deals ·{' '}
              <span className={s.attn}>{needAttention} need attention</span>
            </div>
          </div>
        </header>

        <BookReview review={review} gmailConnected={gmailConnected} />

        <div className={s.fullBookBar}>
          <span className={s.fullBookLabel}>The full book</span>
          <div className={s.lensWrap}>
            <span className={s.lensLabel}>Organize by</span>
            <div className={s.seg}>
              {LENSES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`${s.segBtn} ${lens === l.id ? s.segOn : ''}`}
                  onClick={() => setLens(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={s.caption}>{activeCaption}</div>

        <div className={s.rows}>
          {ordered.map((row) => (
            <Link key={row.id} href={`/cockpit-views/${row.id}`} className={s.row}>
              <div className={s.rowMain}>
                <div className={s.rowHead}>
                  <span className={s.name}>{row.name}</span>
                  <span className={`${s.posture} ${toneClass[row.postureTone]}`}>
                    {postureLabel(row.posture)}
                  </span>
                </div>
                <div className={s.headline}>{row.headline}</div>
                <div className={s.risk}>
                  <span className={`${s.sevDot} ${toneClass[row.topRisk.tone]}`} />
                  <span className={s.riskTitle}>{row.topRisk.title}</span>
                  {row.riskCount > 1 && (
                    <span className={s.riskMore}>+{row.riskCount - 1} more</span>
                  )}
                </div>
              </div>

              <div className={s.rowMeta}>
                <div className={s.metaBlock}>
                  <div className={s.metaLabel}>Coverage</div>
                  <div className={s.metaVal}>
                    {row.coveragePresent}/{row.coverageTotal}
                    {row.gapCount > 0 && <span className={s.gap}> · {row.gapCount} gap</span>}
                  </div>
                </div>
                <div className={s.metaBlock}>
                  <div className={s.metaLabel}>
                    Next call <span className={s.synth} title="Synthesized — no calendar source">synth</span>
                  </div>
                  <div className={s.metaVal}>{row.nextCall.whenLabel}</div>
                </div>
                <span className={s.chevron} aria-hidden>
                  →
                </span>
              </div>

              {lens === 'nextcall' && (
                <div className={s.agenda}>
                  <span className={s.agendaLabel}>Walk in on</span> {row.nextCall.focus}
                </div>
              )}
            </Link>
          ))}
        </div>

        <footer className={s.foot}>
          Coverage and gaps are the same governance model as the cockpit, summarized. Next-call
          times are synthesized — no calendar is wired in this harness.
        </footer>
      </div>
    </div>
  );
}
