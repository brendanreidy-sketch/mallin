/**
 * ============================================================================
 *  Pass 2 — Core Intelligence Agent Contract
 * ============================================================================
 *
 *  The Core Intelligence agent reads the pre-enrichment ExecutionAgentInput
 *  produced by Pass 1.5 and returns a structured set of enrichments. A
 *  separate apply step merges enrichments into the final ExecutionAgentInput
 *  that reaches the Execution agent.
 *
 *  Architecture: delta-based, not mutating return.
 *    Agent input:    pre_enrichment_input (ExecutionAgentInput)
 *    Agent output:   CoreIntelligenceEnrichments (delta)
 *    Apply step:     applyCoreIntelligence(pre, enrichments) → enriched
 *
 *  Why delta?
 *    - The agent only thinks about what it's adding, not about preserving
 *      hundreds of unchanged fields. No risk of accidentally dropping
 *      data on the way through.
 *    - Same discipline pattern as the mapper layer (slices + orchestrator
 *      merge). Familiar boundary; familiar correctness model.
 *    - Enrichments are auditable as a discrete artifact. We can log,
 *      version, and replay them independent of the input.
 *    - Splitting Core Intelligence into multiple sub-agents later is
 *      easy if their outputs all conform to CoreIntelligenceEnrichments.
 *
 *  Three enrichment domains in this single agent:
 *    1. Methodology — evidence_ids per pillar
 *    2. Stakeholders — disposition, engagement_level, influence_level
 *    3. Commercial — customer_asks, concessions_made, redline_status,
 *       open_redlines, last_activity_summary
 *
 *  Why these three are coupled:
 *    - All read the same source data: transcripts, emails, activities
 *    - Cross-domain reasoning improves quality (a stakeholder's
 *      disposition informs which evidence is load-bearing for which
 *      pillar; a commercial ask attribution requires knowing who's
 *      the EB)
 *    - Splitting them creates fragmentation and conflicting interpretations
 *
 *  External Intelligence (strategic_priority, public_signals) is a
 *  separate agent — different data sources, different cadence, different
 *  failure modes. Defined elsewhere.
 *
 * ============================================================================
 */

import type {
  ExecutionAgentInput,
  NormalizedStakeholder,
  NormalizedCustomerAsk,
  NormalizedConcession,
  SupportingIntelligence,
} from "@/lib/contracts/execution-agent-input";
import type { CoreIntelligenceInput } from "@/orchestration/pass-1.5/input-assembler.types";

// ────────────────────────────────────────────────────────────────────────────
// AGENT INPUT
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pass 2 agent invocation envelope. Carries the Pass 1.5 substrate
 * (`pre_enrichment_input`) plus the agent-level configuration needed
 * to invoke the LLM reproducibly (model, confidence threshold, token
 * budget controls).
 *
 * Distinct from `CoreIntelligenceInput` (the Pass 1.5 substrate type
 * imported above): the substrate is the data the agent reads; this
 * envelope is the request shape the agent is called with.
 */
export interface CoreIntelligenceAgentRequest {
  pre_enrichment_input: ExecutionAgentInput;

  /** Agent configuration — temperature, model, etc. Captured here so
   *  agent invocations are reproducible. */
  config: CoreIntelligenceConfig;
}

export interface CoreIntelligenceConfig {
  /** Which model to invoke. Different deployments may use different
   *  models (cost vs quality tradeoff). */
  model: string;

  /** Minimum confidence threshold below which enrichments are dropped.
   *  Prevents low-signal claims from polluting the output. */
  min_confidence: "low" | "medium" | "high";

  /** Whether to include full transcript in agent context. False by
   *  default to manage token cost — summary + key_moments suffices for
   *  most enrichments. True for deep-analysis runs. */
  include_full_transcripts: boolean;

  /** Maximum number of supporting_intelligence items the agent may
   *  produce. Hard cap to bound output size. */
  max_intelligence_items: number;
}

// ────────────────────────────────────────────────────────────────────────────
// AGENT OUTPUT — the delta
// ────────────────────────────────────────────────────────────────────────────

/**
 * Everything the Core Intelligence agent produces. The apply step merges
 * each section into the corresponding part of the pre-enrichment input.
 */
