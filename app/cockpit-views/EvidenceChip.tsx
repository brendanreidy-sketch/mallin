'use client';

import { useEffect, useRef, useState } from 'react';
import type { EvidenceUnit } from '@/lib/cockpit/render-model';
import s from './evidenceChip.module.css';

/** The evidence layer — turns any claim into "here's why Mallín believes this".
 *  Chip shows source count + confidence + freshness; clicking reveals the
 *  verbatim quoted lines behind the claim. Reasoning from evidence, not
 *  asserting a summary. */
export function EvidenceChip({ evidence }: { evidence: EvidenceUnit[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside-click or Escape, but only while open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!evidence.length) return null;

  const conf = confidence(evidence);
  const fresh = latestDate(evidence);

  return (
    <div className={s.wrap} ref={wrapRef}>
      <button
        type="button"
        className={s.chip}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={s.dot} style={{ background: conf.color }} />
        <span className={s.count}>
          {evidence.length} {evidence.length === 1 ? 'source' : 'sources'}
        </span>
        <span className={s.sep}>·</span>
        <span className={s.conf}>{conf.label}</span>
        {fresh && (
          <>
            <span className={s.sep}>·</span>
            <span className={s.fresh} title={`Most recent evidence: ${fresh}`}>
              {fresh}
            </span>
          </>
        )}
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>›</span>
      </button>

      {open && (
        <div className={s.pop}>
          <div className={s.popTitle}>Why Mallín believes this</div>
          <div className={s.units}>
            {evidence.map((u) => (
              <div key={u.id} className={s.unit}>
                <div className={s.unitHead}>
                  <span className={s.channel}>{channelLabel(u.channel)}</span>
                  {u.date && <span className={s.date}>{formatDate(u.date)}</span>}
                  {u.strength && (
                    <span
                      className={s.strength}
                      style={{ color: strengthColor(u.strength) }}
                    >
                      {u.strength}
                    </span>
                  )}
                </div>
                {u.quote ? (
                  <blockquote className={s.quote}>{u.quote}</blockquote>
                ) : (
                  u.summary && <div className={s.summary}>{u.summary}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function channelLabel(channel: string): string {
  switch (channel) {
    case 'call':
      return 'Call';
    case 'email':
      return 'Email';
    case 'crm':
      return 'CRM';
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function strengthColor(strength: string): string {
  switch (strength) {
    case 'strong':
      return '#5a8f7a';
    case 'moderate':
      return '#4a7186';
    default:
      return '#6b7689';
  }
}

/** Freshness = the most recent dated source ("Last evidence Oct 23"). Anchored
 *  on the evidence's own date, not wall-clock — honest about how current the
 *  basis is. Returns undefined when no source carries a date (e.g. CRM-only). */
function latestDate(evidence: EvidenceUnit[]): string | undefined {
  let latest = 0;
  for (const u of evidence) {
    if (!u.date) continue;
    const t = new Date(u.date).getTime();
    if (!Number.isNaN(t) && t > latest) latest = t;
  }
  if (!latest) return undefined;
  return new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Card confidence = the strongest evidence backing it. */
function confidence(evidence: EvidenceUnit[]): { label: string; color: string } {
  const has = (s: string) => evidence.some((u) => u.strength === s);
  if (has('strong')) return { label: 'High', color: '#5a8f7a' };
  if (has('moderate')) return { label: 'Medium', color: '#4a7186' };
  return { label: 'Low', color: '#6b7689' };
}
