/**
 * brief-test-deal — a FICTIONAL deal used to exercise the deterministic evidence
 * and change-detection foundation (Commit 1). No real customer data.
 *
 * "Northwind Freight — Dispatch Automation Rollout" is invented. It provides a
 * previous and a current `DealSnapshot`, together covering every change the
 * foundation must detect:
 *   - stage change            Discovery → Evaluation
 *   - close-date change       2026-09-30 → 2026-11-15
 *   - amount → Not confirmed  $180,000 → (unsupported, becomes open_question)
 *   - next-action CONFLICT    CRM next step disagrees with Mallín's recommendation
 *   - posture change          advancing → at_risk   (Mallín inference)
 *   - stakeholder position    Dana Ruiz: skeptic → supporter
 *   - new risk                champion-exit risk introduced this cycle
 *   - completed commitment    security review: open → done
 *   - missed commitment       pricing proposal: open, expected 2026-07-01, still open
 *   - new transcript evidence a second call recorded this cycle
 */

import type { DealSnapshot } from "@/lib/deck/brief-evidence";

const TENANT = "tenant_demo_freight";
const DEAL = "deal_nw_dispatch";
const OPP = "opp_nw_dispatch";

export const previousSnapshot: DealSnapshot = {
  tenantId: TENANT,
  dealId: DEAL,
  snapshotId: "snap_nw_v1",
  sequence: 1,
  capturedAt: "2026-06-15T00:00:00.000Z",
  opportunity: {
    recordId: OPP,
    name: "Northwind Freight — Dispatch Automation Rollout",
    stageLabel: "Discovery",
    amountUsd: 180000,
    currency: "USD",
    closeDate: "2026-09-30",
    nextStep: "Schedule technical validation",
    origin: "seller_entered",
  },
  intelligence: {
    versionId: "intel_nw_v1",
    generatedAt: "2026-06-15T00:00:00.000Z",
    facts: [
      {
        key: "priority:peak-season-reliability",
        value: "Reducing dispatch errors during peak freight season is the stated #1 operational priority.",
        source: "customer_input",
        confidence: "high",
      },
      {
        key: "context:legacy-system",
        value: "Currently runs an in-house dispatch board built ~2014.",
        source: "web_search",
        confidence: "medium",
      },
    ],
    stakeholders: [
      {
        stakeholderId: "sh_dana",
        name: "Dana Ruiz",
        title: "VP Operations",
        roleInDeal: { value: "economic influencer", confidence: "medium", rationale: "Owns the ops budget line." },
      },
      {
        stakeholderId: "sh_marcus",
        name: "Marcus Bell",
        title: "Director of Dispatch",
        roleInDeal: { value: "champion", confidence: "high", rationale: "Sourced the evaluation." },
      },
    ],
  },
  prep: {
    versionId: "prep_nw_v1",
    generatedAt: "2026-06-15T00:00:00.000Z",
    posture: "advancing",
    topLine: "Engaged evaluation with an active champion; validation is the next gate.",
    nextAction: "Schedule technical validation",
    criticalRisks: [
      {
        id: "r_integration",
        title: "Telematics integration feasibility unproven",
        description: "No confirmation their telematics provider exposes the needed API.",
        severity: "high",
      },
    ],
    stakeholderStates: [
      {
        stakeholderId: "sh_dana",
        name: "Dana Ruiz",
        role: "VP Operations",
        disposition: "skeptic",
        dispositionRationale: "Pushed back on migration risk during discovery.",
      },
      {
        stakeholderId: "sh_marcus",
        name: "Marcus Bell",
        role: "Director of Dispatch",
        disposition: "supporter",
      },
    ],
    commitments: [
      { id: "c_security", label: "Complete security review packet", state: "open", expectedBy: "2026-06-30" },
      { id: "c_pricing", label: "Send tiered pricing proposal", state: "open", expectedBy: "2026-07-01" },
      { id: "c_legal", label: "Return redlined MSA draft", state: "open", expectedBy: "2026-07-10" },
    ],
  },
  transcripts: [
    {
      transcriptId: "call_nw_1",
      segmentId: "0",
      callDate: "2026-06-12",
      speaker: "Dana Ruiz",
      speakerSide: "buyer",
      text: "We can't risk migrating off the legacy dispatch board mid-peak-season — that's the whole concern.",
    },
  ],
};

