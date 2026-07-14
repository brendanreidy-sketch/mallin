/**
 * ============================================================================
 *  Execution Agent Output Contract — Pass 4 (Execution Layer)
 * ============================================================================
 *
 *  LAYER MAP:
 *    Pass 1.5: substrate assembly
 *    Pass 2:   Core Intelligence agent (truth)
 *    Pass 3:   applyCoreIntelligence (merge -> ExecutionAgentInput)
 *    Pass 4:   Execution agent (THIS layer — behavior)
 *
 *  Pass 4 consumes Pass 2 TRUTH without modification. It does NOT
 *  reinterpret deal_posture, override pillar status, or revise stakeholder
 *  dispositions.
 *
 *  Pass 4 MUST NOT introduce new facts — only transform existing
 *  intelligence into action.
 *
 *  EVIDENCE DOCTRINE: every claim carries non-empty evidence_ids.
 *
 *  CITATION SURFACE: only records with IDs can be cited.
 *  methodology_pillar_evidence has IDs. metadata.insufficiently_evidenced
 *  is descriptive metadata, not a citation surface.
 *
 *  REQUIRED-ARRAY DOCTRINE: required arrays minItems: 1 with carve-outs:
 *    - open_questions: [] valid (no decision blockers)
 *    - what_changed: omit entirely (no material change)
 *
 *  EVIDENCE_IDS DOCTRINE: empty evidence_ids arrays are forbidden EXCEPT
 *  on deal_thesis when status === "indeterminate". That single carve-out
 *  represents a refusal to infer rather than an unsupported claim — it
 *  is the only permitted empty evidence_ids in this contract.
 * ============================================================================
 */

import type { ExecutionAgentInput } from './execution-agent-input';

export type SurfaceMode = 'full' | 'gaps_only' | 'executive';

/**
 * Altitude the deal-loss gate is currently sitting at. Declared by the
 * rep, not inferred — Dimitrie's diagnosis was that the system reasoned
 * confidently at the wrong altitude (stakeholder when the gate was
 * committee-level), producing specific-but-wrong recommendations.
 *
 * The fix: the rep declares altitude before regen, and the system
 * scopes path generation to that altitude only.
 *
 *   stakeholder — individual actors are the gate (champion, EB, etc.)
 *   committee   — exec / steering / board review is the gate
 *   commercial  — pricing, redlines, procurement terms are the gate
 *   governance  — legal, security, compliance are the gate
 */
export type DealAltitude =
  | 'stakeholder'
  | 'committee'
  | 'commercial'
  | 'governance';

export interface PrepArtifactMetadata {
  generated_at: string;
  prompt_version: string;
  model: string;
  opportunity_id: string;
  surface_mode: SurfaceMode;
  consumed_intelligence_version?: string;
  usage?: { input_tokens: number; output_tokens: number };
  latency_ms?: number;
  attempts?: number;
  rationale?: string;
  insufficiently_evidenced?: Array<{ field_path: string; reason: string }>;
  /** The altitude declared by the rep at regen time. Audit-trail only —
   *  pre-mortem path generation is constrained to this altitude. Null
   *  means the system inferred altitude from substrate (legacy behavior
   *  pre-altitude-declaration; left in place for backwards compat). */
  declared_altitude?: DealAltitude | null;
}

export type DealPosture = 'advancing' | 'stalled' | 'at_risk' | 'indeterminate';

