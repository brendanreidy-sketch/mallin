/**
 * Stage-aware next action — Phase 2 surface (proposal only, no execution).
 *
 * The Book Agent (Phase 1) ranks WHAT deserves a decision. This module answers
 * the next question a rep actually asks — "so what do I DO about it?" — by
 * reading where the deal sits in its cycle and proposing ONE channeled move:
 * an email, a call, a text, or a multithread into a stakeholder who isn't yet
 * in the room.
 *
 * Doctrine boundaries (same spine as book-agent):
 *  - It INVENTS no move. The channel is selected mechanically from the deal's
 *    own top risk + posture; the target is a real stakeholder from
 *    stakeholder_strategy; the draft/talking points are lifted from that
 *    stakeholder's do_list and call_strategy. The agent CHOOSES, it does not
 *    author new strategy.
 *  - `executable` is the gate. This module marks an action as executable only
 *    when a live channel for it is connected. None are, so it is always false
 *    today — the Execute control renders as an approval object that lands in a
 *    later, governed phase (see memory: approval_emotional_contract).
 */

import type { PrepArtifact, CriticalRisk, StakeholderStrategy } from '@/lib/contracts/execution-agent-output';

export type ActionChannel = 'email' | 'call' | 'text' | 'multithread' | 'stakeholder';

export interface ActionTarget {
  name: string;
  role?: string;
}

export interface NextAction {
  channel: ActionChannel;
  /** Imperative one-liner — the move, in rep voice. */
  title: string;
  /** Who the move acts through / reaches. */
  target: ActionTarget;
  /** Where the deal is in its cycle — the "why this move now" anchor. */
  cycleStage: string;
  /** One sentence tying the stage to the channel choice. */
  stageRationale: string;
  /** For email / text / multithread — an editable starting draft (rep voice).
   *  CLEAN outreach only — never the internal coaching, which leaks voice. */
  draft?: { subject?: string; body: string };
  /** Internal prep — what to get out of the move, lifted from the champion's
   *  do_list. NOT customer-facing; rendered as a private note, never sent. */
  prepNote?: string;
  /** For call — what to walk in on. */
  talkingPoints?: string[];
  /** Evidence ids backing the move (the top risk's). */
  evidenceIds: string[];
  /** True only when a live channel is connected. Always false today. */
  executable: boolean;
  /** Honest status shown on the (disabled) Execute control. */
  executionNote: string;
}

const SEVERITY_RANK: Record<string, number> = { blocking: 4, high: 3, medium: 2, low: 1 };

/** Mirrors book-agent.topRisk — the load-bearing risk drives the channel. */
function topRisk(a: PrepArtifact): CriticalRisk | undefined {
  return [...(a.critical_risks ?? [])].sort(
    (x, y) => (SEVERITY_RANK[y.severity] ?? 0) - (SEVERITY_RANK[x.severity] ?? 0),
  )[0];
}

/**
 * Multithread trigger — keyed strictly on an UNREACHED approver, not on the
 * mere presence of an approval gate (every deal has one). The signal is EB
 * ABSENCE: an economic buyer with no vendor relationship, an unnamed/unengaged
 * approver, or a single-threaded path. A material-delivery gap ("champion needs
 * a timeline for the committee") is NOT this — both parties are already in the
 * room, so that resolves to arming the champion (email), not multithreading.
 */
const MULTITHREAD_RE =
  /never (appeared|been|spoken|met|engaged)|no .{0,24}relationship|zero relationship|unengaged|not been engaged|no (vendor|seller) (presence|relationship)|single-?thread|unnamed (cfo|controller|buyer)|sign(s)? blind|no presence or relationship/i;
const TIMELINE_RE = /go-live|implementation timeline|kickoff|bandwidth|timeline (gap|risk|delays?)/i;

function riskText(r?: CriticalRisk): string {
  if (!r) return '';
  return `${r.title} ${r.description} ${r.failure_mode ?? ''} ${r.trigger ?? ''}`;
}

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();

/** The named gate/event the deal is heading into — for a concrete "ahead of X".
 *  Extracted from structured-ish artifact text; undefined when nothing names a
 *  gate, so the draft falls back to neutral phrasing rather than inventing one. */
