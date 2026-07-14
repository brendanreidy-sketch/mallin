/**
 * ============================================================================
 *  Execution Agent Tool Schema — Pass 4 (Execution Layer)
 * ============================================================================
 *
 *  LAYER: Pass 4 (behavior). Consumes Pass 2 truth without modification.
 *  Pass 4 MUST NOT introduce new facts.
 *
 *  Anthropic tool definition. Forces the model to invoke
 *  emit_prep_artifact with a structured payload matching PrepArtifact.
 *
 *  EVIDENCE DOCTRINE: every evidence_ids array carries minItems: 1, EXCEPT
 *  deal_thesis.evidence_ids when status === "indeterminate", which must be
 *  empty (the sole permitted carve-out — refusal to infer, not unsupported
 *  claim).
 *
 *  REQUIRED-ARRAY DOCTRINE: required arrays carry minItems: 1, with
 *  carve-outs for open_questions and what_changed.changes.
 * ============================================================================
 */

import type Anthropic from '@anthropic-ai/sdk';

const NON_EMPTY_STRING_ARRAY = {
  type: 'array' as const,
  items: { type: 'string' as const },
  minItems: 1,
};

export const EMIT_PREP_ARTIFACT_TOOL: Anthropic.Tool = {
  name: 'emit_prep_artifact',
  description:
    'Emit the rep-facing PrepArtifact. Pass 4 MUST NOT introduce new facts. ' +
    'Every claim carries evidence_ids referencing intelligence record IDs. ' +
    'Required arrays minItems: 1 except open_questions (empty = no decision ' +
    'blockers) and what_changed.changes (omit what_changed entirely if no ' +
    'material change). For required slots empty due to insufficient evidence, ' +
    'emit one best-effort item AND log gap in metadata.insufficiently_evidenced. ' +
    'Only records with IDs can be cited. top_line.posture must mirror ' +
    'substrate.opportunity.deal_posture exactly. deal_thesis is REQUIRED and ' +
    'carries the controlling decision frame; status="formed" with thesis + ' +
    'evidence_ids OR status="indeterminate" with empty evidence_ids and ' +
    'required_evidence_to_form_thesis (2-5 items). Indeterminate is the ONLY ' +
    'permitted empty evidence_ids in the artifact — it represents refusal ' +
    'to infer, not unsupported claim. critical_risks items need ' +
    'outcome-level failure_mode (not activity-level), trigger, in_call_signal. ' +
    'open_questions mark blocks_decision; if true, why_it_matters names the ' +
    'specific decision blocked. coaching_notes are rep-controllable behavior ' +
    'change, not observation or abstraction.',
  input_schema: {
    type: 'object' as const,
    properties: {
      metadata: {
        type: 'object' as const,
        description:
          'Runner-owned fields (generated_at, prompt_version, model, ' +
          'opportunity_id, consumed_intelligence_version, usage, latency_ms, ' +
          'attempts) are OVERWRITTEN by the runner.',
        properties: {
          generated_at: { type: 'string' },
          prompt_version: { type: 'string' },
          model: { type: 'string' },
          opportunity_id: { type: 'string' },
          surface_mode: {
            type: 'string',
            enum: ['full', 'gaps_only', 'executive'],
          },
          consumed_intelligence_version: { type: 'string' },
          usage: {
            type: 'object' as const,
            properties: {
              input_tokens: { type: 'number' },
              output_tokens: { type: 'number' },
            },
          },
          latency_ms: { type: 'number' },
          attempts: { type: 'number' },
          rationale: { type: 'string' },
          insufficiently_evidenced: {
            type: 'array',
            items: {
              type: 'object' as const,
              properties: {
                field_path: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['field_path', 'reason'],
            },
          },
        },
        required: ['surface_mode'],
      },
      top_line: {
        type: 'object' as const,
        properties: {
          text: { type: 'string' },
          posture: {
            type: 'string',
            enum: ['advancing', 'stalled', 'at_risk', 'indeterminate'],
            description: 'MUST mirror substrate.opportunity.deal_posture exactly.',
          },
          evidence_ids: NON_EMPTY_STRING_ARRAY,
        },
        required: ['text', 'posture', 'evidence_ids'],
      },
      deliverables: {
        type: 'object' as const,
        description:
          'Optional. The "what {buyer} is waiting on before they decide" checklist — the concrete deliverables standing between now and a decision. Include ONLY when there is a crisp, evidence-grounded list (typically stage 3+). Omit on early/first-touch deals. Buyer-anchored, rep voice, no jargon.',
        properties: {
          title: {
            type: 'string',
            description:
              'Header line, buyer-anchored (e.g. "What Dana\'s waiting on before she decides"). ≤ 80 chars.',
          },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            description: 'Ordered by what to send first.',
            items: {
              type: 'object' as const,
              properties: {
                label: {
                  type: 'string',
                  description:
                    'The deliverable itself, plainly (e.g. "Revised price + one-paragraph rationale"). A thing you send/produce, not a task label. ≤ 90 chars.',
                },
                detail: {
                  type: 'string',
                  description:
                    'Optional muted qualifier (e.g. "vs Vantage $52K", "core now, add-ons later"). ≤ 60 chars.',
                },
                route: {
                  type: 'string',
                  description:
                    'Optional — who it goes to / runs through (e.g. "Sanjay, security"). ≤ 40 chars.',
                },
              },
              required: ['label'],
            },
          },
        },
        required: ['title', 'items'],
      },
      how_you_win: {
        type: 'string' as const,
        description:
          'Optional. The ONE strategic play that closes this deal — the positioning or move that resolves the decision. Plain rep voice, ≤ 200 chars. NOT the same as talk_track.opening_angle (a tactic for THIS call) and NOT a restatement of deal_thesis (the buyer\'s frame). Emit ONLY when a single win condition is clearly visible in substrate; omit when indeterminate. Example: "Get Linda to chair the eval herself instead of handing it to a generic RFP — she is the one who feels the pain."',
      },
      what_could_go_wrong: {
        type: 'array' as const,
        description:
          'Optional. 1–3 SILENT-KILLER risks — ways the deal could quietly die WITHOUT a red flag showing up in calls or emails. Each string names the hidden mechanism, not just the outcome, in plain rep voice (≤ 160 chars each). NOT a duplicate of critical_risks (which are active + observable). Omit if none are visible. Example: "Champion goes quiet after the reorg and the decision resolves without us — no one tells us it stalled."',
        minItems: 0,
        maxItems: 3,
        items: { type: 'string' as const },
      },
      deal_thesis: {
        description:
          'Controlling decision frame for this deal. Required. Interpretive ' +
          'synthesis over Pass 2 records — NOT a new fact (RULE 0 preserved). ' +
          'Use status="formed" only when evidence supports a thesis. Use ' +
          'status="indeterminate" when it does not — do NOT invent a thesis. ' +
          'A wrong thesis is worse than no thesis. Indeterminate is the sole ' +
          'permitted empty evidence_ids carve-out in the artifact.',
        oneOf: [
          {
            type: 'object' as const,
            properties: {
              status: { type: 'string', enum: ['formed'] },
              thesis: {
                type: 'string',
                description:
                  'The most likely decision frame the buyer is using to ' +
                  'evaluate this deal. ≤ 280 chars.',
              },
              confidence: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
              },
              decision_frame: {
                type: 'string',
                description:
                  'Short label for the frame (e.g. "software vs headcount", ' +
                  '"build vs buy", "incumbent renewal vs replacement"). ≤ 140 chars.',
              },
              why_this_matters: {
                type: 'string',
                description:
                  'How this thesis should shape the call (what to anchor on, ' +
                  'what to deprioritize). ≤ 280 chars.',
              },
              evidence_ids: NON_EMPTY_STRING_ARRAY,
            },
            required: [
              'status',
              'thesis',
              'confidence',
              'decision_frame',
              'why_this_matters',
              'evidence_ids',
            ],
            additionalProperties: false,
          },
          {
            type: 'object' as const,
            properties: {
              status: { type: 'string', enum: ['indeterminate'] },
              confidence: {
                type: 'string',
                enum: ['low'],
                description:
                  'Pinned to "low" — medium/high indeterminate is incoherent.',
              },
              evidence_ids: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 0,
                description:
                  'Must be empty for indeterminate. Refusal to infer, not unsupported claim.',
              },
              indeterminate_reason: {
                type: 'string',
                description:
                  'Why a thesis cannot be formed yet. ≤ 240 chars.',
              },
              required_evidence_to_form_thesis: {
                type: 'array',
                items: { type: 'string' },
                minItems: 2,
                maxItems: 5,
                description:
                  '2-5 specific evidence types that, if obtained, would let ' +
                  'a thesis be formed. Not a wish list — concrete categories ' +
                  '("decision timeline", "economic buyer named", etc.).',
              },
            },
            required: [
              'status',
              'confidence',
              'evidence_ids',
              'indeterminate_reason',
              'required_evidence_to_form_thesis',
            ],
            additionalProperties: false,
          },
        ],
      },
      post_call_synthesis: {
        type: 'object' as const,
        description:
          'Optional. Synthesis of the most recent external touch. Omit when no prior interaction has occurred yet (first-touch deals).',
        properties: {
          last_interaction_id: { type: 'string' },
          last_interaction_label: { type: 'string' },
          what_surfaced: {
            type: 'array',
            description:
              '2-4 bullets of NEW information, signal, or shift from the most recent call/email. Not a recap of the deal — only what changed in the latest interaction.',
            minItems: 2,
            maxItems: 4,
            items: { type: 'string' },
          },
          to_think_through: {
            type: 'array',
            description:
              '2-4 bullets of internal team / rep questions to resolve BEFORE the next external touch. Distinct from open_questions (which are buyer-facing decision blockers). These are the "pause and discuss with the manager / SE / pricing team" items.',
            minItems: 2,
            maxItems: 4,
            items: { type: 'string' },
          },
        },
        required: [
          'last_interaction_id',
          'last_interaction_label',
          'what_surfaced',
          'to_think_through',
        ],
      },
      what_changed: {
        type: 'object' as const,
        description: 'Optional. Omit entirely when nothing material has changed.',
        properties: {
          summary: { type: 'string' },
          changes: {
            type: 'array',
            items: {
              type: 'object' as const,
              properties: {
                kind: {
                  type: 'string',
                  enum: [
                    'new_stakeholder',
                    'position_change',
                    'commercial_change',
                    'process_change',
                    'external_signal',
                    'other',
                  ],
                },
                description: { type: 'string' },
                evidence_ids: NON_EMPTY_STRING_ARRAY,
              },
              required: ['kind', 'description', 'evidence_ids'],
            },
          },
        },
        required: ['summary', 'changes'],
      },
      critical_risks: {
        type: 'array',
        minItems: 1,
        description:
          'Required 1-3 navigable risks. failure_mode OUTCOME-LEVEL.',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            failure_mode: {
              type: 'string',
              description:
                'OUTCOME-LEVEL, not activity-level. Bad: "procurement delays". ' +
                'Good: "deal slips to next quarter due to delayed procurement review".',
            },
            trigger: { type: 'string' },
            in_call_signal: { type: 'string' },
            recommended_posture: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['blocking', 'high', 'medium'],
            },
            source_conflict_evidence_ids: {
              type: 'array',
              items: { type: 'string' },
            },
            evidence_ids: NON_EMPTY_STRING_ARRAY,
          },
          required: [
            'id',
            'title',
            'description',
            'failure_mode',
            'trigger',
            'in_call_signal',
            'recommended_posture',
            'severity',
            'evidence_ids',
          ],
        },
      },
      stakeholder_strategy: {
        type: 'array',
        minItems: 1,
        description:
          'Required 1-5. External stakeholders only. Priority is RELATIVE WITHIN THIS DEAL.',
        items: {
          type: 'object' as const,
          properties: {
            stakeholder_id: { type: 'string' },
            stakeholder_name: { type: 'string' },
            role: { type: 'string' },
            current_state: {
              type: 'object' as const,
              properties: {
                disposition: {
                  type: 'string',
                  enum: [
                    'champion',
                    'supporter',
                    'neutral',
                    'skeptic',
                    'blocker',
                    'unknown',
                  ],
                  description:
                    'Bare enum value. MUST mirror Pass 2 stakeholder_enrichments[].disposition exactly. Do NOT annotate (e.g. "unknown — verbally positive..."). Put any nuance in disposition_rationale.',
                },
                disposition_rationale: {
                  type: 'string',
                  description:
                    'Optional ≤ 160 chars. One-line context for the disposition. Use this for nuance instead of elaborating the disposition field.',
                },
                engagement_level: { type: 'string' },
                influence_level: { type: 'string' },
              },
            },
            call_strategy: { type: 'string' },
            do_list: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 3,
            },
            dont_list: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 2,
            },
            priority: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
            },
            relevance: {
              type: 'string',
              description:
                'One plain-spoken line, rep voice, on why this person matters to the deal RIGHT NOW — rendered in the stakeholder engagement map (e.g. "the review runs through him, and you\'ve never spoken"). ≤ 120 chars. Not the call strategy — the one-line stakes. Optional but strongly preferred for every stakeholder.',
            },
            engagement_tier: {
              type: 'string',
              enum: ['engaged', 'needs_engaging', 'watch'],
              description:
                'Engagement-tier JUDGMENT. Engaged vs needs_engaging is DERIVED from call attendance in the render — only set this to flag "watch": a stakeholder who is peripheral or not-yet-active (e.g. an incoming hire, a final-round candidate) who should NOT be treated as a gap to close. Omit for normal stakeholders.',
            },
            evidence_ids: NON_EMPTY_STRING_ARRAY,
          },
          required: [
            'stakeholder_id',
            'stakeholder_name',
            'role',
            'current_state',
            'call_strategy',
            'do_list',
            'evidence_ids',
          ],
        },
      },
      commercial_reality: {
        type: 'object' as const,
        description: 'Optional. Late-stage only.',
        properties: {
          situation_summary: { type: 'string' },
          asks: {
            type: 'array',
            items: {
              type: 'object' as const,
              properties: {
                category: { type: 'string' },
                customer_position: { type: 'string' },
                your_flexibility: { type: 'string' },
                firmness: {
                  type: 'string',
                  enum: ['hard', 'stated', 'soft'],
                },
                evidence_ids: NON_EMPTY_STRING_ARRAY,
              },
              required: [
                'category',
                'customer_position',
                'your_flexibility',
                'firmness',
                'evidence_ids',
              ],
            },
          },
          walk_in_posture: { type: 'string' },
          prior_concessions: {
            type: 'array',
            items: {
              type: 'object' as const,
              properties: {
                description: { type: 'string' },
                evidence_ids: NON_EMPTY_STRING_ARRAY,
              },
              required: ['description', 'evidence_ids'],
            },
          },
        },
        required: ['situation_summary', 'asks', 'walk_in_posture'],
      },
      talk_track: {
        type: 'object' as const,
        properties: {
          opening_angle: { type: 'string' },
          opening_rationale: { type: 'string' },
          key_questions: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object' as const,
              properties: {
                question: { type: 'string' },
                rationale: { type: 'string' },
                evidence_ids: NON_EMPTY_STRING_ARRAY,
              },
              required: ['question', 'rationale', 'evidence_ids'],
            },
          },
          objection_angles: {
            type: 'array',
            items: {
              type: 'object' as const,
              properties: {
                likely_objection: { type: 'string' },
                handling_angle: { type: 'string' },
                evidence_ids: NON_EMPTY_STRING_ARRAY,
              },
              required: ['likely_objection', 'handling_angle', 'evidence_ids'],
            },
          },
          positioning_angles: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 3,
          },
        },
        required: ['opening_angle', 'opening_rationale', 'key_questions', 'objection_angles'],
      },
      open_questions: {
        type: 'array',
        description: 'Required slot but empty array honest (no decision blockers).',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' },
            question: { type: 'string' },
            why_it_matters: { type: 'string' },
            urgency: {
              type: 'string',
              enum: ['blocking', 'high', 'medium'],
            },
            blocks_decision: { type: 'boolean' },
            how_to_ask: { type: 'string' },
            evidence_ids: NON_EMPTY_STRING_ARRAY,
          },
          required: [
            'id',
            'question',
            'why_it_matters',
            'urgency',
            'blocks_decision',
            'evidence_ids',
          ],
        },
      },
      success_criteria: {
        type: 'object' as const,
        properties: {
          summary: { type: 'string' },
          outcomes: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object' as const,
              properties: {
                outcome: { type: 'string' },
                why_it_matters: { type: 'string' },
              },
              required: ['outcome', 'why_it_matters'],
            },
          },
          acceptable_partial: { type: 'string' },
          failure_signal: { type: 'string' },
        },
        required: ['summary', 'outcomes'],
      },
      coaching_notes: {
        type: 'array',
        minItems: 1,
        description:
          'Required minItems: 1. Rep-controllable behavior change.',
        items: {
          type: 'object' as const,
          properties: {
            topic: {
              type: 'string',
              enum: [
                'discovery_depth',
                'stakeholder_coverage',
                'qualification_gap',
                'methodology_discipline',
                'pacing',
                'general',
              ],
            },
            note: { type: 'string' },
            evidence_ids: NON_EMPTY_STRING_ARRAY,
          },
          required: ['topic', 'note', 'evidence_ids'],
        },
      },
      pre_mortem_paths: {
        type: 'array',
        maxItems: 3,
        description:
          'Pre-mortem (situational anticipation): up to 3 distinct ' +
          'failure paths bounded to the deal\'s NEXT concrete event ' +
          '(SteerCo, exec call, close window — pick the most imminent). ' +
          'OMIT entirely if no such event is in scope OR no path passes ' +
          'every rule below. Do not pad to reach 3. ' +
          'EACH PATH MUST: (a) name a real actor from the substrate; ' +
          '(b) cite a recent unresolved/conflicting/missing-confirmation ' +
          'signal; (c) express a CAUSAL chain X → Y → Z that ends in a ' +
          'deal-level consequence; (d) include if_no_action in the ' +
          'strict template "If you do nothing: [actor] X → [next ' +
          'actor] Y → [outcome Z]" with literal "→" markers; (e) ' +
          'include exactly ONE binary forcing_move that the rep can ' +
          'execute in ≤1 step before the event — no hedging language ' +
          '("consider", "might help", "try to", "explore"), no diffuse ' +
          'ownership ("team", "stakeholders", "org"); (f) be driven by ' +
          'a primary_driver distinct from all other paths. The system ' +
          'enforces these rules — paths violating them are rejected.',
        items: {
          type: 'object' as const,
          properties: {
            primary_driver: {
              type: 'string',
              description:
                'Stable de-dupe key — typically the actor\'s ' +
                'stakeholder id, or a constraint key like ' +
                '"procurement" / "legal".',
            },
            actor_name: { type: 'string' },
            signal_source: {
              type: 'string',
              enum: ['touch', 'call', 'email'],
            },
            signal_timestamp: {
              type: 'string',
              description:
                'ISO 8601 timestamp of the most recent supporting ' +
                'substrate signal.',
            },
            gap_type: {
              type: 'string',
              enum: ['unresolved', 'conflict', 'missing_confirmation'],
            },
            failure_path: {
              type: 'string',
              description:
                'One-sentence causal chain. Must read as X → Y → Z ' +
                'to deal-level consequence (use literal "→"). Not a ' +
                'risk label.',
            },
            if_no_action: {
              type: 'string',
              description:
                'POSITIVE-FRAMED payoff statement. Renders to the rep ' +
                'as "Why this helps." Format: "[actor] X → [next actor] ' +
                'Y → [deal-positive outcome Z]." Single sentence with ' +
                'literal "→". Describes what unlocks when the rep ' +
                'executes the forcing_move, NOT what fails without it. ' +
                'DO NOT prefix with "If you do nothing:" or any failure ' +
                'narrative — this field is on offense, not defense.',
            },
            coaching_prompt: {
              type: 'string',
              description:
                'Conversational perspective-take that puts the rep IN ' +
                'THE BUYER\'S CHAIR using plain-language constraints, ' +
                'then asks an open strategic question. Champion-as-coach ' +
                'pattern preferred when applicable: "Ask Pedro: \'What\'s ' +
                'going to be important to you to be successful in your ' +
                'conversation with Marcus?\'" Otherwise direct perspective-' +
                'take: "If you were Marcus and you needed to spend new ' +
                'capital on the next site, what would matter is cashflow ' +
                'on hand. So how do you make this not feel like cash ' +
                'going out the door?" REQUIRED. Plain rep voice — no ' +
                '"stakeholder altitude," "decision logic," "tradeoffs."',
            },
            forcing_move: {
              type: 'string',
              description:
                '≤1-step rep-executable action. Direct verb + ' +
                'object + actor (e.g. "Email Nadia to confirm she ' +
                'will co-present"). No hedging, no diffuse ownership.',
            },
            solvable_pre_event: {
              type: 'boolean',
              description:
                'True iff forcing_move can be realistically ' +
                'executed before the next event. False paths are ' +
                'dropped pre-render — do not emit them.',
            },
            likelihood: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description:
                'Probability of this failure path occurring at the ' +
                'event, weighted by recency of supporting signal.',
            },
            severity: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description:
                'Deal-progression impact if this path materializes ' +
                '— NOT stakeholder-volume noise.',
            },
          },
          required: [
            'primary_driver',
            'actor_name',
            'signal_source',
            'signal_timestamp',
            'gap_type',
            'failure_path',
            'if_no_action',
            'coaching_prompt',
            'forcing_move',
            'solvable_pre_event',
            'likelihood',
            'severity',
          ],
        },
      },
    },
    required: [
      'metadata',
      'top_line',
      'deal_thesis',
      'critical_risks',
      'stakeholder_strategy',
      'talk_track',
      'open_questions',
      'success_criteria',
      'coaching_notes',
    ],
  },
};