export interface TopLine {
  text: string;
  posture: DealPosture;
  evidence_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// DEAL THESIS — controlling decision frame (interpretation, not new fact)
//
// The thesis is Pass 4's read of the most likely decision frame the buyer
// is using. It is INTERPRETIVE SYNTHESIS over Pass 2 records — not a new
// fact. RULE 0 (no new facts) is preserved: every thesis cites the Pass 2
// intelligence it synthesizes from.
//
// CARVE-OUT: indeterminate is the SOLE permitted empty-evidence_ids case
// in this contract — it represents a refusal to infer rather than an
// unsupported claim. All other empty evidence_ids remain forbidden.
//
// Indeterminate confidence is pinned to "low" — medium/high indeterminate
// is incoherent (you cannot be confident in the absence of a thesis).
// ────────────────────────────────────────────────────────────────────────────

export type DealThesisConfidence = 'low' | 'medium' | 'high';

export interface DealThesisFormed {
  status: 'formed';
  thesis: string;                       // ≤ 280 chars
  confidence: DealThesisConfidence;
  decision_frame: string;               // ≤ 140 chars
  why_this_matters: string;             // ≤ 280 chars
  evidence_ids: string[];               // min 1
}

export interface DealThesisIndeterminate {
  status: 'indeterminate';
  confidence: 'low';                    // pinned
  evidence_ids: [];                     // doctrinal carve-out
  indeterminate_reason: string;         // ≤ 240 chars
  required_evidence_to_form_thesis: string[]; // min 2, max 5
}

export type DealThesis = DealThesisFormed | DealThesisIndeterminate;

export type ChangeKind =
  | 'new_stakeholder'
  | 'position_change'
  | 'commercial_change'
  | 'process_change'
  | 'external_signal'
  | 'other';

export interface WhatChangedItem {
  kind: ChangeKind;
  description: string;
  evidence_ids: string[];
}

export interface WhatChanged {
  summary: string;
  changes: WhatChangedItem[];
}

export type RiskSeverity = 'blocking' | 'high' | 'medium';

export interface CriticalRisk {
  id: string;
  title: string;
  description: string;
  failure_mode: string;
  trigger: string;
  in_call_signal: string;
  recommended_posture: string;
  severity: RiskSeverity;
  source_conflict_evidence_ids?: string[];
  evidence_ids: string[];
}

export type StakeholderDisposition =
  | 'champion'
  | 'supporter'
  | 'neutral'
  | 'skeptic'
  | 'blocker'
  | 'unknown';

export interface StakeholderCurrentState {
  /** Bare enum value. MUST mirror Pass 2 stakeholder_enrichments[].disposition
   *  exactly. Do not annotate — use disposition_rationale for nuance. */
  disposition?: StakeholderDisposition;

  /** Optional ≤ 160 chars. One-line context for the disposition (e.g.
   *  "verbally positive but no internal advocacy observed"). Keeps the
   *  disposition field machine-clean while preserving human nuance. */
  disposition_rationale?: string;

  engagement_level?: string;
  influence_level?: string;
}

export interface StakeholderStrategy {
  stakeholder_id: string;
  stakeholder_name: string;
  role: string;
  current_state: StakeholderCurrentState;
  call_strategy: string;
  do_list: string[];
  dont_list?: string[];
  priority?: 'high' | 'medium' | 'low';
  evidence_ids: string[];

  /** One plain-spoken line, rep voice, on why this person matters to the
   *  deal RIGHT NOW — rendered in the cockpit's stakeholder engagement map
   *  (e.g. "the review runs through him, and you've never spoken"). ≤ 120
   *  chars. Optional: absent on legacy artifacts, where the render falls
   *  back to the role label. */
  relevance?: string;

  /** Engagement-tier JUDGMENT. Engaged vs needs-engaging is otherwise
   *  DERIVED from call attendance in the render (deterministic), so the
   *  agent only sets this to flag 'watch' — a stakeholder who is
   *  peripheral or not-yet-active (e.g. an incoming hire) and should not
   *  be treated as a gap to close. When set, it wins over the derived
   *  tier. Absent = let the render derive from attendance. */
  engagement_tier?: 'engaged' | 'needs_engaging' | 'watch';
}

export type AskFirmness = 'hard' | 'stated' | 'soft';

export interface CommercialAsk {
  category: string;
  customer_position: string;
  your_flexibility: string;
  firmness: AskFirmness;
  evidence_ids: string[];
}

export interface PriorConcession {
  description: string;
  evidence_ids: string[];
}

export interface CommercialReality {
  situation_summary: string;
  asks: CommercialAsk[];
  walk_in_posture: string;
  prior_concessions?: PriorConcession[];
}

export interface TalkTrackQuestion {
  question: string;
  rationale: string;
  evidence_ids: string[];
}

export interface ObjectionAngle {
  likely_objection: string;
  handling_angle: string;
  evidence_ids: string[];
}

export interface TalkTrack {
  opening_angle: string;
  /**
   * One-sentence "because" tied directly to deal_thesis.decision_frame
   * or critical_risks[0]. Forces the model to connect the primary action
   * to the deal-level reason it matters. Rendered as a "Because:" block
   * beneath the primary action in the prep view.
   */
  opening_rationale: string;
  key_questions: TalkTrackQuestion[];
  objection_angles: ObjectionAngle[];
  positioning_angles?: string[];
}

export type QuestionUrgency = 'blocking' | 'high' | 'medium';

export interface OpenQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  urgency: QuestionUrgency;
  blocks_decision: boolean;
  how_to_ask?: string;
  evidence_ids: string[];
}

