/**
 * ============================================================================
 *  Execution Agent Validator — Pass 4 (Execution Layer)
 * ============================================================================
 *
 *  RESPONSIBILITY SPLIT:
 *
 *  Layer A (THIS FILE) — structural validation
 *    - Shape, types, enum membership, required fields
 *    - Array cardinality (required-array doctrine + carve-outs)
 *    - Catches: malformed output, missing fields, wrong enum values,
 *      required arrays that came back empty
 *
 *  Layer B (FUTURE FILE — not yet implemented) — integrity validation
 *    1. evidence_ids resolve to real intelligence record IDs in the input
 *    2. top_line.posture equals input.opportunity.deal_posture.status
 *    3. stakeholder_strategy[].stakeholder_id resolves to a known
 *       stakeholder AND its disposition mirrors Pass 2 stakeholder_enrichments
 *    4. critical_risks[].source_conflict_evidence_ids resolve to Pass 2
 *       IntelligenceConflict records
 *    5. meeting_id (when present in metadata) references a real future
 *       meeting on the input
 *
 *  Layer A passes ≠ output is correct. Layer B is the cross-reference
 *  layer and is required before any artifact ships to a rep surface.
 *  Do not add Layer B checks to this file — they belong in
 *  execution-agent-integrity.ts (TBD).
 *
 *  REQUIRED-ARRAY DOCTRINE (from contract header):
 *    - open_questions: [] valid (no decision blockers)
 *    - what_changed: omit entirely if no material change
 *    - all other required arrays: min 1
 *
 *  METADATA OWNERSHIP:
 *    Runner-owned (optional in Layer A — runner stamps post-generation):
 *      generated_at, prompt_version, model, opportunity_id,
 *      consumed_intelligence_version, usage, latency_ms, attempts
 *    Model-owned (required where contract requires):
 *      surface_mode, rationale (opt), insufficiently_evidenced (opt)
 * ============================================================================
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Metadata
// ────────────────────────────────────────────────────────────────────────────

const SurfaceModeSchema = z.enum(['full', 'gaps_only', 'executive']);

const DealAltitudeSchema = z.enum([
  'stakeholder',
  'committee',
  'commercial',
  'governance',
]);

const PrepArtifactMetadataSchema = z.object({
  generated_at: z.string().optional(),
  prompt_version: z.string().optional(),
  model: z.string().optional(),
  opportunity_id: z.string().optional(),
  surface_mode: SurfaceModeSchema,
  consumed_intelligence_version: z.string().optional(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }).optional(),
  latency_ms: z.number().optional(),
  attempts: z.number().optional(),
  rationale: z.string().optional(),
  insufficiently_evidenced: z.array(
    z.object({
      field_path: z.string(),
      reason: z.string(),
    })
  ).optional(),
  declared_altitude: DealAltitudeSchema.nullable().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Top line
// ────────────────────────────────────────────────────────────────────────────

const DealPostureSchema = z.enum([
  'advancing', 'stalled', 'at_risk', 'indeterminate',
]);

const TopLineSchema = z.object({
  text: z.string(),
  posture: DealPostureSchema,
  evidence_ids: z.array(z.string()).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Deal thesis — discriminated union; sole evidence_ids carve-out
//
// formed: thesis + decision_frame + why_this_matters + non-empty evidence_ids
// indeterminate: confidence pinned to "low", evidence_ids must be [],
//                required_evidence_to_form_thesis 2..5 items.
// ────────────────────────────────────────────────────────────────────────────

const DealThesisFormedSchema = z.object({
  status: z.literal('formed'),
  thesis: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']),
  decision_frame: z.string().min(1),
  why_this_matters: z.string().min(1),
  evidence_ids: z.array(z.string()).min(1),
});

const DealThesisIndeterminateSchema = z.object({
  status: z.literal('indeterminate'),
  confidence: z.literal('low'),
  evidence_ids: z.array(z.string()).max(0), // must be empty
  indeterminate_reason: z.string().min(1),
  required_evidence_to_form_thesis: z.array(z.string()).min(2).max(5),
});

const DealThesisSchema = z.discriminatedUnion('status', [
  DealThesisFormedSchema,
  DealThesisIndeterminateSchema,
]);

// ────────────────────────────────────────────────────────────────────────────
// What changed (optional; if present, changes[] min 1)
// ────────────────────────────────────────────────────────────────────────────

const ChangeKindSchema = z.enum([
  'new_stakeholder',
  'position_change',
  'commercial_change',
  'process_change',
  'external_signal',
  'other',
]);

const WhatChangedItemSchema = z.object({
  kind: ChangeKindSchema,
  description: z.string(),
  evidence_ids: z.array(z.string()).min(1),
});

const WhatChangedSchema = z.object({
  summary: z.string(),
  changes: z.array(WhatChangedItemSchema).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Critical risks
// ────────────────────────────────────────────────────────────────────────────

const RiskSeveritySchema = z.enum(['blocking', 'high', 'medium']);

const CriticalRiskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  failure_mode: z.string(),
  trigger: z.string(),
  in_call_signal: z.string(),
  recommended_posture: z.string(),
  severity: RiskSeveritySchema,
  source_conflict_evidence_ids: z.array(z.string()).min(1).optional(),
  evidence_ids: z.array(z.string()).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Stakeholder strategy
// ────────────────────────────────────────────────────────────────────────────

const StakeholderDispositionSchema = z.enum([
  'champion',
  'supporter',
  'neutral',
  'skeptic',
  'blocker',
  'unknown',
]);

const StakeholderCurrentStateSchema = z.object({
  disposition: StakeholderDispositionSchema.optional(),
  disposition_rationale: z.string().optional(),
  engagement_level: z.string().optional(),
  influence_level: z.string().optional(),
});

const StakeholderPrioritySchema = z.enum(['high', 'medium', 'low']);

const StakeholderStrategySchema = z.object({
  stakeholder_id: z.string(),
  stakeholder_name: z.string(),
  role: z.string(),
  current_state: StakeholderCurrentStateSchema,
  call_strategy: z.string(),
  do_list: z.array(z.string()).min(1),
  dont_list: z.array(z.string()).optional(),
  priority: StakeholderPrioritySchema.optional(),
  relevance: z.string().optional(),
  engagement_tier: z.enum(['engaged', 'needs_engaging', 'watch']).optional(),
  evidence_ids: z.array(z.string()).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Commercial reality (optional; populate only on late-stage deals)
// ────────────────────────────────────────────────────────────────────────────

const AskFirmnessSchema = z.enum(['hard', 'stated', 'soft']);

const CommercialAskSchema = z.object({
  category: z.string(),
  customer_position: z.string(),
  your_flexibility: z.string(),
  firmness: AskFirmnessSchema,
  evidence_ids: z.array(z.string()).min(1),
});

const PriorConcessionSchema = z.object({
  description: z.string(),
  evidence_ids: z.array(z.string()).min(1),
});

const CommercialRealitySchema = z.object({
  situation_summary: z.string(),
  asks: z.array(CommercialAskSchema).min(1),
  walk_in_posture: z.string(),
  prior_concessions: z.array(PriorConcessionSchema).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Talk track
// ────────────────────────────────────────────────────────────────────────────

const TalkTrackQuestionSchema = z.object({
  question: z.string(),
  rationale: z.string(),
  evidence_ids: z.array(z.string()).min(1),
});

const ObjectionAngleSchema = z.object({
  likely_objection: z.string(),
  handling_angle: z.string(),
  evidence_ids: z.array(z.string()).min(1),
});

const TalkTrackSchema = z.object({
  opening_angle: z.string(),
  opening_rationale: z.string().min(1),
  key_questions: z.array(TalkTrackQuestionSchema).min(1),
  objection_angles: z.array(ObjectionAngleSchema).min(1),
  positioning_angles: z.array(z.string()).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Open questions ([] allowed — carve-out)
// ────────────────────────────────────────────────────────────────────────────

const QuestionUrgencySchema = z.enum(['blocking', 'high', 'medium']);

const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  why_it_matters: z.string(),
  urgency: QuestionUrgencySchema,
  blocks_decision: z.boolean(),
  how_to_ask: z.string().optional(),
  evidence_ids: z.array(z.string()).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Success criteria
// ────────────────────────────────────────────────────────────────────────────

const SuccessOutcomeSchema = z.object({
  outcome: z.string(),
  why_it_matters: z.string(),
});

const SuccessCriteriaSchema = z.object({
  summary: z.string(),
  outcomes: z.array(SuccessOutcomeSchema).min(1),
  acceptable_partial: z.string().optional(),
  failure_signal: z.string().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Coaching notes
// ────────────────────────────────────────────────────────────────────────────

const CoachingTopicSchema = z.enum([
  'discovery_depth',
  'stakeholder_coverage',
  'qualification_gap',
  'methodology_discipline',
  'pacing',
  'general',
]);

const CoachingNoteSchema = z.object({
  topic: CoachingTopicSchema,
  note: z.string(),
  evidence_ids: z.array(z.string()).min(1),
});

// ────────────────────────────────────────────────────────────────────────────
// Top-level PrepArtifact
// ────────────────────────────────────────────────────────────────────────────

const PostCallSynthesisSchema = z.object({
  last_interaction_id: z.string().min(1),
  last_interaction_label: z.string().min(1),
  what_surfaced: z.array(z.string().min(1)).min(2).max(4),
  to_think_through: z.array(z.string().min(1)).min(2).max(4),
});

// ── Pre-mortem (situational anticipation) — Layer A schema ──────────────
//
// Layer A enforces: all fields present, correct types, ≤ 3 paths, ranges
// on likelihood/severity, valid enums on signal_source + gap_type. Layer
// B (in execution-agent-integrity.ts) enforces semantic rules the schema
// can't express — causal chain shape, template match on if_no_action,
// no-hedging in forcing_move, ≤1-step ownership, distinct primary_driver,
// staleness check vs. previous artifact.
const PreMortemPathSchema = z.object({
  primary_driver: z.string().min(1),
  actor_name: z.string().min(1),
  signal_source: z.enum(['touch', 'call', 'email']),
  signal_timestamp: z.string().min(1),
  gap_type: z.enum(['unresolved', 'conflict', 'missing_confirmation']),
  failure_path: z.string().min(1),
  if_no_action: z.string().min(1),
  coaching_prompt: z.string().optional(),
  forcing_move: z.string().min(1),
  solvable_pre_event: z.boolean(),
  likelihood: z.number().min(0).max(1),
  severity: z.number().min(0).max(1),
});

const DeliverableItemSchema = z.object({
  label: z.string().min(1),
  detail: z.string().optional(),
  route: z.string().optional(),
});

const DeliverablesSchema = z.object({
  title: z.string().min(1),
  items: z.array(DeliverableItemSchema).min(1).max(5),
});

export const PrepArtifactSchema = z.object({
  metadata: PrepArtifactMetadataSchema,
  top_line: TopLineSchema,
  deliverables: DeliverablesSchema.optional(),
  how_you_win: z.string().min(1).optional(),
  what_could_go_wrong: z.array(z.string().min(1)).max(3).optional(),
  deal_thesis: DealThesisSchema,
  post_call_synthesis: PostCallSynthesisSchema.optional(),
  what_changed: WhatChangedSchema.optional(),
  critical_risks: z.array(CriticalRiskSchema).min(1),
  stakeholder_strategy: z.array(StakeholderStrategySchema).min(1),
  commercial_reality: CommercialRealitySchema.optional(),
  talk_track: TalkTrackSchema,
  open_questions: z.array(OpenQuestionSchema), // [] valid — carve-out
  success_criteria: SuccessCriteriaSchema,
  coaching_notes: z.array(CoachingNoteSchema).min(1),
  pre_mortem_paths: z.array(PreMortemPathSchema).max(3).optional(),
  manager_note: z.string().optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Public surface — mirrors Pass 2 (validateStructure)
// ────────────────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; data: z.infer<typeof PrepArtifactSchema> }
  | { ok: false; errors: string[] };

export function validateExecutionOutput(data: unknown): ValidationResult {
  const result = PrepArtifactSchema.safeParse(data);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });

  return { ok: false, errors };
}
