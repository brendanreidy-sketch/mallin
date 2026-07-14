/**
 * ============================================================================
 *  Rep Behavior Contract — Coaching Layer 1 (extraction)
 * ============================================================================
 *
 *  LAYER MAP — where this fits:
 *    Pass 1.5: substrate assembly
 *    Pass 2:   Core Intelligence (BUYER-side truth — pain, EB, criteria)
 *    Pass 2c:  THIS LAYER — Rep Behavior extraction (SELLER-side truth)
 *    Pass 3:   merge
 *    Pass 4:   Execution agent (rep-facing prep artifact)
 *    Pass 5+:  coaching synthesis (layers 2/3 — out of scope here)
 *
 *  STATUS — V0 (extraction-only, no aggregation):
 *    Contract + Zod validator + Anthropic tool schema + agent + runner.
 *    Per-call/email rep-behavior extraction. No cross-call aggregation,
 *    no scoring, no playbooks. Layer A structural validation only —
 *    integrity (Layer B: substrate cross-reference) deferred until
 *    extraction quality is proven on real deals.
 *
 *  DOCTRINE:
 *
 *    1. Coach behaviors, NEVER grade people.
 *       Output is "the rep missed an opportunity to anchor the buyer's
 *       concern to decision timing on the Apr 22 call."
 *       NOT "this rep is weak at discovery."
 *       Behaviors are observable. Rep-quality judgments are not. The
 *       system surfaces moments, the manager decides about people.
 *
 *    2. Behaviors are observed in the substrate, not invented.
 *       Every signal cites a specific transcript moment or email passage
 *       with a verbatim quote. No quote → no signal. This is RULE 0 from
 *       the Pass 4 contract applied symmetrically to seller-side truth.
 *
 *    3. Strengths AND missed opportunities are both first-class.
 *       The system extracts both. A downstream coaching layer can use a
 *       rep's own strong moments on prior calls as the coaching pattern
 *       for their weak moments today. The system is built from OBSERVED
 *       winning behaviors — not generic sales advice.
 *
 *    4. Outcome linkage is optional, typed, and load-bearing.
 *       outcome_linkage names a downstream substrate event traceably
 *       resulting from the behavior. Four types, in increasing weight:
 *
 *         micro_commitment   — buyer agreed to a next step in-call/email
 *                              (intro committed, follow-up dated, etc.)
 *         stage_progression  — opportunity advanced stage in CRM
 *         closed_won         — deal closed won
 *         closed_lost        — deal closed lost (negative linkage —
 *                              missed-opportunity signals can cite this)
 *
 *       Most in-flight signals will have outcome_linkage undefined
 *       because the outcome hasn't materialized yet — that is honest,
 *       not weak. Inventing a linkage is a more dangerous fabrication
 *       than inventing a buyer-side fact: it implies a rep's job
 *       performance is tied to a thing that didn't happen.
 *
 *       Stage progression counts because it's an observable substrate
 *       event, but it is named distinctly so the system does not
 *       overclaim "deal won because of this rep move."
 *
 *    5. "No signal" is a valid output.
 *       If a rep was on a call but produced no behavior worth surfacing
 *       (good or missed), emit signals=[] AND log a diagnostic entry
 *       naming the rep_id and the reason. Empty signals[] WITHOUT a
 *       diagnostic is masking, not honesty.
 *
 *    6. Person-grade language is a warning, not a rejection (initially).
 *       The system MUST emit observed behavior, never trait judgments.
 *       But the validator should NOT block "weak at discovery" —type
 *       output during early iteration; instead, surface it via
 *       metadata.quality_warnings[] so we can see the failure mode
 *       in real output and tune. Promote to blocking once the common
 *       offenders are obvious and stable.
 *
 *  EVIDENCE DOCTRINE:
 *    Every signal carries non-empty evidence_ids pointing to substrate
 *    intelligence records. No carve-outs in this file. The indeterminate
 *    case is "no signals + diagnostic" — not "signal with empty
 *    evidence_ids."
 *
 *  WHAT IS DELIBERATELY NOT IN THIS FILE:
 *    - Layer 2: coaching pattern library. Needs cross-call / cross-rep
 *      data before it can produce honest patterns. Do not design until
 *      layer 1 is producing real signal on at least 3-5 deals.
 *    - Layer 3: coaching recommendations (gap → pattern matching).
 *      Depends on layer 2.
 *    - Layer 4: RepCoachingArtifact (rep-facing / manager-facing
 *      surface). Depends on 1-3.
 *
 *    Designing those layers before seeing real layer-1 output produces
 *    the exact failure mode the deal_thesis indeterminate carve-out
 *    exists to prevent: confident structure with no ground truth
 *    underneath.
 * ============================================================================
 */

