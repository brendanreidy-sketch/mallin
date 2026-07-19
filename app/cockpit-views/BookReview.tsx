'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BookReview as Review, BookDecision } from '@/lib/cockpit/book-agent';
import type { NextAction, ActionChannel } from '@/lib/cockpit/next-action';
import type { Tone } from '@/lib/cockpit/render-model';
import { EvidenceChip } from './EvidenceChip';
import s from './bookReview.module.css';

/**
 * The Book Agent's morning brief — Phase 1, read-only.
 *
 * The agent observes (reads every deal), reasons (ranks across the book),
 * proposes (one move per decision, with its evidence) and waits. The three
 * controls are the rep DECIDING on the proposal — they triage the brief for
 * this session and trigger no sends, writes, or CRM changes. Execution is a
 * later, gated phase.
 */

type Status = 'open' | 'approved' | 'dismissed' | 'later';

const toneClass: Record<Tone, string> = {
  neutral: s.tNeutral,
  positive: s.tPositive,
  caution: s.tCaution,
  critical: s.tCritical,
  accent: s.tAccent,
};

export function BookReview({
  review,
  gmailConnected = false,
}: {
  review: Review;
  gmailConnected?: boolean;
}) {
  const [status, setStatus] = useState<Record<string, Status>>({});

  const set = (id: string, st: Status) => setStatus((p) => ({ ...p, [id]: st }));

  const visible = review.decisions.filter((d) => (status[d.dealId] ?? 'open') !== 'dismissed');

  return (
    <section className={s.brief}>
      <header className={s.head}>
        <div className={s.eyebrow}>
          <span className={s.mark}>✦</span> Book Review
          <span className={s.date}>· {review.generatedFor}</span>
        </div>
        <h2 className={s.headline}>{review.headline}</h2>
        <p className={s.note}>
          Mallín read all {review.scanned} deals and ranked what deserves a decision today —
          something you can&apos;t do one deal at a time. It proposes; it does not act.
        </p>
      </header>

      {review.signals.length > 0 && (
        <div className={s.signals}>
          {review.signals.map((sig) => (
            <div key={sig.kind} className={s.signal}>
              <span className={s.signalDot} />
              <div>
                <div className={s.signalLabel}>{sig.label}</div>
                <div className={s.signalDeals}>{sig.dealNames.join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={s.decisions}>
        {visible.map((d) => (
          <DecisionCard
            key={d.dealId}
            d={d}
            gmailConnected={gmailConnected}
            status={status[d.dealId] ?? 'open'}
            onApprove={() => set(d.dealId, 'approved')}
            onDismiss={() => set(d.dealId, 'dismissed')}
            onLater={() => set(d.dealId, 'later')}
            onReopen={() => set(d.dealId, 'open')}
          />
        ))}
      </div>

      <footer className={s.foot}>
        Phase 1 — the agent observes, reasons, proposes, waits. Approve / Dismiss / Not now record
        your call for this session only. No email, CRM update, or task is created. Execution is a
        later, governed phase.
      </footer>
    </section>
  );
}

function DecisionCard({
  d,
  gmailConnected,
  status,
  onApprove,
  onDismiss,
  onLater,
  onReopen,
}: {
  d: BookDecision;
  gmailConnected: boolean;
  status: Status;
  onApprove: () => void;
  onDismiss: () => void;
  onLater: () => void;
  onReopen: () => void;
}) {
  if (status === 'approved') {
    return (
      <div className={`${s.card} ${s.resolved}`}>
        <div className={s.resolvedLine}>
          <span className={s.check}>✓</span>
          <span>
            <strong>{d.dealName}</strong> — you&apos;re on it. Tracked for this session; nothing was
            sent.
          </span>
          <button type="button" className={s.undo} onClick={onReopen}>
            Undo
          </button>
        </div>
      </div>
    );
  }
  if (status === 'later') {
    return (
      <div className={`${s.card} ${s.resolved}`}>
        <div className={s.resolvedLine}>
          <span className={s.later}>↻</span>
          <span>
            <strong>{d.dealName}</strong> — deferred. Back in tomorrow&apos;s brief.
          </span>
          <button type="button" className={s.undo} onClick={onReopen}>
            Undo
          </button>
        </div>
      </div>
    );
  }

  return (
    <article className={s.card}>
      <header className={s.cardHead}>
        <div className={s.cardTitleRow}>
          <span className={s.rank}>Decision {d.rank}</span>
          <Link href={`/cockpit-views/${d.dealId}`} className={s.deal}>
            {d.dealName}
          </Link>
          <span className={`${s.posture} ${toneClass[d.postureTone]}`}>
            {d.posture.replace('_', ' ')}
          </span>
        </div>
        <div className={s.rankReason}>{d.scoreReason}</div>
      </header>

      <div className={s.block}>
        <div className={s.blockLabel}>Why</div>
        <ul className={s.why}>
          {d.why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>

      {d.evidence && d.evidence.length > 0 && (
        <div className={s.block}>
          <div className={s.blockLabel}>
            Evidence <EvidenceChip evidence={d.evidence} />
          </div>
          {d.evidence[0].quote && <blockquote className={s.quote}>{d.evidence[0].quote}</blockquote>}
        </div>
      )}

      {d.temporal && (
        <div className={s.block}>
          <div className={s.blockLabel}>What changed</div>
          <p className={s.temporal}>{d.temporal}</p>
        </div>
      )}

      <div className={s.block}>
        <div className={s.blockLabel}>Recommendation</div>
        <p className={s.rec}>{d.recommendation}</p>
      </div>

      <ActionBlock action={d.action} dealName={d.dealName} gmailConnected={gmailConnected} />

      <div className={s.actions}>
        <button type="button" className={`${s.btn} ${s.approve}`} onClick={onApprove}>
          Approve
        </button>
        <button type="button" className={s.btn} onClick={onLater}>
          Not now
        </button>
        <button type="button" className={`${s.btn} ${s.dismiss}`} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </article>
  );
}

const CHANNEL_META: Record<ActionChannel, { icon: string; label: string }> = {
  email: { icon: '✉', label: 'Email' },
  call: { icon: '☎', label: 'Call' },
  text: { icon: '✦', label: 'Text' },
  multithread: { icon: '⇄', label: 'Multithread' },
  stakeholder: { icon: '◎', label: 'Reach stakeholder' },
};

type SendPhase =
  | { kind: 'idle' }
  | { kind: 'error'; message: string };

/**
 * The stage-aware move — Phase 2/3 surface. The agent classifies WHAT to do
 * (channel + target + draft); the rep stays the executor. DRAFTS-ONLY
 * (2026-07-18): the primary action saves the message to the rep's Gmail Drafts
 * (drafts.create) — Mallín never sends. The rep reviews and sends from their own
 * inbox. Outlook stays a compose-handoff; "Copy" and "Open in Outlook" are
 * user-controlled fallbacks.
 */
function ActionBlock({
  action,
  dealName,
  gmailConnected,
}: {
  action: NextAction;
  dealName: string;
  gmailConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(action.draft?.subject ?? '');
  const [body, setBody] = useState(action.draft?.body ?? '');
  const [copied, setCopied] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);
  const [phase, setPhase] = useState<SendPhase>({ kind: 'idle' });
  const meta = CHANNEL_META[action.channel];

  const enc = encodeURIComponent;
  const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`;

  const saveDraft = async () => {
    try {
      const res = await fetch('/api/gmail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, bodyText: body, bodyHtml: bodyTextToHtml(body) }),
      });
      const json = await res.json();
      if (json.ok) {
        setSavedDraft(true);
        setTimeout(() => setSavedDraft(false), 2200);
      } else {
        setPhase({ kind: 'error', message: json.detail || json.error || 'Could not save draft.' });
      }
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save draft.' });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  return (
    <div className={s.action}>
      <div className={s.actionTop}>
        <span className={s.channelTag}>
          <span className={s.channelIcon} aria-hidden>
            {meta.icon}
          </span>
          {meta.label}
        </span>
        <span className={s.cycleStage}>{action.cycleStage}</span>
      </div>

      <div className={s.actionTitle}>{action.title}</div>
      <div className={s.actionTarget}>
        → {action.target.name}
        {action.target.role && <span className={s.targetRole}> · {action.target.role}</span>}
      </div>
      <p className={s.actionWhy}>{action.stageRationale}</p>

      {open && action.draft && (
        <div className={s.draft}>
          <label className={s.fieldRow}>
            <span className={s.draftLabel}>To</span>
            <input
              className={s.field}
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={`${action.target.name}'s email`}
            />
          </label>
          <label className={s.fieldRow}>
            <span className={s.draftLabel}>Subject</span>
            <input
              className={s.field}
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <textarea
            className={s.bodyField}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
          />
          <div className={s.draftNote}>Editable before you save it to your Gmail Drafts.</div>
        </div>
      )}
      {open && action.prepNote && (
        <div className={s.prep}>
          <span className={s.prepLabel}>For you — not in the draft</span>
          <span className={s.prepText}>{action.prepNote}</span>
        </div>
      )}
      {open && action.talkingPoints && (
        <ul className={s.points}>
          {action.talkingPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      {phase.kind === 'error' && (
        <div className={s.sendError}>✗ {phase.message}</div>
      )}

      <div className={s.actionBar}>
        <button type="button" className={s.draftToggle} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : action.draft ? 'Open draft' : 'Talking points'}
        </button>

        {open && action.draft && (
          <div className={s.sendRow}>
            {gmailConnected ? (
              <button
                type="button"
                className={`${s.sendBtn} ${s.gmail}`}
                onClick={saveDraft}
              >
                {savedDraft ? 'Saved to Gmail' : '💾 Save to Gmail Drafts'}
              </button>
            ) : (
              <Link className={`${s.sendBtn} ${s.gmail}`} href="/settings/integrations">
                Connect Gmail to save drafts
              </Link>
            )}
            <a className={`${s.sendBtn} ${s.outlook}`} href={outlookUrl} target="_blank" rel="noreferrer">
              Open in Outlook
            </a>
            <button type="button" className={s.sendBtn} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {open && action.draft && (
        <div className={s.execNote}>
          {gmailConnected
            ? 'Mallín saves this to your Gmail Drafts — it never sends. Review and send from your own inbox.'
            : 'Gmail isn’t connected. Outlook opens a prefilled compose, or use Copy to paste into your mail client.'}
        </div>
      )}
    </div>
  );
}

/** Cheap text→HTML for the body the rep typed — paragraphs + line breaks.
 *  Mirrors the prep EmailComposer so sends render consistently. */
function bodyTextToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