export interface SuccessOutcome {
  outcome: string;
  why_it_matters: string;
}

export interface SuccessCriteria {
  summary: string;
  outcomes: SuccessOutcome[];
  acceptable_partial?: string;
  failure_signal?: string;
}

export type CoachingTopic =
  | 'discovery_depth'
  | 'stakeholder_coverage'
  | 'qualification_gap'
  | 'methodology_discipline'
  | 'pacing'
  | 'general';

export interface CoachingNote {
  topic: CoachingTopic;
  note: string;
  evidence_ids: string[];
}

/**
 * PostCallSynthesis — written AFTER each external touch, BEFORE the next-call
 * prep. Two distinct surfaces:
 *
 *   - what_surfaced[]: 2-4 bullets of the most consequential NEW information,
 *     signal, or shift from the most recent call/email. Not a recap of the
 *     deal — only what changed in the latest interaction.
 *
 *   - to_think_through[]: 2-4 bullets of internal team / rep questions to
 *     resolve BEFORE the next external touch. Distinct from open_questions
 *     (which are buyer-facing decision blockers). These are the "pause and
 *     discuss with the manager / SE / pricing team" items.
 *
 * Optional because some deals have only one touch and no synthesis is
 * meaningful yet. When omitted, the prep view simply doesn't render the
 * section.
 */
export interface PostCallSynthesis {
  /** ID of the call/email this synthesis anchors to (the most recent
   *  interaction in substrate). Resolves against input.activities[].id or
   *  input.calls[].id. */
  last_interaction_id: string;
  /** Plain-language label of the last interaction, for the rep's quick
   *  orientation (e.g. "Mar 30 best-and-final review"). */
  last_interaction_label: string;
  what_surfaced: string[];
  to_think_through: string[];
}

/**
 * Pre-mortem path — situational anticipation layer.
 *
 * Each path describes *one* concrete way the next event could fail,
 * grounded in substrate evidence, with one binary forcing move that
 * the rep can execute before the event. The whole concept is bounded:
 * max 3 paths, each driven by a distinct primary actor or constraint.
 *
 * Hard contracts enforced by Layer A/B + pre-render filter:
 *   - evidence floor (actor + source + timestamp + gap_type)
 *   - causal chain (X → Y → Z) in failure_path
 *   - if_no_action follows strict template
 *   - forcing_move is rep-owned, ≤1 step, no hedging
 *   - solvable_pre_event = true (else dropped)
 *   - distinct primary_driver per path (no overlap)
 *   - delta vs. previous artifact (filter stale repetition)
 */
export type SignalSource = 'touch' | 'call' | 'email';
export type GapType =
  | 'unresolved'
  | 'conflict'
  | 'missing_confirmation';

export interface PreMortemPath {
  /** Stable key for de-duplication: typically the actor's stakeholder id,
   *  or a constraint key (e.g. "procurement", "legal"). At most one
   *  path per primary_driver across the artifact. */
  primary_driver: string;
  /** Display name for the path's driving actor. */
  actor_name: string;
  /** Where the supporting signal came from in substrate. */
  signal_source: SignalSource;
  /** ISO timestamp of the most recent supporting signal. Drives recency
   *  decay in ranking and tie-breaking. */
  signal_timestamp: string;
  /** Why this is a path: what's unresolved, in conflict, or unconfirmed. */
  gap_type: GapType;

  /** One-sentence causal chain — must read as X → Y → Z to deal-level
   *  consequence, not just "risk labeling". */
  failure_path: string;
  /** Strict template: "If you do nothing: [actor] X → [next actor] Y →
   *  [deal outcome Z]." Free prose fails Layer B. */
  if_no_action: string;

  /** Coaching prompt — perspective-take that puts the rep in the buyer's
   *  seat using plain-language constraints, then asks an open strategic
   *  question. Used to layer ownership/adaptability on top of the
   *  declarative failure_path/if_no_action. Optional for backward compat
   *  with artifacts produced before the coaching layer was added. */
  coaching_prompt?: string;
  /** ≤1-step move the rep can execute before the event. No hedging
   *  language ("consider", "might help"). Rep-owned, not "team" or
   *  "stakeholders". */
  forcing_move: string;
  /** Asserted by the model and re-validated by Layer B. False ⇒ path
   *  is dropped pre-render. */
  solvable_pre_event: boolean;

  /** 0–1, model-estimated. Recency decay applied at rank time. */
  likelihood: number;
  /** 0–1, deal-progression impact (not stakeholder-volume noise). */
  severity: number;
}