export interface CoreIntelligenceEnrichments {
  /** New SupportingIntelligence records created during this run. Each
   *  carries an ID that other enrichments reference (evidence_ids on
   *  pillars, on customer_asks, on stakeholder claims). The intelligence
   *  layer is the canonical source of evidence. */
  intelligence: SupportingIntelligence[];

  /** Per-pillar evidence linkage. The agent reads source data, finds
   *  the moments that confirm or contest each MEDDPICC pillar, and
   *  links those moments via SupportingIntelligence IDs. */
  methodology_pillar_evidence: PillarEvidence[];

  /** Per-stakeholder enrichments — disposition, engagement, influence,
   *  notes. Agent attributes each enrichment to specific evidence. */
  stakeholder_enrichments: StakeholderEnrichment[];

  /** Commercial state enrichments. Agent extracts customer_asks and
   *  concessions from negotiation calls and emails. */
  commercial_enrichments?: CommercialEnrichment;

  /** Opportunity-level synthesis fields. */
  opportunity_enrichments?: OpportunityEnrichment;

  /** Cross-domain conflicts. In real deals, clarity often comes from
   *  knowing where things DON'T align — EB and procurement want
   *  different things, customer's email contradicts what they said
   *  on call, two stakeholders disagree about scope.
   *
   *  This field surfaces those misalignments as first-class output.
   *  The Execution agent reads conflicts to inform talk_track and
   *  risk identification; the UI renders them prominently because
   *  they're often the most actionable insight in the prep. */
  conflicts: IntelligenceConflict[];

  /** Agent diagnostics — confidence in its own output, fields it
   *  couldn't enrich, evidence it found ambiguous. */
  diagnostics: IntelligenceDiagnostics;
}

// ────────────────────────────────────────────────────────────────────────────
// CONFLICTS
// ────────────────────────────────────────────────────────────────────────────

export interface IntelligenceConflict {
  /** Which domain the conflict lives in. */
  entity: "stakeholder" | "commercial" | "methodology" | "timing" | "criteria";

  /** Human-readable description of what's in conflict. Max 200 chars.
   *  Should name the specific positions in tension. Example:
   *  "Eleanor (EB) prefers 24mo term while James (procurement) needs
   *  18%+ savings target — these can't both be hit at deal-desk floor."
   */
  description: string;

  /** Which entities are in tension, when applicable. For stakeholder
   *  conflicts, the IDs of the disagreeing stakeholders. For commercial
   *  conflicts, the keys of the conflicting concepts. */
  involved_ids?: string[];

  /** Evidence for each side of the conflict. References SupportingIntelligence. */
  evidence_ids: string[];

  /** How load-bearing this conflict is. "high" = likely to derail the
   *  deal if unresolved; "low" = friction but not blocking. */
  severity: "high" | "medium" | "low";

  /** Agent's confidence that this is a real conflict vs. apparent. */
  confidence: "high" | "medium" | "low";
}

// ────────────────────────────────────────────────────────────────────────────
// PILLAR EVIDENCE
// ────────────────────────────────────────────────────────────────────────────

export interface PillarEvidence {
  /** The pillar key (matches MethodologyPillar.key in the input). */
  pillar_key: string;

  /** SupportingIntelligence IDs that evidence this pillar. References
   *  resolve into CoreIntelligenceEnrichments.intelligence[]. */
  evidence_ids: string[];

  /** Required. Agent's confidence that the listed evidence actually
   *  confirms the pillar, vs. being merely related. Reps need to know
   *  whether a confirmed pillar rests on strong signal or weak inference;
   *  this is how that signals out. */
  confidence: "high" | "medium" | "low";

  /** Optional: if the agent found contradicting evidence (someone
   *  reversed position, or two stakeholders disagree), it can flag
   *  pillar status as "conflicted" via this field. The apply step
   *  uses this to override pillar.status when present. */
  status_override?: "confirmed" | "partial" | "unknown" | "not_applicable" | "conflicted";
}

// ────────────────────────────────────────────────────────────────────────────
// STAKEHOLDER ENRICHMENT
// ────────────────────────────────────────────────────────────────────────────

export interface StakeholderEnrichment {
  /** Canonical stakeholder ID (matches NormalizedStakeholder.id). */
  stakeholder_id: string;

  disposition?: NormalizedStakeholder["disposition"];
  engagement_level?: NormalizedStakeholder["engagement_level"];
  influence_level?: NormalizedStakeholder["influence_level"];

