/**
 * ============================================================================
 *  Pass 3 — applyCoreIntelligence
 * ============================================================================
 *
 *  Pure structural merge of Pass 2 enrichments into the Pass 1.5 substrate.
 *  No LLM call, no I/O. Same input twice yields same output.
 *
 *  Pipeline position:
 *    Pass 1.5 → CoreIntelligenceInput  (substrate)
 *    Pass 2   → CoreIntelligenceEnrichments  (delta)
 *    Pass 3   → ExecutionAgentInput  (substrate + applied enrichments)
 *
 *  Merge rules:
 *    - Stakeholders: match by id, merge disposition / engagement_level /
 *      influence_level only. Notes + confidence stay in the enrichments
 *      record (diagnostic, not substrate).
 *    - Pillars: match by key, merge evidence_ids and status_override.
 *    - Opportunity: write deal_posture (status only) and last_activity_summary
 *      (text only). Richer fields stay in core_intelligence_enrichments.
 *    - Commercial state: merge only if substrate.commercial_state exists.
 *      We do NOT construct a commercial state from nothing — that would
 *      require inventing proposal and deal_desk_floors.
 *    - Top-level: always overwrite intelligence, conflicts, and
 *      core_intelligence_enrichments.
 *
 * ============================================================================
 *  STRUCTURAL WARNING — read before modifying
 * ============================================================================
 *
 *  ExecutionAgentInput currently serves dual roles:
 *    - Pre-enrichment substrate (this function's INPUT parameter)
 *    - Post-enrichment envelope (this function's RETURN value)
 *
 *  Logically the input should be CoreIntelligenceInput and the return
 *  value ExecutionAgentInput, but the type system doesn't enforce that
 *  split today. Discipline: this function only WRITES to the
 *  post-enrichment fields (intelligence, conflicts, core_intelligence_
 *  enrichments, plus stakeholder / pillar / opportunity / commercial
 *  enrichment slots). It never reads from them.
 *
 *  Future refactor: formalize CoreIntelligenceInput vs ExecutionAgentInput
 *  at the type level. Deferred until structural patterns are observed.
 * ============================================================================
 */

import type {
  ExecutionAgentInput,
  NormalizedStakeholder,
  MethodologyPillar,
  NormalizedCustomerAsk,
  NormalizedConcession,
} from "@/lib/contracts/execution-agent-input";
import type {
  CoreIntelligenceEnrichments,
  StakeholderEnrichment,
  PillarEvidence,
  CommercialEnrichment,
  OpportunityEnrichment,
} from "@/lib/contracts/core-intelligence-contract";

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  /** Reserved. Strict mode (in-apply validateEnrichments call) is deferred
   *  until the CoreIntelligenceInput vs ExecutionAgentInput type split is
   *  formalized — calling validateEnrichments here today would require an
   *  unsafe cast since the substrate type (CoreIntelligenceInput) is a
   *  superset of ExecutionAgentInput. Until then, the runner is the
   *  validation point. */
  strict?: boolean;
}

/**
 * Pure function. Returns a new ExecutionAgentInput with Pass 2 enrichments
 * merged in. Does not mutate the substrate.
 */
