/**
 * ============================================================================
 *  BANT Fixture Builder
 * ============================================================================
 *
 *  Synthesizes a BANT-configured CoreIntelligenceInput by taking the Acme/
 *  Beneba substrate from Pass 1.5 and swapping its methodology block for
 *  BANT pillars. Stakeholders, activities, calls, emails, and meetings are
 *  unchanged — only the methodology framework differs.
 *
 *  Purpose: prove the Pass 2 prompt + agent are methodology-agnostic. Same
 *  evidence + different methodology should yield BANT-pillar enrichments,
 *  no MEDDPICC language leakage.
 *
 *  Note on types: this builder works with AssembledOpportunity and
 *  AssembledMethodologyPillar (Pass 1.5 output shapes), not the contract
 *  shapes (NormalizedOpportunity / MethodologyPillar). The two diverge at
 *  the orchestration/contract boundary — same deferred type split flagged
 *  in apply.ts and the agent file.
 * ============================================================================
 */

import { assembleCoreIntelligenceInput } from "../../orchestration/pass-1.5/input-assembler";
import type {
  AssemblyResult,
  AssembledOpportunity,
  AssembledMethodologyPillar,
} from "../../orchestration/pass-1.5/input-assembler.types";

const ACME_TENANT_ID = "af6a6787-f7f1-4db0-ade2-eeccc5ec9790";
const ACME_OPPORTUNITY_ID = "6d072dbd-cc3d-444a-a574-520eefb15296";

function bantPillar(
  pillar_key: string,
  label: string,
  display_order: number
): AssembledMethodologyPillar {
  return {
    pillar_key,
    label,
    display_order,
    status: "unknown",
    value_text: null,
    value_array: null,
    evidence_ids: [],
    consumed_intelligence_version: null,
  };
}

export async function buildBantFixture(): Promise<AssemblyResult> {
  const assembly = await assembleCoreIntelligenceInput({
    tenant_id: ACME_TENANT_ID,
    opportunity_id: ACME_OPPORTUNITY_ID,
  });

  const bantOpportunity: AssembledOpportunity = {
    ...assembly.input.opportunity,
    methodology_type: "BANT",
    methodology_surface_mode: "full",
    methodology: {
      ...assembly.input.opportunity.methodology,
      type: "BANT",
      surface_mode: "full",
      pillars: [
        bantPillar("budget", "B \u00b7 Budget", 1),
        bantPillar("authority", "A \u00b7 Authority", 2),
        bantPillar("need", "N \u00b7 Need", 3),
        bantPillar("timeline", "T \u00b7 Timeline", 4),
      ],
    },
  };

  return {
    ...assembly,
    input: {
      ...assembly.input,
      opportunity: bantOpportunity,
    },
  };
}