  /** Free-text observation about this stakeholder. Max 200 chars. Agent
   *  uses this for nuance the enums can't capture
   *  ("Has been silent across last 2 sessions despite being present"). */
  notes?: string;

  /** Evidence supporting these enrichments. */
  evidence_ids: string[];

  /** Agent confidence in this characterization. */
  confidence: "high" | "medium" | "low";
}

// ────────────────────────────────────────────────────────────────────────────
// COMMERCIAL ENRICHMENT
// ────────────────────────────────────────────────────────────────────────────

export interface CommercialEnrichment {
  /** Customer asks extracted from negotiation calls and emails. */
  customer_asks: NormalizedCustomerAsk[];

  /** Concessions made during the deal. */
  concessions_made: NormalizedConcession[];

  /** Free-text redline status. */
  redline_status?: string;

  /** Currently open redline items. */
  open_redlines?: string[];

  /** Where the proposal was first put forward (activity ID). Lets the
   *  apply step set proposal.proposed_in_activity_id. */
  proposed_in_activity_id?: string;

  /** When the proposal was made. */
  proposed_at?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// OPPORTUNITY ENRICHMENT
// ────────────────────────────────────────────────────────────────────────────

export interface OpportunityEnrichment {
  /** Synthesized summary of the most recent substantive touch. The
   *  agent reads the latest call/email and produces a one-sentence
   *  "what just happened on this deal." Confidence reflects how
   *  cleanly the latest activity could be summarized — strong when
   *  one substantive call/email dominates the recent timeline, weak
   *  when activity is sparse or ambiguous. */
  last_activity_summary?: {
    text: string; // max 300 chars
    confidence: "high" | "medium" | "low";
    evidence_ids: string[];
  };