/** One concrete thing the decision-maker is waiting on before they can
 *  decide. Rendered as a tickable row in the cockpit's deliverables
 *  checklist. Rep voice — a thing you send/produce, not a task label. */
export interface DeliverableItem {
  /** The deliverable itself, plainly (e.g. "Revised price + one-paragraph
   *  rationale"). ≤ 90 chars. */
  label: string;
  /** Optional qualifier shown muted after the label (e.g. "vs Vantage
   *  $52K", "controls now, ledger later"). ≤ 60 chars. */
  detail?: string;
  /** Optional route — who it goes to / runs through (e.g. "Sanjay,
   *  security"). Rendered as "→ {route}". ≤ 40 chars. */
  route?: string;
}

/** The "what {buyer} is waiting on before they decide" checklist. A short,
 *  closeable list of the concrete deliverables standing between now and a
 *  decision. Optional: absent on early-stage / first-touch deals where
 *  there is no crisp decision-blocking list yet. */
export interface Deliverables {
  /** Header line, buyer-anchored (e.g. "What Dana's waiting on before she
   *  decides"). ≤ 80 chars. */
  title: string;
  /** 1–5 items. Ordered by what to send first. */
  items: DeliverableItem[];
}

export interface PrepArtifact {
  metadata: PrepArtifactMetadata;
  top_line: TopLine;
  /** The decision-blocking deliverables checklist. Optional — renders at
   *  the top of the cockpit when present; omitted on deals with no crisp
   *  "waiting on" list yet. */
  deliverables?: Deliverables;
  /** The ONE strategic play that closes this deal — the positioning or move
   *  that resolves the decision. Plain rep voice, ≤ 200 chars. Distinct from
   *  talk_track.opening_angle (a tactic for THIS call) and from deal_thesis
   *  (the buyer's frame). Optional: omit when no single win condition is
   *  visible in substrate. Renders as the "How you win this" block. */
  how_you_win?: string;
  /** Silent-killer risks — 1–3 ways the deal could quietly die WITHOUT a
   *  red flag showing up in calls or emails. Each names the hidden mechanism,
   *  not just the outcome. Distinct from critical_risks (active, observable).
   *  Plain rep voice. Optional: omit when none are visible. Renders as the
   *  "What could go wrong" block. */
  what_could_go_wrong?: string[];
  /** Controlling decision frame for this deal. Required. Status is either
   *  "formed" (thesis + evidence) or "indeterminate" (no thesis, with
   *  required_evidence_to_form_thesis listing what would change that). */
  deal_thesis: DealThesis;
  /** Synthesis of the most recent external touch — what surfaced + what to
   *  think through internally. Optional: omit on first-touch deals where
   *  there is no prior interaction to wrap. */
  post_call_synthesis?: PostCallSynthesis;
  what_changed?: WhatChanged;
  critical_risks: CriticalRisk[];
  stakeholder_strategy: StakeholderStrategy[];
  commercial_reality?: CommercialReality;
  talk_track: TalkTrack;
  open_questions: OpenQuestion[];
  success_criteria: SuccessCriteria;
  coaching_notes: CoachingNote[];
  /** Situational ANTICIPATION layer — max 3 distinct paths, each bound
   *  to a concrete upcoming event. Optional during model rollout — when
   *  absent or empty, the section doesn't render. */
  pre_mortem_paths?: PreMortemPath[];
  /** Manager-level coaching note. RVP/manager guidance that doesn't belong
   *  inside a single path — typically about exec-to-exec alignment, escalation
   *  patterns, or stage-gate handoffs. Optional; renders as a small callout
   *  when present. */
  manager_note?: string;
}

export interface ExecutionAgentRequest {
  enriched_input: ExecutionAgentInput;
  config: {
    model?: string;
    surface_mode?: SurfaceMode;
    max_critical_risks?: number;
    max_stakeholder_strategies?: number;
    max_talk_track_questions?: number;
    max_open_questions?: number;
    playbook_style?: 'default';
    max_intelligence_items?: number;
    include_full_transcripts?: boolean;
    /** Rep-declared deal-loss gate altitude. When set, the agent
     *  scopes pre_mortem_paths to this altitude only — no
     *  individual-actor paths on a committee-gated deal, no
     *  committee paths on a stakeholder-gated deal. Null = legacy
     *  inference behavior. */
    declared_altitude?: DealAltitude | null;
  };
}

export interface ExecutionAgent {
  execute(request: ExecutionAgentRequest): Promise<PrepArtifact>;
}
