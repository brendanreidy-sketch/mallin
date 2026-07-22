import { describe, it, expect } from "vitest";
import type { AccountIntelligenceArtifact, IntelligenceSource } from "@/lib/intelligence/types";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import { buildEvidencePacket } from "./brief-evidence";
import { detectChanges } from "./brief-change-detection";
import { toDealSnapshot } from "./brief-artifact-adapter";
import { generateExecutiveBrief } from "./brief-agent";
import { buildBriefPptx } from "./build-brief-pptx";
import type { BriefDraft } from "./brief-model";
import type { InternalBriefSources } from "./load-internal-brief-sources";
import { computeBundleVersion, generateInternalBrief, mapSourcesToRecords } from "./generate-internal-brief";

// ── minimal, valid, fictional source bundle ─────────────────────────────────

const sf = (value: string, source: IntelligenceSource, confidence: "high" | "medium" | "low" = "medium") =>
  ({ value, source, captured_at: "2026-06-01T00:00:00.000Z", confidence }) as const;

const INTEL: AccountIntelligenceArtifact = {
  account: {
    name: "Cedar Dynamics",
    one_line: sf("Mid-market industrial automation vendor.", "web_search", "high"),
    industry: sf("Industrial Automation", "company_website", "high"),
    geography: [], funding_history: [], strategic_priorities: [], leadership: [],
  },
  recent_events: [],
  stakeholders: [],
  competitive_context: { direct_competitors: [], market_position: sf("Challenger", "web_search") },
  pre_call_brief: null,
  meeting: {
    title: "Cedar / SellerCo — Discovery",
    date: "2026-06-12",
    attendees: [
      { name: "Jordan Vance", company: "Cedar Dynamics", side: "buyer" },
      { name: "Alex Rep", company: "SellerCo", side: "seller" },
    ],
    agenda: [],
    quotes: [
      { text: "We need to cut unplanned downtime this quarter.", speaker: "Jordan Vance" },
      { text: "There was some crosstalk on the bridge.", speaker: "Unidentified" },
    ],
    deck_copy_source_at: "2026-06-12T18:00:00.000Z",
  },
  metadata: { generated_at: "2026-06-15T00:00:00.000Z", sources_used: ["web_search"], confidence_overall: "medium", product_context: "Predictive maintenance" },
};

const PREP: PrepArtifact = {
  metadata: { generated_at: "2026-06-15T00:00:00.000Z", prompt_version: "v1", model: "test", opportunity_id: "opp_cedar", surface_mode: "full" },
  top_line: { text: "Engaged discovery.", posture: "advancing", evidence_ids: ["e1"] },
  deal_thesis: { status: "indeterminate", confidence: "low", evidence_ids: [], indeterminate_reason: "No frame yet.", required_evidence_to_form_thesis: ["a", "b"] },
  critical_risks: [],
  stakeholder_strategy: [],
  talk_track: { opening_angle: "Anchor on downtime.", opening_rationale: "Their priority.", key_questions: [], objection_angles: [] },
  open_questions: [],
  success_criteria: { summary: "Advance.", outcomes: [{ outcome: "Validation", why_it_matters: "Gate." }] },
  coaching_notes: [],
};

function sources(over: Partial<InternalBriefSources["opportunity"]> = {}): InternalBriefSources {
  return {
    tenantId: "tenant_cedar",
    dealId: "deal_cedar",
    opportunity: { id: "opp_cedar", name: "Cedar Dynamics — Predictive Maintenance", stageLabel: "Discovery", amount: null, currency: "USD", closeDate: "2026-10-31", ...over },
    companyName: "Cedar Dynamics",
    intelligence: { artifactId: "intel_row_1", artifact: INTEL },
    execution: { artifactId: "exec_row_1", artifact: PREP, generatedAt: "2026-06-15T00:00:00.000Z" },
    meeting: INTEL.meeting ?? null,
    coords: { opportunityId: "opp_cedar", opportunityUpdatedAt: "2026-06-14T00:00:00.000Z", intelligenceArtifactId: "intel_row_1", executionArtifactId: "exec_row_1", meetingRecordId: "2026-06-12T18:00:00.000Z" },
  };
}

const emptyDraft = (): BriefDraft => ({
  executiveSummary: [], whatChanged: [], customerPriorities: [], stakeholders: [], decisionProcess: [], risks: [],
  actionPlan: { customerCommitments: [], inferredCustomerCommitments: [], sellerActions: [], mallinRecommendations: [], unresolvedActions: [] },
  appendix: [],
});

const packetFor = (s: InternalBriefSources) => buildEvidencePacket(toDealSnapshot(mapSourcesToRecords(s, "bundle_v", "2026-06-15T00:00:00.000Z")));

// ── bundle version ───────────────────────────────────────────────────────────