export function applyCoreIntelligence(
  substrate: ExecutionAgentInput,
  enrichments: CoreIntelligenceEnrichments,
  options: ApplyOptions = {}
): ExecutionAgentInput {
  // BACKLOG: strict mode reserved (see ApplyOptions). Validation
  // currently happens in the runner before apply is called.
  void options.strict;

  const stakeholderById = indexStakeholderEnrichments(
    enrichments.stakeholder_enrichments
  );
  const pillarByKey = indexPillarEvidence(
    enrichments.methodology_pillar_evidence
  );

  const enrichedStakeholders: NormalizedStakeholder[] =
    substrate.stakeholders.map((s) => mergeStakeholder(s, stakeholderById.get(s.id)));

  const enrichedPillars: MethodologyPillar[] =
    substrate.opportunity.methodology.pillars.map((p) => {
      // Runtime-safe key access. Pass 1.5 emits AssembledMethodologyPillar
      // (field: pillar_key); the contract type MethodologyPillar uses
      // (field: key). Both shapes flow through here today; pull from
      // whichever exists. The deferred type split formalizes this.
      const lookupKey = (p as { pillar_key?: string; key?: string }).pillar_key
        ?? (p as { pillar_key?: string; key?: string }).key
        ?? "";
      return mergePillar(p, pillarByKey.get(lookupKey));
    });

  const enrichedOpportunity = mergeOpportunity(
    substrate.opportunity,
    enrichments.opportunity_enrichments,
    enrichedPillars
  );

  const enrichedCommercialState = mergeCommercialState(
    substrate.commercial_state,
    enrichments.commercial_enrichments,
    options.strict
  );

  return {
    ...substrate,
    stakeholders: enrichedStakeholders,
    opportunity: enrichedOpportunity,
    commercial_state: enrichedCommercialState,

    // Always-overwrite Pass 2 outputs.
    intelligence: enrichments.intelligence,
    conflicts: enrichments.conflicts,
    core_intelligence_enrichments: enrichments,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ERRORS
// ────────────────────────────────────────────────────────────────────────────

export class ApplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyValidationError";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// INDEXING
// ────────────────────────────────────────────────────────────────────────────

function indexStakeholderEnrichments(
  list: StakeholderEnrichment[]
): Map<string, StakeholderEnrichment> {
  const m = new Map<string, StakeholderEnrichment>();
  for (const e of list) m.set(e.stakeholder_id, e);
  return m;
}

function indexPillarEvidence(
  list: PillarEvidence[]
): Map<string, PillarEvidence> {
  const m = new Map<string, PillarEvidence>();
  for (const e of list) m.set(e.pillar_key, e);
  return m;
}

// ────────────────────────────────────────────────────────────────────────────
// MERGE — stakeholder
// ────────────────────────────────────────────────────────────────────────────

function mergeStakeholder(
  s: NormalizedStakeholder,
  enrichment: StakeholderEnrichment | undefined
): NormalizedStakeholder {
  if (!enrichment) return s;
  return {
    ...s,
    disposition: enrichment.disposition ?? s.disposition,
    engagement_level: enrichment.engagement_level ?? s.engagement_level,
    influence_level: enrichment.influence_level ?? s.influence_level,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MERGE — pillar
// ────────────────────────────────────────────────────────────────────────────

function mergePillar(
  p: MethodologyPillar,
  evidence: PillarEvidence | undefined
): MethodologyPillar {
  if (!evidence) return p;
  return {
    ...p,
    evidence_ids: evidence.evidence_ids,
    status: evidence.status_override ?? p.status,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// MERGE — opportunity
// ────────────────────────────────────────────────────────────────────────────

function mergeOpportunity(
  o: ExecutionAgentInput["opportunity"],
  enrichment: OpportunityEnrichment | undefined,
  enrichedPillars: MethodologyPillar[]
): ExecutionAgentInput["opportunity"] {
  const next: ExecutionAgentInput["opportunity"] = {
    ...o,
    methodology: {
      ...o.methodology,
      pillars: enrichedPillars,
    },
  };
  if (!enrichment) return next;
  if (enrichment.last_activity_summary) {
    next.last_activity_summary = enrichment.last_activity_summary.text;
  }
  if (enrichment.deal_posture) {
    next.deal_posture = enrichment.deal_posture.status;
  }
  return next;
}

// ────────────────────────────────────────────────────────────────────────────
// MERGE — commercial state
// ────────────────────────────────────────────────────────────────────────────

function mergeCommercialState(
  substrate: ExecutionAgentInput["commercial_state"],
  enrichment: CommercialEnrichment | undefined,
  strict: boolean | undefined
): ExecutionAgentInput["commercial_state"] {
  if (!enrichment) return substrate;
  if (!substrate) {
    if (strict) {
      // eslint-disable-next-line no-console
      console.warn(
        "applyCoreIntelligence: commercial_enrichments present but " +
          "substrate.commercial_state is undefined. Dropping commercial " +
          "enrichments — refusing to construct commercial state from nothing."
      );
    }
    return substrate;
  }

  const customer_asks: NormalizedCustomerAsk[] = enrichment.customer_asks;
  const concessions_made: NormalizedConcession[] = enrichment.concessions_made;

  return {
    ...substrate,
    customer_asks,
    concessions_made,
    redline_status: enrichment.redline_status ?? substrate.redline_status,
    open_redlines: enrichment.open_redlines ?? substrate.open_redlines,
    proposal: {
      ...substrate.proposal,
      proposed_in_activity_id:
        enrichment.proposed_in_activity_id ?? substrate.proposal.proposed_in_activity_id,
      proposed_at: enrichment.proposed_at ?? substrate.proposal.proposed_at,
    },
  };
}
