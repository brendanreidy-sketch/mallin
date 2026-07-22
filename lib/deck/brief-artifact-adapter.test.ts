import { describe, it, expect } from "vitest";
import { toDealSnapshot, type BriefSourceRecords } from "./brief-artifact-adapter";
import { buildEvidencePacket } from "./brief-evidence";
import { detectChanges } from "./brief-change-detection";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

// ── Minimal, type-valid, fictional real artifacts ───────────────────────────

const sf = (value: string, source: AccountIntelligenceArtifact["account"]["one_line"]["source"], confidence: "high" | "medium" | "low" = "medium") =>
  ({ value, source, captured_at: "2026-06-01T00:00:00.000Z", confidence }) as const;

const INTEL: AccountIntelligenceArtifact = {
  account: {
    name: "Cedar Dynamics",
    one_line: sf("Mid-market industrial automation vendor.", "web_search", "high"),
    industry: sf("Industrial Automation", "company_website", "high"),
    geography: [sf("Ohio, USA", "company_website")],
    funding_history: [],
    // A priority the rep tagged as coming from the customer — but with no
    // identified speaker. Must stay conservative (NOT customer_stated).
    strategic_priorities: [sf("Cut unplanned downtime 20% this year.", "customer_input", "high")],
    leadership: [],
  },
  recent_events: [
    {
      date: "2026-05-20",
      headline: "Opened a second plant in Reno",
      relevance: "Expansion increases automation spend capacity.",
      source: "newsapi",
      confidence: "medium",
    },
  ],
  stakeholders: [
    {
      stakeholder_id: "sh_jordan",
      name: "Jordan Vance",
      role_in_deal: { value: "economic_buyer", confidence: "medium", rationale: "Owns the capex line." },
      background: sf("20-year ops leader.", "web_search"),
      visible_priorities: [],
      rapport_hooks: [],
      watch_for: [],
    },
  ],
  competitive_context: {
    direct_competitors: [sf("Vantage Controls", "web_search")],
    market_position: sf("Challenger", "web_search"),
  },
  pre_call_brief: null,
  metadata: {
    generated_at: "2026-06-15T00:00:00.000Z",
    sources_used: ["web_search", "newsapi", "customer_input"],
    confidence_overall: "medium",
    product_context: "Predictive-maintenance platform",
    gaps: ["Budget authority not confirmed"],
  },
};

const PREP: PrepArtifact = {
  metadata: {
    generated_at: "2026-06-15T00:00:00.000Z",
    prompt_version: "v1",
    model: "test",
    opportunity_id: "opp_cedar",
    surface_mode: "full",
  },
  top_line: { text: "Engaged, validation pending.", posture: "advancing", evidence_ids: ["e1"] },
  deliverables: {
    title: "What Jordan is waiting on",
    items: [
      { label: "Send ROI model", route: "Jordan" },
      { label: "Security questionnaire", route: "Sanjay, security" },
    ],
  },
  deal_thesis: {
    status: "indeterminate",
    confidence: "low",
    evidence_ids: [],
    indeterminate_reason: "No decision frame observed yet.",
    required_evidence_to_form_thesis: ["Confirm budget", "Confirm timeline"],
  },
  critical_risks: [
    {
      id: "r_budget",
      title: "Budget authority unconfirmed",
      description: "No confirmation Jordan controls the capex line.",
      failure_mode: "Stalls at approval.",
      trigger: "Approval step",
      in_call_signal: "Defers to finance",
      recommended_posture: "Qualify budget",
      severity: "high",
      evidence_ids: ["e2"],
    },
  ],
  stakeholder_strategy: [
    {
      stakeholder_id: "sh_jordan",
      stakeholder_name: "Jordan Vance",
      role: "Economic buyer",
      current_state: { disposition: "neutral", disposition_rationale: "Engaged but non-committal." },
      call_strategy: "Build the business case.",
      do_list: ["Quantify downtime cost"],
      evidence_ids: ["e3"],
    },
  ],
  talk_track: { opening_angle: "Anchor on downtime cost.", opening_rationale: "Ties to their stated priority.", key_questions: [], objection_angles: [] },
  open_questions: [],
  success_criteria: { summary: "Advance to validation.", outcomes: [{ outcome: "Validation scheduled", why_it_matters: "Gates the deal." }] },
  coaching_notes: [],
};