describe("computeBundleVersion", () => {
  const coords = sources().coords;

  it("is deterministic", () => {
    expect(computeBundleVersion(coords)).toEqual(computeBundleVersion(coords));
  });
  it("is invariant to source-input ordering", () => {
    const reordered = { meetingRecordId: coords.meetingRecordId, executionArtifactId: coords.executionArtifactId, intelligenceArtifactId: coords.intelligenceArtifactId, opportunityUpdatedAt: coords.opportunityUpdatedAt, opportunityId: coords.opportunityId };
    expect(computeBundleVersion(reordered).short).toBe(computeBundleVersion(coords).short);
  });
  it("changes when any one immutable coordinate changes", () => {
    expect(computeBundleVersion({ ...coords, executionArtifactId: "exec_row_2" }).short).not.toBe(computeBundleVersion(coords).short);
    expect(computeBundleVersion({ ...coords, intelligenceArtifactId: "intel_row_2" }).short).not.toBe(computeBundleVersion(coords).short);
  });
  it("does not equal any single artifact id", () => {
    const v = computeBundleVersion(coords).short;
    expect(v).not.toBe(coords.intelligenceArtifactId);
    expect(v).not.toBe(coords.executionArtifactId);
  });
});

// ── source mapping / provenance ─────────────────────────────────────────────

describe("mapSourcesToRecords + evidence", () => {
  it("classifies MeetingBlock quotes as system_recorded (generated artifact, no immutable segment ref)", () => {
    const packet = packetFor(sources());
    const items = packet.items.filter((i) => i.sourceType === "transcript");
    const jordan = items.find((i) => i.claim.includes("unplanned downtime"))!;
    const crosstalk = items.find((i) => i.claim.includes("crosstalk"))!;
    // Even the buyer-attendee quote is NOT customer_stated — it is a meeting quote.
    expect(jordan.provenance).toBe("system_recorded");
    expect(crosstalk.provenance).toBe("system_recorded");
    expect(items.every((i) => i.provenance === "system_recorded")).toBe(true);
  });

  it("omits an unsupported amount from the cover (Not confirmed)", async () => {
    const packet = packetFor(sources());
    expect(packet.items.find((i) => i.logicalKey === "opp:amount")?.provenance).toBe("open_question");
    const gen = await generateExecutiveBrief({ packet, changeSet: detectChanges(packet, null), cover: { dealName: "Cedar", asOf: "2026-06-16" } }, async () => emptyDraft());
    expect(gen.ok).toBe(true);
    if (gen.ok) expect(gen.brief.cover.amount).toBeUndefined();
  });

  it("carries only attributed quotes — no raw transcript body", () => {
    const packet = packetFor(sources());
    const transcriptClaims = packet.items.filter((i) => i.sourceType === "transcript").map((i) => i.claim);
    expect(transcriptClaims).toEqual(["We need to cut unplanned downtime this quarter.", "There was some crosstalk on the bridge."]);
  });
});

// ── Phase-1 previous = null / What changed omitted ──────────────────────────

describe("generateInternalBrief — Phase 1 prior state", () => {
  it("always diffs against previous=null → no reliable prior state", () => {
    const cs = detectChanges(packetFor(sources()), null);
    expect(cs.hasPriorState).toBe(false);
    expect(cs.ordering.resolved).toBe(false);
  });

  it("omits the What changed section from the rendered deck", async () => {
    const packet = packetFor(sources());
    const gen = await generateExecutiveBrief({ packet, changeSet: detectChanges(packet, null), cover: { dealName: "Cedar", asOf: "2026-06-16" } }, async () => emptyDraft());
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    const { report } = await buildBriefPptx(gen.brief);
    expect(report.slides.map((s) => s.title)).not.toContain("What changed");
  });

  it("rejects a draft that tries to include a What changed item (no prior state)", async () => {
    const draft = emptyDraft();
    draft.whatChanged = [{ id: "wc", contentType: "what_changed", text: "x", section: "what_changed", assertionMode: "unresolved", evidenceIds: [], sourceFactKeys: [], factBindings: [], provenance: [], confidence: "none", assurance: "unresolved", appendixEligible: true }];
    const res = await generateInternalBrief({ sources: sources(), cover: { dealName: "Cedar", asOf: "2026-06-16" }, modelClient: async () => draft });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("brief_failed_validation");
  });
});

// ── orchestration outcomes ──────────────────────────────────────────────────

describe("generateInternalBrief — outcomes", () => {
  it("produces a valid PPTX and a bundle-versioned filename on success", async () => {
    const res = await generateInternalBrief({ sources: sources(), cover: { dealName: "Cedar Dynamics — Predictive Maintenance", asOf: "2026-06-16" }, modelClient: async () => emptyDraft() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(res.filename).toBe(`cedar-dynamics-predictive-maintenance-internal-brief-${res.bundleVersion}.pptx`);
    expect(res.filename).not.toContain("intel_row_1");
    expect(res.filename).not.toContain("exec_row_1");
    expect(res.modelId).toBe("claude-sonnet-4-6"); // shared Sonnet default
  });

  it("returns model_generation_failed when the model client throws", async () => {
    const res = await generateInternalBrief({ sources: sources(), cover: { dealName: "Cedar", asOf: "2026-06-16" }, modelClient: async () => { throw new Error("transport"); } });
    expect(res).toEqual({ ok: false, code: "model_generation_failed" });
  });
});