// ────────────────────────────────────────────────────────────────────────────
// CORE TYPES
// ────────────────────────────────────────────────────────────────────────────

export type RepBehaviorValence = 'strength' | 'missed_opportunity';

/**
 * Loose taxonomy. Categorizes the area of selling motion the behavior
 * lives in. `other` is allowed for behaviors that don't fit cleanly —
 * specificity lives in behavior_name, not category.
 */
export type RepBehaviorCategory =
  | 'discovery'           // pain anchoring, open-ended questions, listening, follow-up
  | 'stakeholder'         // mapping, multi-threading, EB activation, champion building
  | 'framing'             // decision elevation, alternative anchoring, frame-setting
  | 'commercial'          // negotiation move, concession discipline, walk-away posture
  | 'objection_handling'  // reframe, isolate, evidence-anchored response
  | 'forcing_function'    // timeline pressure, deadline anchoring, urgency creation
  | 'narrative'           // deal-state articulation, why-now framing, deal storytelling
  | 'internal_alignment'  // equipping the buyer to sell internally — distinct from
                          // stakeholder (who is on the deal) and framing (how to position
                          // externally). Examples:
                          //   strength: "asks champion what they need to take this to CFO"
                          //   strength: "co-builds the internal business case with champion"
                          //   missed:   "ends call without confirming who owns internal pitch"
                          //   missed:   "leaves demo value as features instead of CFO-ready
                          //              narrative the champion can repeat"
  | 'other';

/**
 * Strength of the signal — how load-bearing it is for downstream coaching.
 *
 *   strong   = unambiguous, repeatable pattern. Manager-grade.
 *   moderate = clear but context-dependent. Useful but cite carefully.
 *   weak     = inferred / single-instance. Surface but don't anchor a
 *              coaching recommendation on it alone.
 */
export type RepBehaviorStrength = 'strong' | 'moderate' | 'weak';

/**
 * Deal stage at the time the behavior was observed. Mirrors the
 * canonical stage taxonomy validated by the harness (compare-runs.ts /
 * compare-pass4.ts). Stage detection is the most-validated dimension
 * across N=5+ deals — pinning behaviors to stage is the primary
 * coaching unlock: "good move at evaluation; missed move at approval"
 * is more actionable than "good move at some point."
 */
export type DealStageAtBehavior =
  | 'discovery'
  | 'evaluation'
  | 'approval'
  | 'execution'
  | 'unknown';

/**
 * One observed rep behavior — either a strength or a missed opportunity.
 * Always traceable to a specific moment in the substrate.
 */
export interface RepBehaviorSignal {
  id: string;

  /** Internal participant ID — the rep this signal is about.
   *  Resolves to substrate.internal_participants[].id. */
  rep_id: string;

  /** strength = the rep executed a behavior well.
   *  missed_opportunity = the moment was there; the rep didn't take it.
   *  Both are first-class — coaching uses both. */
  valence: RepBehaviorValence;

  /** Where in the selling motion this behavior lives. */
  category: RepBehaviorCategory;

