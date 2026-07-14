/**
 * ============================================================================
 *  Derive CRM suggestions from PrepArtifact intelligence
 * ============================================================================
 *
 *  Pure function. Takes a PrepArtifact (the Pass 4 output Mallin already
 *  generates per deal) + substrate, returns the CRM-update suggestions
 *  the cockpit should show.
 *
 *  Why this layer:
 *    - The /sf/diff route diffs against SF Opportunity shapes. SF-shaped.
 *    - The cockpit needs to work for HubSpot tenants too (after D.4 or
 *      when an HS customer signs).
 *    - PrepArtifact is provider-neutral by construction (Pass 4 is
 *      orchestration / core code; the D.3 boundary applies).
 *
 *  So: derive suggestions HERE from the artifact, route writes through
 *  lib/crm.updateDealField. The result works for any provider.
 *
 *  Suggestion shape:
 *    - field: neutral name ("meddpicc.champion", "meddpicc.competition", ...)
 *    - value: the value the rep would write
 *    - rationale: WHY Mallin thinks this (the substrate quote that
 *      triggered the suggestion)
 *    - confidence: 0-1
 *    - captured_from: where in the substrate (call N, date)
 * ============================================================================
 */

import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

export interface CrmSuggestion {
  /** Stable identifier for this suggestion within the deal (used for
   *  "dismiss" persistence and audit). */
  id: string;
  /** Neutral field name that lib/crm.updateDealField understands. */
  field: string;
  /** Human-readable field label for the UI. */
  field_label: string;
  /** The value to write. */
  value: string;
  /** One-line summary of WHY Mallin is suggesting this. Surfaced in the
   *  Stage 1 Suggest card under the field. */
  rationale: string;
  /** 0-1 confidence in the suggestion. Surfaced as a badge. */
  confidence: number;
  /** Where this came from in the substrate — "call 4 · May 9" etc. */
  captured_from: string;
}

interface DeriveSubstrate {
  opportunity?: { name?: string };
  stakeholders?: Array<{
    name?: string;
    committee_role?: string | null;
    disposition?: string | null;
  }>;
}

export function deriveCrmSuggestions(
  substrate: DeriveSubstrate,
  artifact: PrepArtifact | null,
): CrmSuggestion[] {
  if (!artifact) return [];

  const suggestions: CrmSuggestion[] = [];

  // ── 1. Champion (from stakeholders[committee_role=champion]) ──────────────
  const champion = (substrate.stakeholders ?? []).find(
    (s) => s.committee_role?.toLowerCase().includes("champion"),
  );
  if (champion?.name) {
    suggestions.push({
      id: "meddpicc.champion",
      field: "meddpicc.champion",
      field_label: "Champion",
      value: champion.name,
      rationale: `Pass 2 identified ${champion.name} as champion based on engagement pattern across calls.`,
      confidence: 0.9,
      captured_from: "Pass 2 stakeholder analysis",
    });
  }

  // ── 2. Competition (from critical_risks where title mentions competitor) ──
  const competitor = artifact.critical_risks?.find((r) =>
    r.title?.toLowerCase().match(/compet|head-to-head|vendor/),
  );
  if (competitor) {
    suggestions.push({
      id: "meddpicc.competition",
      field: "meddpicc.competition",
      field_label: "Competition",
      value: competitor.title,
      rationale: competitor.description ?? competitor.in_call_signal ?? "",
      confidence: 0.75,
      captured_from: `Pass 4 critical risk: "${competitor.title}"`,
    });
  }

  // ── 3. Decision process (from critical_risks matching decision/signature) ─
  const decisionProcessRisk = artifact.critical_risks?.find((r) =>
    r.title?.toLowerCase().match(/decision|process|signature|paper/),
  );
  if (decisionProcessRisk) {
    suggestions.push({
      id: "meddpicc.decision_process",
      field: "meddpicc.decision_process",
      field_label: "Decision process",
      value: decisionProcessRisk.title,
      rationale:
        decisionProcessRisk.description ??
        decisionProcessRisk.in_call_signal ??
        "",
      confidence: 0.7,
      captured_from: `Pass 4 critical risk: "${decisionProcessRisk.title}"`,
    });
  }

  // ── 4. Economic buyer (from stakeholders with executive disposition) ──────
  const economicBuyer = (substrate.stakeholders ?? []).find(
    (s) =>
      s.committee_role?.toLowerCase().match(/economic|signer|cfo|exec/),
  );
  if (economicBuyer?.name) {
    suggestions.push({
      id: "meddpicc.economic_buyer",
      field: "meddpicc.economic_buyer",
      field_label: "Economic buyer",
      value: economicBuyer.name,
      rationale: `Pass 2 identified ${economicBuyer.name} (${economicBuyer.committee_role}) as the economic buyer.`,
      confidence: 0.85,
      captured_from: "Pass 2 stakeholder analysis",
    });
  }

  // ── 5. Identify pain (from talk_track.opening_rationale) ──────────────────
  const pain = artifact.talk_track?.opening_rationale;
  if (pain && pain.length > 0 && pain.length < 500) {
    suggestions.push({
      id: "meddpicc.identify_pain",
      field: "meddpicc.identify_pain",
      field_label: "Identified pain",
      value: pain,
      rationale: "Pass 4 talk-track opening rationale captures the pain the rep is selling against.",
      confidence: 0.65,
      captured_from: "Pass 4 talk track",
    });
  }

  return suggestions;
}
