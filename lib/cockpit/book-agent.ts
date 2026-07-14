/**
 * The Book Agent — Phase 1 (read-only portfolio review).
 *
 * The first truly agentic thing Mallin does is NOT send an email. It wakes up,
 * reads the whole book at once — something a rep cannot do by hand — and says:
 * "Of everything in your world, here is what deserves a decision today."
 *
 * Doctrine boundaries this module is built to respect:
 *  - It INVENTS no reasoning. Every "why" bullet, recommendation, temporal note
 *    and evidence id is lifted from the deal's own Pass-4 artifact. The agent
 *    ranks and synthesizes ACROSS deals; it does not author new claims.
 *  - Cross-deal signals are MECHANICAL counts over real risk text, listed by
 *    deal name so they're verifiable — not a promoted institutional "pattern"
 *    (see memory: pattern_log — patterns stay shadow until validated).
 *  - It observes / reasons / proposes / waits. No sends, no writes, no
 *    autonomous action. Side effects belong to a later, gated phase.
 */

import type { PrepArtifact, CriticalRisk } from '@/lib/contracts/execution-agent-output';
import type { EvidenceUnit, Tone } from './render-model';
import type { DealEntry } from './deal-registry';
import { deriveNextAction, type NextAction } from './next-action';

const SEVERITY_RANK: Record<string, number> = { blocking: 4, high: 3, medium: 2, low: 1 };

function postureTone(p?: string): Tone {
  switch (p) {
    case 'advancing':
      return 'positive';
    case 'at_risk':
      return 'critical';
    case 'stalled':
      return 'caution';
    default:
      return 'neutral';
  }
}

function severityTone(sev?: string): Tone {
  return sev === 'blocking' ? 'critical' : sev === 'high' ? 'caution' : 'neutral';
}

/** One thing the rep should decide on, assembled from a single deal's artifact. */
export interface BookDecision {
  rank: number;
  dealId: string;
  dealName: string;
  posture: string;
  postureTone: Tone;
  /** Grounded reasons this deal surfaced — risk, posture, the live open question. */
  why: string[];
  /** The single prescriptive move (risk.recommended_posture, rep voice). */
  recommendation: string;
  /** Temporal proof — what_changed.summary (artifact time, not wall-clock). */
  temporal?: string;
  /** Evidence ids of the load-bearing claim (the top risk). */
  evidenceIds: string[];
  /** Resolved quotes — attached server-side for the surfaced decisions only. */
  evidence?: EvidenceUnit[];
  /** Internal ranking score + the dominant factor, shown as the rank reason. */
  score: number;
  scoreReason: string;
  /** The single stage-aware channeled move the agent proposes (Phase 2). */
  action: NextAction;
}

/** A mechanical cross-deal observation — a count + the deals it covers. */
export interface PortfolioSignal {
  kind: 'eb_gate' | 'timeline';
  label: string;
  dealNames: string[];
}

export interface BookReview {
  generatedFor: string;
  scanned: number;
  needDecision: number;
  headline: string;
  decisions: BookDecision[];
  signals: PortfolioSignal[];
}

function topRisk(a: PrepArtifact): CriticalRisk | undefined {
  return [...(a.critical_risks ?? [])].sort(
    (x, y) => (SEVERITY_RANK[y.severity] ?? 0) - (SEVERITY_RANK[x.severity] ?? 0),
  )[0];
}

/** Does this risk describe an economic buyer with no real relationship/contact?
 *  Matched against the risk's own words — transparent, not a learned model. */
const EB_GATE_RE =
  /never (appeared|been|on)|no .{0,24}relationship|unengaged|absent|sign(s)? blind|unnamed (cfo|buyer)|cold|has(n.?t| not) (been|appeared|spoken)|no (vendor|seller) (presence|relationship)|uncontrolled/i;
const TIMELINE_RE = /go-live|implementation timeline|kickoff|bandwidth|timeline (gap|risk|delays?)/i;

function riskText(r?: CriticalRisk): string {
  if (!r) return '';
  return `${r.title} ${r.description} ${r.failure_mode ?? ''}`;
}