  /**
   * Specific behavior pattern name (≤ 140 chars). Concrete enough that
   * a downstream layer can match struggling reps to the same pattern.
   *
   * Examples — strengths:
   *   "Anchored buyer concern to decision timing"
   *   "Reframed technical risk as executive decision risk"
   *   "Surfaced multi-stakeholder requirement unprompted"
   *   "Tied product capability to a stated buyer metric"
   *
   * Examples — missed opportunities:
   *   "Treated integration question as a task, not a decision blocker"
   *   "Did not probe forcing function when buyer named Q3"
   *   "Pitched feature breadth before pain was sized"
   *   "Accepted vague 'we'll loop them in' instead of dated EB commitment"
   */
  behavior_name: string;

  /**
   * Where in the substrate this behavior was observed. Exactly one of
   * call_id or email_id is populated. The verbatim quote is required —
   * if you can't quote it, you didn't observe it.
   */
  source_moment: SourceMoment;

  /**
   * Why this is the behavior named (≤ 280 chars). For strengths: what
   * the move accomplished, why it worked. For missed opportunities:
   * what the move would have accomplished, and what the rep did
   * instead.
   */
  rationale: string;

  /** Load-bearing weight for downstream coaching. */
  strength: RepBehaviorStrength;

  /**
   * Stage of the deal when this behavior occurred. Pinning behaviors to
   * stage transforms "the rep did X" into "the rep did X at approval
   * stage" — which is what makes pattern matching across deals possible
   * later. Use 'unknown' if the call/email predates clear stage signal
   * or sits in an ambiguous transition; do not guess.
   */
  behavior_stage: DealStageAtBehavior;

  /**
   * Optional. Typed linkage to a downstream substrate event traceably
   * resulting from this behavior. Four types, named distinctly so the
   * system does not equate a micro-commitment with a closed-won deal.
   *
   * Most in-flight signals leave this undefined — that is honest, not
   * weak. Setting outcome_linkage without a real downstream substrate
   * record is fabrication.
   *
   * Schema rule (when validator is implemented):
   *   - outcome_linkage absent     →  no claim made (default state)
   *   - outcome_linkage present    →  type required, evidence_ids min 1
   */
  outcome_linkage?: OutcomeLinkage;

  /**
   * Substrate intelligence record IDs supporting the signal itself
   * (the moment of observation). Min 1, no carve-out. If you cannot
   * cite at least one substrate record, you did not observe the
   * behavior — do not emit the signal.
   */
  evidence_ids: string[];
}

/**
 * Typed outcome linkage — observable downstream effect of the behavior,
 * graded by weight. Stage progression is included because it is an
 * observable substrate event, but is named distinctly from closed_won
 * so the system does not overclaim causation.
 *
 * Negative linkage (closed_lost) is permitted and useful for missed-
 * opportunity signals: a missed move on a deal that ultimately lost
 * is a higher-weight coaching moment than one on an in-flight deal.
 */
export interface OutcomeLinkage {
  type: 'micro_commitment' | 'stage_progression' | 'closed_won' | 'closed_lost';
  /** Substrate record IDs proving the outcome event. Min 1 (enforced by
   *  validator when implemented). */
  evidence_ids: string[];
}

/**
 * The verbatim moment in substrate. Either a call moment with a
 * timestamp or an email passage. The quote is mandatory and verbatim —
 * paraphrasing here defeats the citation surface.
 */
export type SourceMoment =
  | {
      kind: 'call_moment';
      call_id: string;
      /** Milliseconds into the call where the moment starts. */
      timestamp_ms: number;
      /** Verbatim quote — ≤ 280 chars. Required. */
      quote: string;
    }
  | {
      kind: 'email_moment';
      email_id: string;
      /** Verbatim passage from the email body or subject — ≤ 280 chars. */
      quote: string;
    };

// ────────────────────────────────────────────────────────────────────────────
// AGENT I/O
// ────────────────────────────────────────────────────────────────────────────

/**
 * Input to the Rep Behavior agent. Reuses the same substrate that Pass 2
 * sees — calls, emails, internal_participants. This contract does not
 * re-fetch or re-shape substrate; it consumes the existing
 * ExecutionAgentInput-ish shape. The exact import is deferred until
 * the agent is implemented.
 */