function extractGate(a: PrepArtifact, r?: CriticalRisk): string | undefined {
  const hay = clean([a.what_changed?.summary, r?.trigger, r?.title].filter(Boolean).join('  '));
  const dated = hay.match(
    /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})\s+(Steering Committee|board review|board presentation|board meeting|committee)/i,
  );
  if (dated) return clean(dated[0]);
  const named = hay.match(
    /(Steering Committee|board (?:review|presentation|meeting|cadence)|CFO(?:\/controller)? (?:gate|review|approval)|committee)/i,
  );
  if (named) return clean(named[0]).replace(/cadence/i, 'review');
  return undefined;
}

/** The concrete thing the champion is missing — from "without X" in the risk title. */
function extractConcern(r?: CriticalRisk): string | undefined {
  const m = (r?.title ?? '').match(/without (?:a |an |the )?([^.,;]+)/i);
  return m ? clean(m[1]) : undefined;
}

/** Who holds sign-off, for a multithread — parent proper-noun + finance role,
 *  else the approver role. Grounded in the risk's own words. */
function extractApprover(r?: CriticalRisk): string | undefined {
  const hay = clean(`${r?.title ?? ''} ${r?.description ?? ''}`);
  const proper = hay.match(/([A-Z][a-zA-Z]+)(?:['’]s|\s+Renewable[^—,-]*?)?\s+(CFO and finance team|CFO and finance|CFO\/finance)/);
  if (proper) return clean(`${proper[1]}'s ${proper[2]}`);
  const role = hay.match(/\b(?:an unnamed )?(CFO\/controller|CFO)\b/i);
  if (role) return `the ${clean(role[1])}`;
  return undefined;
}

const DISPOSITION_RANK: Record<string, number> = {
  champion: 4,
  supporter: 3,
  neutral: 2,
  skeptic: 1,
  blocker: 0,
  unknown: 0,
};

/** Coerce stakeholder_strategy to an array. The contract types it as
 *  StakeholderStrategy[], but malformed/legacy artifacts in the DB can carry an
 *  object keyed by stakeholder id. Spreading or .find()-ing an object throws
 *  ("is not iterable" / "not a function") and crashes the cockpit render for
 *  that tenant — normalize instead of trusting the shape. */
function asStakeholderArray(ss: unknown): StakeholderStrategy[] {
  if (Array.isArray(ss)) return ss as StakeholderStrategy[];
  if (ss && typeof ss === 'object') return Object.values(ss) as StakeholderStrategy[];
  return [];
}

/** The person to act THROUGH — highest-disposition, then highest priority. */
function pickChampion(a: PrepArtifact): StakeholderStrategy | undefined {
  const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return [...asStakeholderArray(a.stakeholder_strategy)].sort((x, y) => {
    const d =
      (DISPOSITION_RANK[y.current_state?.disposition ?? 'unknown'] ?? 0) -
      (DISPOSITION_RANK[x.current_state?.disposition ?? 'unknown'] ?? 0);
    if (d !== 0) return d;
    return (PRIORITY_RANK[y.priority ?? 'low'] ?? 0) - (PRIORITY_RANK[x.priority ?? 'low'] ?? 0);
  })[0];
}

/** A stakeholder who is the gate but not yet in the room — the multithread target. */
function pickGateStakeholder(a: PrepArtifact): StakeholderStrategy | undefined {
  const ss = asStakeholderArray(a.stakeholder_strategy);
  // Prefer a high-influence skeptic/blocker/unknown — the unresolved approver.
  return ss.find((s) => {
    const disp = s.current_state?.disposition;
    const infl = (s.current_state?.influence_level ?? '').toLowerCase();
    return (disp === 'skeptic' || disp === 'blocker' || disp === 'unknown') && /high|exec|final/.test(infl);
  });
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function cleanDoItem(item?: string): string {
  if (!item) return '';
  return item.replace(/\s+/g, ' ').trim();
}

/** Short cycle-stage label, grounded in posture + the kind of top risk. */
function deriveStage(a: PrepArtifact, risk?: CriticalRisk): string {
  const posture = a.top_line?.posture;
  const t = riskText(risk);
  if (/sign-?off|approval|board|parent|cfo|finance|committee/i.test(t)) return 'Decision stage — approval gated';
  if (TIMELINE_RE.test(t)) return 'Late stage — implementation in scope';
  if (posture === 'at_risk') return 'At risk — commitment lapsing';
  if (posture === 'stalled') return 'Stalled — no live next step';
  if (posture === 'advancing') return 'Advancing toward the next gate';
  return 'Active';
}

/**
 * Select the single channeled move for a deal. The classifier is transparent:
 *   1. Top risk turns on an unreached approver  → MULTITHREAD (through champion)
 *   2. Posture at-risk / lapsing commitment      → CALL (champion, reset the step)
 *   3. Otherwise                                 → EMAIL (arm the champion)
 */
export function deriveNextAction(a: PrepArtifact, dealName: string): NextAction {
  const risk = topRisk(a);
  const champion = pickChampion(a);
  const gate = pickGateStakeholder(a);
  const posture = a.top_line?.posture;
  const cycleStage = deriveStage(a, risk);
  const evidenceIds = risk?.evidence_ids ?? [];
  const championName = champion?.stakeholder_name ?? 'your champion';
  const championFirst = firstName(championName);
  const championRole = champion?.role;
  const move = cleanDoItem(champion?.do_list?.[0]) || cleanDoItem(risk?.recommended_posture);

  const ebGate = MULTITHREAD_RE.test(riskText(risk));

  const base = {
    evidenceIds,
    executable: false,
    executionNote: 'No channel connected — governed execution lands here in a later phase.',
  };

  const prepNote = move || undefined;
  const gatePhrase = extractGate(a, risk);
  const concern = extractConcern(risk);
  const approver = extractApprover(risk);

  // 1. Multithread — the deal is gated on an approver who isn't engaged.
  if (ebGate) {
    const reach =
      approver ??
      (gate?.stakeholder_name
        ? `${gate.stakeholder_name}${gate.role ? ` (${gate.role})` : ''}`
        : 'the approver who holds sign-off');
    return {
      ...base,
      channel: 'multithread',
      title: `Multithread to ${approver ?? gate?.stakeholder_name ?? 'the approving authority'} through ${championFirst}`,
      target: { name: championName, role: championRole },
      cycleStage,
      stageRationale: `The deal can't close without ${reach}, and there's no relationship there yet. Use ${championFirst} to get into that room before the gate.`,
      prepNote,
      draft: {
        subject: `Quick intro before the ${gatePhrase ?? 'review'}?`,
        body:
          `${championFirst} — before this goes in front of ${reach}, I'd like 20 minutes with them directly ` +
          `so we aren't a stranger when they review. Right now we're a name on a slide to them, and that's ` +
          `exactly where deals like this stall. I'll keep it short and tailored to what they'll need to sign off. ` +
          `Can you introduce me, or get me into the next review?`,
      },
    };
  }

  // 2. Call — commitment is lapsing; a written touch won't reset it.
  if (posture === 'at_risk' || posture === 'stalled') {
    return {
      ...base,
      channel: 'call',
      title: `Call ${championFirst} to reset the next concrete step`,
      target: { name: championName, role: championRole },
      cycleStage,
      stageRationale: `Posture has slipped — a written touch won't recover it. Get ${championFirst} on the phone and leave with a dated next step.`,
      talkingPoints: [
        move || 'Confirm the next concrete commitment and put a date on it.',
        risk?.title ? `Surface the open risk directly: ${risk.title}.` : 'Surface the open risk directly.',
        'Leave the call with one owned action and a date.',
      ].filter(Boolean),
    };
  }

  // 3. Email — deal is advancing; arm the champion for the gate ahead.
  const holdoutStk = pickGateStakeholder(a);
  const holdout = holdoutStk ? firstName(holdoutStk.stakeholder_name) : undefined;
  const gateLabel = gatePhrase ? `the ${gatePhrase}` : 'the next step';
  const concernClause = concern ? `a ${concern}` : 'everything you need from our side';
  return {
    ...base,
    channel: 'email',
    title: `Email ${championFirst} to arm them for ${gatePhrase ?? 'the next gate'}`,
    target: { name: championName, role: championRole },
    cycleStage,
    stageRationale: `${championFirst} is carrying this internally. Give them what they need to clear ${gateLabel} without you in the room.`,
    prepNote,
    draft: {
      subject: gatePhrase ? `Ahead of the ${gatePhrase}` : `Ahead of the next step on ${dealName}`,
      body:
        `${championFirst} — ahead of ${gateLabel}, I want to make sure you walk in with ${concernClause} ` +
        `you can take straight into the room. I'm pulling the detail together now and will get it to you before then. ` +
        (holdout
          ? `If ${holdout} raises specific questions after the review, send them over and I'll make sure the plan answers them head-on.`
          : `Tell me the two or three things you expect to get pushed on and I'll get you tight, defensible answers fast.`),
    },
  };
}
