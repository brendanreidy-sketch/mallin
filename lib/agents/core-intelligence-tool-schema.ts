/**
 * ============================================================================
 *  emit_enrichments — Tool schema for the Core Intelligence agent
 * ============================================================================
 *
 *  Purpose: GUIDE the model toward valid output shape via tool-use.
 *  Layer A validator (lib/contracts/core-intelligence-validator.ts) is the
 *  authoritative gatekeeper — this schema is intentionally LOOSER:
 *
 *    - No max-length string constraints (the prompt enforces those)
 *    - Optional fields stay optional
 *    - We rely on enums to anchor categorical fields, since enums help
 *      the model converge on valid values
 *
 *  If you tighten this schema, you increase tool-call failures (model
 *  produces output that the SDK rejects pre-validation). If you loosen
 *  it, you increase Layer A retries. Tune via observation, not intuition.
 * ============================================================================
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const EMIT_ENRICHMENTS_TOOL: Tool = {
  name: "emit_enrichments",
  description:
    "Emit the CoreIntelligenceEnrichments delta for this deal. Call this " +
    "tool exactly once with the full enrichments payload. Do not include " +
    "any text response outside the tool call.",
  input_schema: {
    type: "object",
    required: [
      "intelligence",
      "methodology_pillar_evidence",
      "stakeholder_enrichments",
      "conflicts",
      "diagnostics",
    ],
    properties: {
      intelligence: {
        type: "array",
        description:
          "Discrete observations about the deal. Each is referenced by ID " +
          "from evidence_ids on enrichments.",
        items: {
          type: "object",
          required: ["id", "source_channel", "derivation", "summary"],
          properties: {
            id: { type: "string" },
            source_channel: {
              type: "string",
              enum: ["call", "crm", "email", "calendar", "external"],
            },
            derivation: { type: "string", enum: ["observed", "inferred"] },
            summary: { type: "string" },
            quote: { type: "string" },
            strength: { type: "string", enum: ["strong", "moderate", "weak"] },
            source_ref: {
              type: "object",
              properties: {
                system: { type: "string" },
                external_id: { type: "string" },
                object_type: { type: "string" },
                url: { type: "string" },
                fetched_at: { type: "string" },
              },
            },
            source_span: {
              type: "object",
              properties: {
                call_id: { type: "string" },
                email_id: { type: "string" },
                activity_id: { type: "string" },
                start_ms: { type: "number" },
                end_ms: { type: "number" },
              },
            },
          },
        },
      },
      methodology_pillar_evidence: {
        type: "array",
        items: {
          type: "object",
          required: ["pillar_key", "evidence_ids", "confidence"],
          properties: {
            pillar_key: { type: "string" },
            evidence_ids: { type: "array", items: { type: "string" } },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            status_override: {
              type: "string",
              enum: [
                "confirmed",
                "partial",
                "unknown",
                "not_applicable",
                "conflicted",
              ],
            },
          },
        },
      },
      stakeholder_enrichments: {
        type: "array",
        items: {
          type: "object",
          required: ["stakeholder_id", "evidence_ids", "confidence"],
          properties: {
            stakeholder_id: { type: "string" },
            disposition: {
              type: "string",
              enum: [
                "champion",
                "supporter",
                "neutral",
                "skeptic",
                "blocker",
                "unknown",
              ],
            },
            engagement_level: {
              type: "string",
              enum: ["active", "passive", "silent", "absent"],
            },
            influence_level: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            notes: { type: "string" },
            evidence_ids: { type: "array", items: { type: "string" } },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
        },
      },
      commercial_enrichments: {
        type: "object",
        properties: {
          customer_asks: {
            type: "array",
            items: {
              type: "object",
              required: [
                "category",
                "description",
                "firmness",
                "agent_confidence",
                "evidence_ids",
              ],
              properties: {
                category: {
                  type: "string",
                  enum: [
                    "price",
                    "term",
                    "payment",
                    "scope",
                    "legal",
                    "other",
                  ],
                },
                description: { type: "string" },
                firmness: {
                  type: "string",
                  enum: ["hard", "stated", "soft"],
                },
                agent_confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                evidence_ids: { type: "array", items: { type: "string" } },
                source_activity_id: { type: "string" },
              },
            },
          },
          concessions_made: {
            type: "array",
            items: {
              type: "object",
              required: [
                "description",
                "conceded_at",
                "conceded_by",
                "agent_confidence",
                "evidence_ids",
              ],
              properties: {
                description: { type: "string" },
                conceded_at: { type: "string" },
                conceded_by: {
                  type: "string",
                  enum: ["rep", "deal_desk", "manager"],
                },
                agent_confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                evidence_ids: { type: "array", items: { type: "string" } },
                source_activity_id: { type: "string" },
              },
            },
          },
          redline_status: { type: "string" },
          open_redlines: { type: "array", items: { type: "string" } },
          proposed_in_activity_id: { type: "string" },
          proposed_at: { type: "string" },
        },
      },
      opportunity_enrichments: {
        type: "object",
        required: ["deal_posture"],
        properties: {
          last_activity_summary: {
            type: "object",
            required: ["text", "confidence", "evidence_ids"],
            properties: {
              text: { type: "string" },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              evidence_ids: { type: "array", items: { type: "string" } },
            },
          },
          deal_posture: {
            type: "object",
            required: ["status", "rationale", "confidence", "evidence_ids"],
            properties: {
              status: {
                type: "string",
                enum: ["advancing", "stalled", "at_risk", "indeterminate"],
              },
              rationale: { type: "string" },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              evidence_ids: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      conflicts: {
        type: "array",
        items: {
          type: "object",
          required: [
            "entity",
            "description",
            "evidence_ids",
            "severity",
            "confidence",
          ],
          properties: {
            entity: {
              type: "string",
              enum: [
                "stakeholder",
                "commercial",
                "methodology",
                "timing",
                "criteria",
              ],
            },
            description: { type: "string" },
            involved_ids: { type: "array", items: { type: "string" } },
            evidence_ids: { type: "array", items: { type: "string" } },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
        },
      },
      diagnostics: {
        type: "object",
        required: [
          "overall_confidence",
          "rationale",
          "insufficiently_evidenced",
          "generated_at",
          "model",
        ],
        properties: {
          overall_confidence: {
            type: "string",
            enum: ["high", "medium", "low", "insufficient_data"],
          },
          rationale: { type: "string" },
          insufficiently_evidenced: {
            type: "array",
            items: {
              type: "object",
              required: ["field_path", "reason"],
              properties: {
                field_path: { type: "string" },
                reason: { type: "string" },
              },
            },
          },
          generated_at: { type: "string" },
          model: { type: "string" },
        },
      },
    },
  },
};