export interface RepBehaviorAgentInput {
  /** Substrate slice — at minimum the call/email/participant records.
   *  Reference shape, not a new fetch. */
  substrate: {
    calls: Array<{ id: string; [key: string]: unknown }>;
    emails: Array<{ id: string; [key: string]: unknown }>;
    internal_participants: Array<{ id: string; [key: string]: unknown }>;
    /** Optional: substrate intelligence already extracted by Pass 2.
     *  Useful for outcome_linked detection (e.g. linking a rep's strong
     *  framing move to a buyer-side commitment intelligence record). */
    intelligence?: Array<{ id: string; [key: string]: unknown }>;
  };
  /** Restrict extraction to specific reps. Empty = all internal
   *  participants. */
  rep_ids_to_analyze?: string[];
}

export interface RepBehaviorAgentOutput {
  signals: RepBehaviorSignal[];
  /**
   * 1–3 coaching focus items for the rep going forward, derived from
   * the signals on THIS deal. Not aggregated across deals (yet). Each
   * item is a concrete behavior change the rep can make on the next
   * call/email — same doctrine as Pass 4 coaching_notes but anchored
   * to specific signals from this deal's substrate.
   *
   * Empty if no clear coaching focus surfaces (rare — most deals will
   * have at least one missed_opportunity signal worth coaching to).
   * Max 3 items: more than that becomes a list rather than a focus.
   */
  next_coaching_focus: CoachingFocus[];
  metadata: RepBehaviorMetadata;
}

/**
 * One coaching focus item — a behavior change the rep should make on
 * the next interaction with this deal. Anchored to specific signals.
 */
export interface CoachingFocus {
  /** ≤ 200 chars. Imperative voice — the move the rep should make.
   *  Examples:
   *    - "On the next executive call, ask the CFO directly about ROI horizon
   *       before the SE walks through the platform."
   *    - "Before sending the order form, secure dated commitment from the
   *       signer — Greg via Scott — not just verbal alignment from Scott."
   *    - "Stop accepting 'we'll loop them in' as an EB-engagement plan;
   *       require a specific date or escalation path."
   *
   *  NOT acceptable:
   *    - "Improve discovery skills" (trait-level)
   *    - "Be more strategic" (vague)
   */
  focus: string;

  /** ≤ 200 chars. Why this matters for THIS deal — anchored in observed
   *  signals (cite signal_ids in attached_signal_ids). */
  rationale: string;

  /** Which RepBehaviorSignal IDs (typically missed_opportunity ones)
   *  this focus item is responding to. Min 1. */
  attached_signal_ids: string[];
}

export interface RepBehaviorMetadata {
  generated_at: string;
  model: string;
  prompt_version: string;
  rep_ids_analyzed: string[];

  /**
   * Mirrors the Pass 2 / Pass 4 doctrine. When the substrate exists for
   * a rep but no behavior signal is observable (genuinely thin call,
   * rep barely spoke, etc.), emit signals=[] for that rep AND log here.
   *
   * Empty signals[] WITHOUT a corresponding diagnostic entry is
   * masking, not honesty. The validator (when implemented) will reject
   * "every analyzed rep produced zero signals AND no diagnostic" as a
   * masking violation.
   */
  insufficiently_evidenced?: Array<{
    rep_id: string;
    reason: string;
  }>;

  /**
   * Non-blocking issues found in the output. Initially used for doctrine
   * violations that are observed-but-not-yet-rejected — e.g. behavior_name
   * reads as a person-grade trait judgment rather than an observed move.
   *
   * Warnings exist so we can SEE the failure modes during early
   * iteration. As patterns stabilize, the most common offenders graduate
   * into structural validator errors and disappear from this surface.
   */
  quality_warnings?: Array<{
    /** ID of the offending signal, when scoped to one. Omit for
     *  output-level warnings. */
    signal_id?: string;
    /** Stable code so downstream tooling can group / track frequency. */
    code:
      | 'person_judgmental_language'
      | 'thin_evidence'
      | 'overclaimed_outcome'
      | 'category_mismatch'
      | 'other';
    message: string;
  }>;

