/**
 * ============================================================================
 *  Rep Behavior Agent Tool Schema — Pass 2c (extraction layer)
 * ============================================================================
 *
 *  Anthropic tool definition. Forces the model to invoke
 *  emit_rep_behavior with a structured payload matching
 *  RepBehaviorAgentOutput.
 *
 *  EVIDENCE DOCTRINE: every signal carries non-empty evidence_ids
 *  pointing to substrate intelligence records. No carve-outs in this
 *  layer. The "no signals + diagnostic" carve-out is at the OUTPUT
 *  level — signals can be empty, but each individual signal must cite.
 *
 *  COACH-BEHAVIORS-NOT-PEOPLE: the prompt encodes the doctrine; the
 *  schema only allows behavior_name as a string and surfaces
 *  quality_warnings for trait-level language. Layer C (doctrine) is
 *  warning-only during v0.
 * ============================================================================
 */

import type Anthropic from '@anthropic-ai/sdk';

const NON_EMPTY_STRING_ARRAY = {
  type: 'array' as const,
  items: { type: 'string' as const },
  minItems: 1,
};

export const EMIT_REP_BEHAVIOR_TOOL: Anthropic.Tool = {
  name: 'emit_rep_behavior',
  description:
    'Emit rep behavior signals extracted from this deal\'s substrate. ' +
    'Pass 2c MUST cite specific moments — every signal carries verbatim ' +
    'quote + evidence_ids. Coach behaviors, never grade people: behavior_name ' +
    'describes a MOVE the rep made (or failed to make), not a trait. ' +
    'Both strengths and missed_opportunities are first-class. behavior_stage ' +
    'pins each signal to the deal stage at the time of observation. If a ' +
    'rep was on the substrate but produced no surfaceable behavior, emit ' +
    'signals=[] for that rep AND log via metadata.insufficiently_evidenced. ' +
    'next_coaching_focus is 0–3 items derived from THIS deal\'s missed ' +
    'opportunities — concrete, imperative, non-trait.',
  input_schema: {
    type: 'object' as const,
    properties: {
      signals: {
        type: 'array',
        description:
          'Rep behavior signals — strengths AND missed opportunities. ' +
          'Empty array allowed when no behavior is surfaceable; if so, ' +
          'log per-rep diagnostic in metadata.insufficiently_evidenced.',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string', description: 'Stable signal ID, e.g. rbs_001.' },
            rep_id: {
              type: 'string',
              description:
                'Resolves to substrate.internal_participants[].id.',
            },
            valence: {
              type: 'string',
              enum: ['strength', 'missed_opportunity'],
              description:
                'strength = rep executed well. missed_opportunity = moment was there, rep didn\'t take it.',
            },
            category: {
              type: 'string',
              enum: [
                'discovery',
                'stakeholder',
                'framing',
                'commercial',
                'objection_handling',
                'forcing_function',
                'narrative',
                'internal_alignment',
                'other',
              ],
            },
            behavior_name: {
              type: 'string',
              description:
                'Specific behavior pattern name, ≤ 140 chars. Describes a MOVE, not a trait. ' +
                'GOOD: "Anchored buyer concern to decision timing", "Treated integration question as task, not decision blocker". ' +
                'BAD: "Weak at discovery", "Doesn\'t listen", "Great communicator".',
            },
            source_moment: {
              description:
                'The verbatim moment in substrate. Either call_moment (with timestamp_ms) or email_moment.',
              oneOf: [
                {
                  type: 'object' as const,
                  properties: {
                    kind: { type: 'string', enum: ['call_moment'] },
                    call_id: {
                      type: 'string',
                      description: 'Resolves to substrate.calls[].id.',
                    },
                    timestamp_ms: {
                      type: 'number',
                      description: 'Milliseconds into the call.',
                    },
                    quote: {
                      type: 'string',
                      description: 'Verbatim ≤ 280 chars. Required.',
                    },
                  },
                  required: ['kind', 'call_id', 'timestamp_ms', 'quote'],
                  additionalProperties: false,
                },
                {
                  type: 'object' as const,
                  properties: {
                    kind: { type: 'string', enum: ['email_moment'] },
                    email_id: {
                      type: 'string',
                      description: 'Resolves to substrate.emails[].id.',
                    },
                    quote: {
                      type: 'string',
                      description: 'Verbatim passage ≤ 280 chars. Required.',
                    },
                  },
                  required: ['kind', 'email_id', 'quote'],
                  additionalProperties: false,
                },
              ],
            },
            rationale: {
              type: 'string',
              description:
                'Why this is the behavior named, ≤ 280 chars. Strengths: what the move accomplished. Missed: what would have happened if taken, what the rep did instead.',
            },
            strength: {
              type: 'string',
              enum: ['strong', 'moderate', 'weak'],
              description:
                'Load-bearing weight. strong = unambiguous repeatable pattern. weak = single instance / inferred.',
            },
            behavior_stage: {
              type: 'string',
              enum: ['discovery', 'evaluation', 'approval', 'execution', 'unknown'],
              description:
                'Stage of the deal when this behavior occurred. Use stage cues from the substrate: ' +
                'discovery (early intro), evaluation (demos / vendor selection), approval (pricing / SoW / legal / signature pre-close), ' +
                'execution (post-close / onboarding kickoff / welcome / database setup). Use unknown if ambiguous; do NOT guess.',
            },
            outcome_linkage: {
              type: 'object' as const,
              description:
                'Optional. Set ONLY if a specific downstream substrate event traceably resulted from this behavior. Setting without real linkage is fabrication.',
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'micro_commitment',
                    'stage_progression',
                    'closed_won',
                    'closed_lost',
                  ],
                },
                evidence_ids: NON_EMPTY_STRING_ARRAY,
              },
              required: ['type', 'evidence_ids'],
            },
            evidence_ids: NON_EMPTY_STRING_ARRAY,
          },
          required: [
            'id',
            'rep_id',
            'valence',
            'category',
            'behavior_name',
            'source_moment',
            'rationale',
            'strength',
            'behavior_stage',
            'evidence_ids',
          ],
        },
      },
      next_coaching_focus: {
        type: 'array',
        maxItems: 3,
        description:
          '0–3 coaching focus items for the rep on THIS deal. Imperative voice, behavior-level not trait-level. Each item attaches to ≥1 signal_ids it responds to.',
        items: {
          type: 'object' as const,
          properties: {
            focus: {
              type: 'string',
              description:
                '≤ 200 chars. The move the rep should make on the next interaction. Imperative voice.',
            },
            rationale: {
              type: 'string',
              description:
                '≤ 200 chars. Why this matters for THIS deal — anchored in observed signals.',
            },
            attached_signal_ids: NON_EMPTY_STRING_ARRAY,
          },
          required: ['focus', 'rationale', 'attached_signal_ids'],
        },
      },
      metadata: {
        type: 'object' as const,
        properties: {
          rep_ids_analyzed: {
            type: 'array',
            items: { type: 'string' },
            description: 'Rep IDs the agent analyzed in this run.',
          },
          insufficiently_evidenced: {
            type: 'array',
            description:
              'Per-rep diagnostic entries when a rep produced no surfaceable behavior. Required when signals=[] for that rep.',
            items: {
              type: 'object' as const,
              properties: {
                rep_id: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['rep_id', 'reason'],
            },
          },
          quality_warnings: {
            type: 'array',
            description:
              'Non-blocking issues. Use "person_judgmental_language" if behavior_name reads trait-level; "thin_evidence" for "strong" with single evidence_id; etc. Layer C doctrine surface.',
            items: {
              type: 'object' as const,
              properties: {
                signal_id: { type: 'string' },
                code: {
                  type: 'string',
                  enum: [
                    'person_judgmental_language',
                    'thin_evidence',
                    'overclaimed_outcome',
                    'category_mismatch',
                    'other',
                  ],
                },
                message: { type: 'string' },
              },
              required: ['code', 'message'],
            },
          },
        },
        required: ['rep_ids_analyzed'],
      },
    },
    required: ['signals', 'next_coaching_focus', 'metadata'],
  },
};