// Exported so the deals home can reuse the exact same per-deal scoring the
// Book uses — one ranking engine, two surfaces (no drift).
export function buildDecision(deal: DealEntry, now: Date): Omit<BookDecision, 'rank'> {
  const a = deal.artifact;
  const risk = topRisk(a);
  const posture = a.top_line?.posture ?? 'unknown';
  const blocking = (a.critical_risks ?? []).filter((r) => r.severity === 'blocking').length;
  const high = (a.critical_risks ?? []).filter((r) => r.severity === 'high').length;
  const openQ = a.open_questions?.[0]?.question;

  const why: string[] = [];
  if (risk) why.push(`${risk.title}${risk.severity === 'blocking' ? ' (blocking)' : ''}`);
  if (posture === 'at_risk') why.push('Deal posture has slipped to at-risk.');
  else if (posture === 'stalled') why.push('Deal posture has stalled.');
  if (openQ) why.push(openQ);

  const score =
    (posture === 'at_risk' ? 100 : posture === 'stalled' ? 60 : 0) +
    blocking * 25 +
    high * 8 +
    (openQ ? 10 : 0) +
    ((a.what_changed?.changes?.length ?? 0) > 0 ? 5 : 0);

  let scoreReason: string;
  if (posture === 'at_risk') scoreReason = 'Your only at-risk deal.';
  else if (blocking >= 2) scoreReason = `${blocking} blocking risks open.`;
  else if (blocking === 1) scoreReason = 'A blocking risk is unresolved.';
  else if (high >= 2) scoreReason = `${high} high-severity risks open.`;
  else scoreReason = 'Active risks need a call.';

  return {
    dealId: deal.id,
    dealName: deal.name,
    posture,
    postureTone: postureTone(posture),
    why: why.slice(0, 3),
    recommendation: (risk?.recommended_posture ?? '').trim() || 'Re-establish the next concrete step.',
    temporal: a.what_changed?.summary,
    evidenceIds: risk?.evidence_ids ?? [],
    score,
    scoreReason,
    action: deriveNextAction(a, deal.name),
  };
}

function buildSignals(deals: DealEntry[]): PortfolioSignal[] {
  const ebDeals: string[] = [];
  const timelineDeals: string[] = [];
  for (const d of deals) {
    const text = riskText(topRisk(d.artifact));
    if (EB_GATE_RE.test(text)) ebDeals.push(d.name);
    else if (TIMELINE_RE.test(text)) timelineDeals.push(d.name);
  }
  const signals: PortfolioSignal[] = [];
  if (ebDeals.length >= 2) {
    signals.push({
      kind: 'eb_gate',
      label: `${ebDeals.length} deals turn on an economic buyer with no established vendor relationship`,
      dealNames: ebDeals,
    });
  }
  if (timelineDeals.length >= 2) {
    signals.push({
      kind: 'timeline',
      label: `${timelineDeals.length} deals are exposed on implementation timing`,
      dealNames: timelineDeals,
    });
  }
  return signals;
}

export const ATTENTION_THRESHOLD = 50;

/** Run the portfolio review. Pure over the artifacts (no model call, no
 *  fabrication) so the brief is reproducible. Evidence quotes for the surfaced
 *  decisions are resolved by the caller (it holds the substrates). */
export function reviewBook(deals: DealEntry[], now: Date = new Date()): BookReview {
  const ranked = deals
    .map((d) => buildDecision(d, now))
    .sort((a, b) => b.score - a.score);

  const needDecision = ranked.filter((d) => d.score >= ATTENTION_THRESHOLD).length;
  const decisions: BookDecision[] = ranked
    .slice(0, 3)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  const generatedFor = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const headline =
    needDecision > 0
      ? `${deals.length} deals scanned — ${needDecision} need a decision today.`
      : `${deals.length} deals scanned — nothing urgent, but here's where to look.`;

  return {
    generatedFor,
    scanned: deals.length,
    needDecision,
    headline,
    decisions,
    signals: buildSignals(deals),
  };
}