function records(over: Partial<BriefSourceRecords> = {}): BriefSourceRecords {
  return {
    tenantId: "tenant_cedar",
    dealId: "deal_cedar",
    snapshotId: "snap_c1",
    capturedAt: "2026-06-15T00:00:00.000Z",
    sequence: 1,
    opportunity: {
      id: "opp_cedar",
      name: "Cedar Dynamics — Predictive Maintenance",
      stage_label: "Discovery",
      amount: 240000,
      currency: "USD",
      close_date: "2026-10-31",
      origin: "unknown", // connected system, human origin unknown → system_recorded
    },
    intelligence: INTEL,
    intelligenceVersionId: "intel_cedar_v1",
    prep: PREP,
    prepVersionId: "prep_cedar_v1",
    transcripts: [
      {
        transcriptId: "call_c1",
        callDate: "2026-06-12",
        attendees: [
          { name: "Jordan Vance", company: "Cedar Dynamics", side: "buyer" },
          { name: "Alex Rep", company: "SellerCo", side: "seller" },
        ],
        statements: [
          { segmentId: "1200", speaker: "Jordan Vance", text: "Downtime is our single biggest cost right now." },
          { segmentId: "4800", speaker: "Alex Rep", text: "We can show a downtime model by next week." },
          { segmentId: "9100", speaker: "Unidentified", text: "Some crosstalk here." },
        ],
      },
    ],
    ...over,
  };
}

describe("toDealSnapshot — real artifact mapping", () => {
  const snap = toDealSnapshot(records());

  it("is pure — mapping twice yields deeply-equal snapshots and does not mutate input", () => {
    const r = records();
    const a = toDealSnapshot(r);
    const b = toDealSnapshot(r);
    expect(a).toEqual(b);
    expect(r.opportunity.stage_label).toBe("Discovery"); // unmutated
  });

  it("maps opportunity, intelligence version, prep posture, and transcript segments", () => {
    expect(snap.opportunity.recordId).toBe("opp_cedar");
    expect(snap.opportunity.stageLabel).toBe("Discovery");
    expect(snap.intelligence?.versionId).toBe("intel_cedar_v1");
    expect(snap.prep?.posture).toBe("advancing");
    expect(snap.prep?.nextAction).toBe("Send ROI model"); // first deliverable
    expect(snap.transcripts).toHaveLength(3);
    expect(snap.transcripts[0].segmentId).toBe("1200"); // immutable segment id, not index
  });

  it("maps deliverables to open commitments with a stable label-derived id", () => {
    const ids = snap.prep?.commitments.map((c) => c.id);
    expect(ids).toContain("d/send-roi-model");
    expect(snap.prep?.commitments.every((c) => c.state === "open" && c.expectedBy === null)).toBe(true);
  });

  it("resolves buyer-side speakers to customer_stated and leaves others conservative", () => {
    const packet = buildEvidencePacket(snap);
    const bySeg = (seg: string) => packet.items.find((i) => i.fieldPath === `segment/${seg}`)!;
    expect(bySeg("1200").provenance).toBe("customer_stated"); // Jordan = buyer attendee
    expect(bySeg("4800").provenance).toBe("seller_provided"); // Alex = seller attendee
    expect(bySeg("9100").provenance).toBe("system_recorded"); // unmatched speaker → unknown
  });

  it("keeps a customer_input-sourced intelligence fact conservative (system_recorded)", () => {
    const packet = buildEvidencePacket(snap);
    const priority = packet.items.find((i) => i.logicalKey.startsWith("intel:priority:"))!;
    expect(priority.provenance).toBe("system_recorded");
    expect(priority.confidence).toBe("high"); // preserved
  });

  it("carries the stated intelligence gap through as a Not-confirmed open_question", () => {
    const packet = buildEvidencePacket(snap);
    const gap = packet.items.find((i) => i.provenance === "open_question" && i.claim.includes("Budget authority"));
    expect(gap?.payload.kind).toBe("open_question");
  });
});

describe("toDealSnapshot — a system-recorded change is observed", () => {
  it("classifies a system-origin stage move as observed, not customer-confirmed", () => {
    const prev = buildEvidencePacket(toDealSnapshot(records()));
    const curr = buildEvidencePacket(
      toDealSnapshot(
        records({
          snapshotId: "snap_c2",
          sequence: 2,
          capturedAt: "2026-07-15T00:00:00.000Z",
          opportunity: { id: "opp_cedar", stage_label: "Evaluation", amount: 240000, close_date: "2026-10-31", origin: "unknown" },
        }),
      ),
    );
    const cs = detectChanges(curr, prev);
    const stage = cs.changes.find((c) => c.type === "stage_change")!;
    expect(stage.previousValue).toBe("Discovery");
    expect(stage.currentValue).toBe("Evaluation");
    expect(stage.assurance).toBe("observed");
  });
});
