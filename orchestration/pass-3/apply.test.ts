/**
 * Pass 3 — applyCoreIntelligence unit tests.
 *
 * Minimal coverage of merge contracts. Each test asserts ONE behavior.
 * If a test fails, the failure message tells you which merge rule broke.
 */

import { describe, it, expect } from "vitest";
import { applyCoreIntelligence } from "./apply";
import type { ExecutionAgentInput } from "@/lib/contracts/execution-agent-input";
import type { CoreIntelligenceEnrichments } from "@/lib/contracts/core-intelligence-contract";

// ────────────────────────────────────────────────────────────────────────────
// Fixture builders — minimal substrate + enrichments
// ────────────────────────────────────────────────────────────────────────────

function makeSubstrate(): ExecutionAgentInput {
  return {
    meeting: {
      id: "mtg_1",
      source_ref: { system: "google_calendar", external_id: "evt_1" },
      title: "Discovery call",
    } as ExecutionAgentInput["meeting"],
    account: { id: "acct_1", source_ref: { system: "salesforce", external_id: "001" }, name: "Beneba" } as ExecutionAgentInput["account"],
    opportunity: {
      id: "opp_1",
      source_ref: { system: "salesforce", external_id: "006" },
      name: "Beneba - Solution Eval",
      stage_label: "Discovery",
      owner_id: "user_1",
      methodology: {
        methodology_type: "MEDDPICC",
        surface_mode: "full",
        pillars: [
          { key: "metrics", label: "M · Metrics", status: "unknown" },
          { key: "champion", label: "C · Champion", status: "unknown" },
          { key: "economic_buyer", label: "E · Economic Buyer", status: "unknown" },
        ],
      },
    } as ExecutionAgentInput["opportunity"],
    stakeholders: [
      { id: "sth_1", name: "Eleanor", company: "Beneba", party: "external" } as ExecutionAgentInput["stakeholders"][0],
      { id: "sth_2", name: "James", company: "Beneba", party: "external" } as ExecutionAgentInput["stakeholders"][0],
    ],
    activities: [],
    calls: [],
    emails: [],
    external_intelligence: [],
    intelligence: [],
    context: { prep_time: "2026-04-28T00:00:00Z", methodology_type: "MEDDPICC" } as unknown as ExecutionAgentInput["context"],
  };
}

function makeEnrichments(): CoreIntelligenceEnrichments {
  return {
    intelligence: [
      {
        id: "int_001",
        source_channel: "call",
        derivation: "observed",
        summary: "Eleanor confirmed pain on discovery call",
      },
      {
        id: "int_002",
        source_channel: "call",
        derivation: "observed",
        summary: "Eleanor named Maria Chen as required EB",
      },
    ],
    methodology_pillar_evidence: [
      {
        pillar_key: "champion",
        evidence_ids: ["int_001", "int_002"],
        confidence: "high",
        status_override: "confirmed",
      },
      {
        pillar_key: "economic_buyer",
        evidence_ids: ["int_002"],
        confidence: "medium",
        status_override: "conflicted",
      },
    ],
    stakeholder_enrichments: [
      {
        stakeholder_id: "sth_1",
        disposition: "champion",
        engagement_level: "active",
        influence_level: "medium",
        evidence_ids: ["int_001", "int_002"],
        confidence: "high",
      },
    ],
    conflicts: [
      {
        entity: "stakeholder",
        description: "EB named but unactivated",
        evidence_ids: ["int_002"],
        severity: "high",
        confidence: "high",
      },
    ],
    diagnostics: {
      overall_confidence: "medium",
      rationale: "Single substantive call",
      insufficiently_evidenced: [],
      generated_at: "2026-04-28T13:00:00Z",
      model: "claude-sonnet-4-6 (prompt v1.1.0)",
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("applyCoreIntelligence", () => {
  it("merges stakeholder enrichments by id (disposition / engagement / influence) without touching unmatched stakeholders", () => {
    const result = applyCoreIntelligence(makeSubstrate(), makeEnrichments());

    const eleanor = result.stakeholders.find((s) => s.id === "sth_1");
    expect(eleanor?.disposition).toBe("champion");
    expect(eleanor?.engagement_level).toBe("active");
    expect(eleanor?.influence_level).toBe("medium");

    // James has no enrichment — must be untouched.
    const james = result.stakeholders.find((s) => s.id === "sth_2");
    expect(james?.disposition).toBeUndefined();
    expect(james?.engagement_level).toBeUndefined();
    expect(james?.influence_level).toBeUndefined();
  });

  it("merges pillar evidence by key including the 'conflicted' status_override", () => {
    const result = applyCoreIntelligence(makeSubstrate(), makeEnrichments());

    // Champion: confirmed override
    const champion = result.opportunity.methodology.pillars.find((p) => p.key === "champion");
    expect(champion?.evidence_ids).toEqual(["int_001", "int_002"]);
    expect(champion?.status).toBe("confirmed");

    // Economic buyer: conflicted override (proves enum widening took effect)
    const eb = result.opportunity.methodology.pillars.find((p) => p.key === "economic_buyer");
    expect(eb?.evidence_ids).toEqual(["int_002"]);
    expect(eb?.status).toBe("conflicted");

    // Metrics: no enrichment, status untouched
    const metrics = result.opportunity.methodology.pillars.find((p) => p.key === "metrics");
    expect(metrics?.status).toBe("unknown");
    expect(metrics?.evidence_ids).toBeUndefined();
  });

  it("always overwrites top-level intelligence + conflicts + core_intelligence_enrichments", () => {
    const substrate = makeSubstrate();
    const enrichments = makeEnrichments();

    expect(substrate.intelligence).toEqual([]);

    const result = applyCoreIntelligence(substrate, enrichments);

    expect(result.intelligence).toHaveLength(2);
    expect(result.intelligence[0].id).toBe("int_001");

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts?.[0]).toMatchObject({ entity: "stakeholder", severity: "high" });

    expect(result.core_intelligence_enrichments).toBe(enrichments);
  });

  it("does not mutate the substrate (purity guarantee)", () => {
    const substrate = makeSubstrate();
    const snapshot = JSON.stringify(substrate);

    applyCoreIntelligence(substrate, makeEnrichments());

    expect(JSON.stringify(substrate)).toBe(snapshot);
  });
});
