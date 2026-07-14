/**
 * deriveBookRow: (PrepArtifact) -> BookRow — the Altitude-1 summary of a deal.
 *
 * A book row is the SAME governance vocabulary as the cockpit, read at lower
 * resolution. Coverage + gap counts come from running the real render-model
 * mapper over the default template (not a parallel heuristic), so "6/8 covered ·
 * 1 gap" on the book means exactly what a gap means in the cockpit.
 *
 * The ONE synthetic field is `nextCall` — there is no calendar source in the
 * fixtures, so it's derived deterministically from the deal and flagged
 * `synthetic: true` for the UI to mark. Everything else is real artifact data.
 */

import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';
import type { Tone } from './render-model';
import { deriveRenderModel } from './derive-render-model';
import { defaultTemplate } from './templates/default-template';
import type { DealEntry } from './deal-registry';

const SEVERITY_RANK: Record<string, number> = { blocking: 4, high: 3, medium: 2, low: 1 };

function severityTone(sev?: string): Tone {
  switch (sev) {
    case 'blocking':
      return 'critical';
    case 'high':
      return 'caution';
    default:
      return 'neutral';
  }
}

function postureTone(p?: string): Tone {
  switch (p) {
    case 'advancing':
      return 'positive';
    case 'at_risk':
      return 'critical';
    case 'stalled':
    case 'slipping':
      return 'caution';
    default:
      return 'neutral';
  }
}

export interface NextCallStub {
  /** Always true — there is no real calendar source. UI must mark this. */
  synthetic: true;
  /** Synthesized ISO datetime of the next touch. */
  whenISO: string;
  /** Server-formatted label (e.g. "Fri, Jun 6 · 10:00") — avoids SSR drift. */
  whenLabel: string;
  /** Whole days from `now` to the call. Drives the next-call lens ordering. */
  inDays: number;
  /** What the next call should pressure-test (derived from the top risk). */
  focus: string;
}

export interface BookRow {
  id: string;
  name: string;
  rep: string;
  /** The decision this deal turns on — deal_thesis.decision_frame. */
  headline: string;
  posture: string;
  postureTone: Tone;
  topRisk: { title: string; severity: string; tone: Tone };
  riskCount: number;
  blockingCount: number;
  /** Sections present vs total, from the real render model. */
  coveragePresent: number;
  coverageTotal: number;
  /** Sections with a required-but-missing field (governance gaps). */
  gapCount: number;
  /** Artifact generation time — the "as of" for everything above. */
  asOf?: string;
  nextCall: NextCallStub;
  /** Higher = more deserving of attention. Drives the triage lens. */
  attentionScore: number;
}

/** Small deterministic hash so the synthetic next-call spreads stably per deal. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Synthesize a next-call within ~2 weeks of `from`, deterministic per deal. */
function synthNextCall(id: string, topRiskTitle: string, from: Date): NextCallStub {
  const dayOffset = (hash(id) % 12) + 1; // 1..12 days out
  const hour = hash(id) % 2 === 0 ? 10 : 14;
  const when = new Date(from);
  when.setDate(when.getDate() + dayOffset);
  when.setHours(hour, 0, 0, 0);
  const whenLabel = `${when.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} · ${String(hour).padStart(2, '0')}:00`;
  return { synthetic: true, whenISO: when.toISOString(), whenLabel, inDays: dayOffset, focus: topRiskTitle };
}

export function deriveBookRow(deal: DealEntry, now: Date = new Date()): BookRow {
  const a = deal.artifact;

  // Reuse the real governance mapper for coverage/gaps — same vocabulary as the
  // cockpit, just summarized.
  const model = deriveRenderModel(a, defaultTemplate, deal.name);
  const coverageTotal = model.sections.length;
  const coveragePresent = model.sections.filter((s) => s.present).length;
  const gapCount = model.sections.filter((s) => s.hasGap).length;

  const risks = a.critical_risks ?? [];
  const ranked = [...risks].sort(
    (x, y) => (SEVERITY_RANK[y.severity ?? ''] ?? 0) - (SEVERITY_RANK[x.severity ?? ''] ?? 0),
  );
  const top = ranked[0];
  const blockingCount = risks.filter((r) => r.severity === 'blocking').length;
  const highCount = risks.filter((r) => r.severity === 'high').length;

  const posture = a.top_line?.posture ?? 'unknown';
  const thesis = a.deal_thesis;
  const headline =
    thesis?.status === 'formed'
      ? thesis.decision_frame || thesis.thesis
      : (thesis?.indeterminate_reason ?? '—');
  const topRisk = {
    title: top?.title ?? '—',
    severity: top?.severity ?? 'unknown',
    tone: severityTone(top?.severity),
  };

  const attentionScore =
    (posture === 'at_risk' ? 100 : posture === 'stalled' ? 60 : 0) +
    blockingCount * 25 +
    highCount * 8 +
    gapCount * 10;

  return {
    id: deal.id,
    name: deal.name,
    rep: deal.rep,
    headline,
    posture,
    postureTone: postureTone(posture),
    topRisk,
    riskCount: risks.length,
    blockingCount,
    coveragePresent,
    coverageTotal,
    gapCount,
    asOf: a.metadata?.generated_at,
    nextCall: synthNextCall(deal.id, topRisk.title, now),
    attentionScore,
  };
}