export const currentSnapshot: DealSnapshot = {
  tenantId: TENANT,
  dealId: DEAL,
  snapshotId: "snap_nw_v2",
  sequence: 2,
  capturedAt: "2026-07-18T00:00:00.000Z",
  opportunity: {
    recordId: OPP,
    name: "Northwind Freight — Dispatch Automation Rollout",
    stageLabel: "Evaluation", // stage change
    amountUsd: null, // unsupported this cycle → becomes "Not confirmed"
    currency: "USD",
    closeDate: "2026-11-15", // close-date change
    nextStep: "Redline MSA", // conflicts with prep.nextAction below
    origin: "seller_entered",
  },
  intelligence: {
    versionId: "intel_nw_v2",
    generatedAt: "2026-07-18T00:00:00.000Z",
    facts: [
      {
        key: "priority:peak-season-reliability",
        value: "Reducing dispatch errors during peak freight season is the stated #1 operational priority.",
        source: "customer_input",
        confidence: "high",
      },
      {
        key: "context:legacy-system",
        value: "Currently runs an in-house dispatch board built ~2014.",
        source: "web_search",
        confidence: "medium",
      },
      {
        key: "signal:champion-transition",
        value: "Marcus Bell (champion) is moving to a new internal role next quarter.",
        source: "customer_input",
        confidence: "high",
      },
    ],
    stakeholders: [
      {
        stakeholderId: "sh_dana",
        name: "Dana Ruiz",
        title: "VP Operations",
        roleInDeal: { value: "economic influencer", confidence: "medium", rationale: "Owns the ops budget line." },
      },
      {
        stakeholderId: "sh_marcus",
        name: "Marcus Bell",
        title: "Director of Dispatch",
        roleInDeal: { value: "champion", confidence: "high", rationale: "Sourced the evaluation." },
      },
    ],
  },
  prep: {
    versionId: "prep_nw_v2",
    generatedAt: "2026-07-18T00:00:00.000Z",
    posture: "at_risk", // posture change
    topLine: "Champion transition puts continuity at risk despite buyer-side momentum.",
    nextAction: "Escalate to economic buyer", // conflicts with opportunity.nextStep
    criticalRisks: [
      {
        id: "r_integration",
        title: "Telematics integration feasibility unproven",
        description: "No confirmation their telematics provider exposes the needed API.",
        severity: "high", // unchanged
      },
      {
        id: "r_champion_exit", // NEW risk
        title: "Champion transitioning out of role",
        description: "Marcus is moving roles; no identified successor sponsor.",
        severity: "blocking",
      },
    ],
    stakeholderStates: [
      {
        stakeholderId: "sh_dana",
        name: "Dana Ruiz",
        role: "VP Operations",
        disposition: "supporter", // position change: skeptic → supporter
        dispositionRationale: "Migration-timing plan addressed her peak-season concern.",
      },
      {
        stakeholderId: "sh_marcus",
        name: "Marcus Bell",
        role: "Director of Dispatch",
        disposition: "supporter",
      },
    ],
    commitments: [
      // Completed WITH explicit proof → observed completion.
      {
        id: "c_security",
        label: "Complete security review packet",
        state: "done",
        expectedBy: "2026-06-30",
        stateEvidence: { confirmedBy: "seller", note: "Sanjay confirmed the packet was returned and signed off." },
      },
      // Explicitly missed state (no external confirmation) → inferred miss.
      { id: "c_pricing", label: "Send tiered pricing proposal", state: "missed", expectedBy: "2026-07-01" },
      // A typed CUSTOMER-party commitment (structured record + named owner) —
      // this is what a real customer commitment requires, distinct from a
      // generic buyer statement of preference.
      { id: "c_voldata", label: "Provide peak-season volume data", state: "open", party: "customer", owner: "Dana Ruiz", expectedBy: "2026-07-25" },
      // c_legal (redlined MSA) simply DISAPPEARS this cycle → commitment_removed,
      // assurance unresolved. Its absence is NOT proof it was completed.
    ],
  },
  transcripts: [
    {
      transcriptId: "call_nw_1",
      segmentId: "0",
      callDate: "2026-06-12",
      speaker: "Dana Ruiz",
      speakerSide: "buyer",
      text: "We can't risk migrating off the legacy dispatch board mid-peak-season — that's the whole concern.",
    },
    {
      transcriptId: "call_nw_2", // NEW transcript this cycle
      segmentId: "0",
      callDate: "2026-07-15",
      speaker: "Dana Ruiz",
      speakerSide: "buyer",
      text: "If we phase the cutover after peak, I'm comfortable moving forward — I'll back this internally.",
    },
  ],
};