  usage?: { input_tokens: number; output_tokens: number };
  latency_ms?: number;
  attempts?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// VALIDATOR — Layer A (structural, blocking)
// ────────────────────────────────────────────────────────────────────────────
//
//   Layer A enforces shape + enum + cardinality. Catches malformed
//   output, missing fields, wrong enum values, empty evidence_ids.
//
//   Layer B (integrity / cross-reference against substrate) is
//   deferred — implement once extraction quality is proven on real
//   deals.
//
//   Layer C (doctrine warnings — person-grade judgment language, etc.)
//   is captured as metadata.quality_warnings[] by the agent itself,
//   not the validator. Validator does not block on those during v0.

import { z } from 'zod';

const ValenceSchema = z.enum(['strength', 'missed_opportunity']);
const CategorySchema = z.enum([
  'discovery',
  'stakeholder',
  'framing',
  'commercial',
  'objection_handling',
  'forcing_function',
  'narrative',
  'internal_alignment',
  'other',
]);
const StrengthSchema = z.enum(['strong', 'moderate', 'weak']);
const StageSchema = z.enum([
  'discovery',
  'evaluation',
  'approval',
  'execution',
  'unknown',
]);

const SourceMomentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('call_moment'),
    call_id: z.string().min(1),
    timestamp_ms: z.number().int().nonnegative(),
    quote: z.string().min(1),
  }),
  z.object({
    kind: z.literal('email_moment'),
    email_id: z.string().min(1),
    quote: z.string().min(1),
  }),
]);

const OutcomeLinkageSchema = z.object({
  type: z.enum([
    'micro_commitment',
    'stage_progression',
    'closed_won',
    'closed_lost',
  ]),
  evidence_ids: z.array(z.string()).min(1),
});

const RepBehaviorSignalSchema = z.object({
  id: z.string().min(1),
  rep_id: z.string().min(1),
  valence: ValenceSchema,
  category: CategorySchema,
  behavior_name: z.string().min(1),
  source_moment: SourceMomentSchema,
  rationale: z.string().min(1),
  strength: StrengthSchema,
  behavior_stage: StageSchema,
  outcome_linkage: OutcomeLinkageSchema.optional(),
  evidence_ids: z.array(z.string()).min(1),
});

const CoachingFocusSchema = z.object({
  focus: z.string().min(1),
  rationale: z.string().min(1),
  attached_signal_ids: z.array(z.string()).min(1),
});

const QualityWarningSchema = z.object({
  signal_id: z.string().optional(),
  code: z.enum([
    'person_judgmental_language',
    'thin_evidence',
    'overclaimed_outcome',
    'category_mismatch',
    'other',
  ]),
  message: z.string().min(1),
});

const RepBehaviorMetadataSchema = z.object({
  generated_at: z.string().optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),
  rep_ids_analyzed: z.array(z.string()),
  insufficiently_evidenced: z
    .array(
      z.object({
        rep_id: z.string(),
        reason: z.string(),
      })
    )
    .optional(),
  quality_warnings: z.array(QualityWarningSchema).optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .optional(),
  latency_ms: z.number().optional(),
  attempts: z.number().optional(),
});

export const RepBehaviorAgentOutputSchema = z.object({
  signals: z.array(RepBehaviorSignalSchema),
  next_coaching_focus: z.array(CoachingFocusSchema).max(3),
  metadata: RepBehaviorMetadataSchema,
});

export type RepBehaviorValidationResult =
  | { ok: true; data: RepBehaviorAgentOutput }
  | { ok: false; errors: string[] };

export function validateRepBehaviorOutput(
  output: unknown
): RepBehaviorValidationResult {
  const result = RepBehaviorAgentOutputSchema.safeParse(output);
  if (result.success) {
    return { ok: true, data: result.data as RepBehaviorAgentOutput };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });
  return { ok: false, errors };
}