  /** Top-line posture synthesis. Agent integrates stakeholder dynamics,
   *  commercial state, and timing into a single read on where the deal
   *  actually stands. This is the highest-leverage output for the
   *  Execution agent — a clear posture lets downstream prompts orient
   *  before drilling into specifics.
   *
   *  - "advancing": forward motion, asks are within reach, key
   *    stakeholders aligned and engaged
   *  - "stalled": no recent forward motion, awaiting customer or
   *    internal action, no immediate risk but no momentum
   *  - "at_risk": active risk to deal close — timing infeasibility,
   *    champion silence at critical moments, stakeholder reversal,
   *    or commercial constraint pressure
   *
   *  Confidence reflects how cleanly the signals point in one direction.
   *  Mixed signals → medium or low confidence rather than picking a
   *  posture and pretending. */
  deal_posture: {
    status: "advancing" | "stalled" | "at_risk" | "indeterminate";
    rationale: string; // max 240 chars
    confidence: "high" | "medium" | "low";
    evidence_ids: string[];
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS
// ────────────────────────────────────────────────────────────────────────────

export interface IntelligenceDiagnostics {
  /** Overall confidence in this enrichment run. Calibrated from per-field
   *  confidences plus data completeness. */
  overall_confidence: "high" | "medium" | "low" | "insufficient_data";

  /** Free-text rationale for the overall confidence level. */
  rationale: string;

  /** Fields the agent could not enrich because evidence was insufficient.
   *  Lets the calling system decide whether to retry, accept partial,
   *  or surface a UI warning. */
  insufficiently_evidenced: Array<{
    field_path: string; // e.g., "stakeholders[sth_003Hx00000James].disposition"
    reason: string;
  }>;

  /** Token usage from the LLM call that produced these enrichments.
   *  Stamped by the runner-owned overwrite — model never sets these. */
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };

  /** Wall-clock latency of the LLM call in milliseconds. Stamped by
   *  the runner-owned overwrite. */
  latency_ms?: number;

  /** Number of attempts the agent needed to produce a tool call.
   *  1 = success on first try; 2-3 = retried. Stamped by the
   *  runner-owned overwrite. */
  attempts?: number;

  /** When this enrichment was generated. */
  generated_at: string; // ISO8601

  /** Which model produced this. */
  model: string;
}

// ────────────────────────────────────────────────────────────────────────────
// AGENT INTERFACE
// ────────────────────────────────────────────────────────────────────────────

/**
 * The Core Intelligence agent interface. Production implementation calls
 * an LLM with the prompt template defined in core-intelligence-prompt.ts.
 * Test/dev implementations can return canned enrichments for deterministic
 * testing.
 */
export interface CoreIntelligenceAgent {
  enrich(request: CoreIntelligenceAgentRequest): Promise<CoreIntelligenceEnrichments>;
}

// ────────────────────────────────────────────────────────────────────────────
// APPLY STEP — merge enrichments into the input
// ────────────────────────────────────────────────────────────────────────────

/**
 * Apply enrichments to a pre-enrichment input, producing the final
 * input that reaches the Execution agent.
 *
 * Pure function: same input + enrichments → same output. No external
 * state. Caller can compose this with retries, A/B testing, or
 * enrichment-versioning trivially.
 *
 * Merge semantics:
 *   - SupportingIntelligence appended to input.intelligence (which doesn't
 *     exist on ExecutionAgentInput today — see note below)
 *   - Pillar evidence_ids set per pillar; status_override applied if present
 *   - Stakeholder enrichments merged onto matching stakeholder records
 *     by ID; only fields present in the enrichment are written
 *   - Commercial enrichments merged onto commercial_state if present
 *   - Opportunity enrichments merged onto opportunity
 *
 * Note on SupportingIntelligence:
 *   The PrepArtifact contract has an intelligence: SupportingIntelligence[]
 *   field. ExecutionAgentInput does not have such a field — the input
 *   carries raw activities, calls, emails. The intelligence layer's
 *   SupportingIntelligence records are produced HERE in Pass 2 and
 *   passed forward to the Execution agent via a new field on
 *   ExecutionAgentInput. This contract documents the field; a small
 *   contract update adds it.
 */
export function applyCoreIntelligence(
  pre: ExecutionAgentInput,
  enrichments: CoreIntelligenceEnrichments
): ExecutionAgentInput {
  // Deep-clone to avoid mutating the input. Structured cloning preserves
  // type fidelity for the nested shapes we have.
  const enriched: ExecutionAgentInput = structuredClone(pre);

  // ── Pillar evidence ─────────────────────────────────────────────
  for (const pe of enrichments.methodology_pillar_evidence) {
    const pillar = enriched.opportunity.methodology.pillars.find(
      p => p.key === pe.pillar_key
    );
    if (!pillar) continue;
    pillar.evidence_ids = pe.evidence_ids;
    if (pe.status_override) {
      pillar.status = pe.status_override === "conflicted" ? "partial" : pe.status_override;
      // Note: NormalizedMethodologyPillar.status doesn't include "conflicted"
      // currently; if the agent finds conflicting evidence, we surface it
      // as "partial" here and let the Execution agent handle the nuance
      // through PrepArtifact's MethodologyPillar.status (which DOES include
      // "conflicted"). The Execution agent reads pillar evidence and pillar
      // status together to make the call.
    }
  }

  // ── Stakeholder enrichments ─────────────────────────────────────
  for (const se of enrichments.stakeholder_enrichments) {
    const sth = enriched.stakeholders.find(s => s.id === se.stakeholder_id);
    if (!sth) continue;
    if (se.disposition !== undefined) sth.disposition = se.disposition;
    if (se.engagement_level !== undefined) sth.engagement_level = se.engagement_level;
    if (se.influence_level !== undefined) sth.influence_level = se.influence_level;
  }

  // ── Commercial enrichments ──────────────────────────────────────
  if (enrichments.commercial_enrichments && enriched.commercial_state) {
    const ce = enrichments.commercial_enrichments;
    enriched.commercial_state.customer_asks = ce.customer_asks;
    enriched.commercial_state.concessions_made = ce.concessions_made;
    if (ce.redline_status !== undefined) {
      enriched.commercial_state.redline_status = ce.redline_status;
    }
    if (ce.open_redlines !== undefined) {
      enriched.commercial_state.open_redlines = ce.open_redlines;
    }
    if (ce.proposed_in_activity_id !== undefined) {
      enriched.commercial_state.proposal.proposed_in_activity_id = ce.proposed_in_activity_id;
    }
    if (ce.proposed_at !== undefined) {
      enriched.commercial_state.proposal.proposed_at = ce.proposed_at;
    }
  }

  // ── Opportunity enrichments ─────────────────────────────────────
  if (enrichments.opportunity_enrichments) {
    const oe = enrichments.opportunity_enrichments;
    if (oe.last_activity_summary !== undefined) {
      // Input field is a plain string; the structured form (with
      // confidence + evidence_ids) lives on the enrichment record only.
      // Downstream consumers that need the confidence look at the
      // intelligence[] for the referenced evidence.
      enriched.opportunity.last_activity_summary = oe.last_activity_summary.text;
    }
    if (oe.deal_posture !== undefined) {
      // Same pattern as last_activity_summary: input field is the
      // simple status string; rationale + confidence + evidence_ids
      // travel on the enrichment record for downstream consumers
      // that want the full reasoning.
      enriched.opportunity.deal_posture = oe.deal_posture.status;
    }
  }

  // ── Intelligence records ────────────────────────────────────────
  // Now a first-class field on ExecutionAgentInput. The Execution agent
  // reads these directly; downstream code resolves evidence_ids by
  // looking up here.
  enriched.intelligence = enrichments.intelligence;

  // ── Conflicts ───────────────────────────────────────────────────
  // First-class output. The Execution agent reads conflicts to inform
  // talk_track and risk surfacing; the UI renders them prominently
  // because they're often the most actionable insight in the prep.
  // Cast through unknown to handle the import-cycle workaround on
  // ExecutionAgentInput.conflicts (see comment in execution_agent_input.ts).
  enriched.conflicts = enrichments.conflicts as ExecutionAgentInput["conflicts"];

  // ── Full enrichments record ─────────────────────────────────────
  // Preserve the structured enrichments so downstream consumers can
  // access fields that don't have a slim landing surface on this
  // input shape — stakeholder notes, deal_posture rationale +
  // confidence + evidence_ids, last_activity_summary confidence +
  // evidence_ids, customer_ask agent_confidence breakdown.
  enriched.core_intelligence_enrichments = enrichments;

  return enriched;
}

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validate enrichments before applying. Catches structural issues
 * (referenced stakeholder IDs that don't exist, evidence_ids pointing
 * to nonexistent intelligence records, etc).
 *
 * Boundary contract:
 *   Pass 1.5 output = CoreIntelligenceInput
 *   Pass 2 output   = CoreIntelligenceEnrichments
 *   Pass 3 input    = ExecutionAgentInput (post-enrichment)
 *
 * validateEnrichments runs at the Pass 2 boundary: it accepts the
 * Pass 1.5 output (`pre: CoreIntelligenceInput`) and validates the
 * Pass 2 output (`enrichments: CoreIntelligenceEnrichments`) against
 * it — verifying that referenced stakeholder IDs, pillar keys, and
 * evidence IDs all resolve in the pre-enrichment substrate.
 *
 * applyCoreIntelligence (Pass 3) still operates on ExecutionAgentInput;
 * that is correct because it produces the post-enrichment input.
 */
export function validateEnrichments(
  enrichments: CoreIntelligenceEnrichments,
  pre: CoreIntelligenceInput
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  const intelligenceIds = new Set(enrichments.intelligence.map(i => i.id));
  const stakeholderIds = new Set(pre.stakeholders.map(s => s.id));
  const pillarKeys = new Set(pre.opportunity.methodology.pillars.map(p => p.pillar_key));
  const activityIds = new Set([
    ...pre.activities.map(a => a.id),
    ...pre.calls.map(c => c.id),
    ...pre.emails.map(e => e.id),
  ]);

  // Pillar evidence references must resolve.
  for (const pe of enrichments.methodology_pillar_evidence) {
    if (!pillarKeys.has(pe.pillar_key)) {
      errors.push(`PillarEvidence references unknown pillar key "${pe.pillar_key}"`);
    }
    for (const eid of pe.evidence_ids) {
      if (!intelligenceIds.has(eid)) {
        errors.push(`PillarEvidence "${pe.pillar_key}" references unknown evidence_id "${eid}"`);
      }
    }
  }

  // Stakeholder enrichments must reference real stakeholders.
  for (const se of enrichments.stakeholder_enrichments) {
    if (!stakeholderIds.has(se.stakeholder_id)) {
      errors.push(`StakeholderEnrichment references unknown stakeholder_id "${se.stakeholder_id}"`);
    }
    for (const eid of se.evidence_ids) {
      if (!intelligenceIds.has(eid)) {
        errors.push(`StakeholderEnrichment for "${se.stakeholder_id}" references unknown evidence_id "${eid}"`);
      }
    }
  }

  // Commercial enrichment references should resolve.
  if (enrichments.commercial_enrichments) {
    const ce = enrichments.commercial_enrichments;
    for (const ask of ce.customer_asks) {
      for (const eid of ask.evidence_ids) {
        if (!intelligenceIds.has(eid)) {
          errors.push(`CustomerAsk references unknown evidence_id "${eid}"`);
        }
      }
      if (ask.source_activity_id && !activityIds.has(ask.source_activity_id)) {
        errors.push(`CustomerAsk references unknown source_activity_id "${ask.source_activity_id}"`);
      }
    }
    for (const c of ce.concessions_made) {
      for (const eid of c.evidence_ids) {
        if (!intelligenceIds.has(eid)) {
          errors.push(`Concession references unknown evidence_id "${eid}"`);
        }
      }
    }
    if (ce.proposed_in_activity_id && !activityIds.has(ce.proposed_in_activity_id)) {
      errors.push(`CommercialEnrichment proposed_in_activity_id "${ce.proposed_in_activity_id}" doesn't resolve`);
    }
  }

  // SupportingIntelligence source_ref.external_id must resolve to a known
  // activity/call/email, when present. (Source-only intelligence, e.g.
  // an external signal, may have a different system than activity/call/email.)
  for (const intel of enrichments.intelligence) {
    if (intel.source_ref?.external_id && intel.source_channel !== "external") {
      // We allow either matching an activity/call/email ID directly OR
      // a source_ref.external_id from one of those source records.
      // The latter check is too loose to enforce here without the full
      // source_ref index; skip strict check.
    }

    // Validate source_span references resolve when present.
    if (intel.source_span) {
      const { call_id, email_id, activity_id } = intel.source_span;
      if (call_id && !activityIds.has(call_id)) {
        errors.push(`SupportingIntelligence "${intel.id}" source_span.call_id "${call_id}" doesn't resolve`);
      }
      if (email_id && !activityIds.has(email_id)) {
        errors.push(`SupportingIntelligence "${intel.id}" source_span.email_id "${email_id}" doesn't resolve`);
      }
      if (activity_id && !activityIds.has(activity_id)) {
        errors.push(`SupportingIntelligence "${intel.id}" source_span.activity_id "${activity_id}" doesn't resolve`);
      }
    }
  }

  // Conflicts: evidence_ids and involved_ids must resolve.
  for (const conflict of enrichments.conflicts) {
    for (const eid of conflict.evidence_ids) {
      if (!intelligenceIds.has(eid)) {
        errors.push(`Conflict "${conflict.description.slice(0, 40)}..." references unknown evidence_id "${eid}"`);
      }
    }
    if (conflict.involved_ids && conflict.entity === "stakeholder") {
      for (const sid of conflict.involved_ids) {
        if (!stakeholderIds.has(sid)) {
          errors.push(`Stakeholder conflict references unknown stakeholder "${sid}"`);
        }
      }
    }
  }

  // ── deal_posture required ────────────────────────────────────
  const dp = enrichments.opportunity_enrichments?.deal_posture;
  if (!dp) {
    errors.push("opportunity_enrichments.deal_posture is required and missing");
  } else {
    const validStatus = ["advancing", "stalled", "at_risk", "indeterminate"];
    if (!validStatus.includes(dp.status)) {
      errors.push(`deal_posture.status "${dp.status}" is not a valid value`);
    }
    if (!dp.rationale || dp.rationale.length === 0) {
      errors.push("deal_posture.rationale is required and missing");
    } else if (dp.rationale.length > 280) {
      // Prompt asks for ≤240 chars; validator allows 280 as a UX guardrail
      // against pathological overruns while absorbing ±40 char drift. The
      // 240 target keeps rationale terse without rejecting Pass 2 output
      // over a single phrase boundary.
      errors.push(`deal_posture.rationale exceeds 280 chars (${dp.rationale.length})`);
    }
    if (!["high", "medium", "low"].includes(dp.confidence)) {
      errors.push(`deal_posture.confidence "${dp.confidence}" is not a valid value`);
    }
    if (!Array.isArray(dp.evidence_ids)) {
      errors.push("deal_posture.evidence_ids must be an array");
    } else {
      for (const eid of dp.evidence_ids) {
        if (!enrichments.intelligence.find(i => i.id === eid)) {
          errors.push(`deal_posture references unknown evidence_id "${eid}"`);
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
