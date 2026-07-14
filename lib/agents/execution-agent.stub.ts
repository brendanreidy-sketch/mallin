/**
 * ============================================================================
 *  Execution Agent — Stub implementation (Pass 4)
 * ============================================================================
 *
 *  Drop-in replacement for ProductionExecutionAgent during runner
 *  development and regression testing. Returns a canned PrepArtifact
 *  from an inline fixture without making any API calls.
 *
 *  CONTRACT:
 *    - Implements ExecutionAgent (same interface as production)
 *    - Validates fixture against Layer A on every call
 *    - Stamps runner-owned metadata to mirror production behavior
 *    - Throws StubExecutionAgentError if the fixture has drifted
 *      from the contract
 *
 *  FIXTURE SCOPE — IMPORTANT:
 *    The fixture is hand-anchored to the Acme/Beneba merged input at
 *      scripts/_fixtures/acme-beneba-full-pipeline-output.json
 *
 *    All evidence_ids reference real input.intelligence[].id values.
 *    All stakeholder_ids reference real input.stakeholders[].id UUIDs.
 *    posture mirrors input.opportunity.deal_posture ("advancing").
 *    dispositions mirror Pass 2 stakeholder_enrichments exactly.
 *    source_conflict_evidence_ids is OMITTED on every risk because the
 *      Acme/Beneba input has zero Pass 2 conflicts to reference.
 *
 *    This means the stub passes Layer A AND Layer B when run against
 *    the Acme/Beneba input. Running the stub against any other input
 *    will fail Layer B — that is by design. The stub is a regression
 *    harness for runner + integrity-validator logic, not a generic mock.
 *
 *    If the Acme/Beneba input file changes (intelligence IDs renamed,
 *    stakeholders re-UUID'd, deal_posture flipped), this fixture will
 *    fail Layer B and the comments below need refreshing.
 * ============================================================================
 */

import type {
  ExecutionAgent,
  ExecutionAgentRequest,
  PrepArtifact,
} from "@/lib/contracts/execution-agent-output";
import { validateExecutionOutput } from "@/lib/contracts/execution-agent-validator";
import { EXECUTION_AGENT_PROMPT_VERSION } from "@/prompts/execution-agent-prompt";

// ────────────────────────────────────────────────────────────────────────────
// FIXTURE
// ────────────────────────────────────────────────────────────────────────────
//
// Real input.intelligence[].id values:
//   si_eleanor_pain_q3
//   si_eleanor_stakeholder_map
//   si_meeting_procurement_intent
//   si_call_summary_synthesis
//
// Real input.stakeholders[].id UUIDs:
//   eec477e0-d8e5-4795-9459-c0c5ef682c73  Eleanor Beneba   (champion)
//   7ebfc445-0e07-4e54-9f3c-b6a6bb76aa1b  James Okoye      (neutral)
//   6607872b-fe1f-489b-8597-c41d35b433db  Maria Chen       (unknown — not in strategy)
// ────────────────────────────────────────────────────────────────────────────

const FIXTURE_PREP_ARTIFACT: PrepArtifact = {
  metadata: {
    // Runner-owned placeholders — overwritten in execute().
    generated_at: "",
    prompt_version: "",
    model: "",
    opportunity_id: "",
    surface_mode: "full",
    rationale: "Stub fixture anchored to Acme/Beneba merged input. All cross-references resolve.",
  },
  top_line: {
    text: "Deal advancing into Apr 30 procurement touch: active champion in Eleanor, but CFO Maria Chen unengaged and decision process unmapped.",
    posture: "advancing",
    evidence_ids: ["si_eleanor_pain_q3", "si_eleanor_stakeholder_map"],
  },
  deal_thesis: {
    status: "formed",
    thesis: "Buyer is testing whether Eleanor's confirmed Q3 pain is severe enough to mobilize procurement and the CFO — the decision frame is mobilization risk, not product capability.",
    confidence: "medium",
    decision_frame: "champion-led pain validation vs. multi-stakeholder mobilization",
    why_this_matters: "Apr 30 call should treat procurement's presence as the diagnostic moment, not a tactical scheduling step.",
    evidence_ids: ["si_eleanor_pain_q3", "si_eleanor_stakeholder_map", "si_meeting_procurement_intent"],
  },
  // what_changed omitted (carve-out: omit when no material change to report)
  critical_risks: [
    {
      id: "cr_maria_absent",
      title: "CFO Maria Chen has zero engagement",
      description: "Economic buyer has had no direct interaction across all activities. Rep has no read on her position, priorities, or objections.",
      failure_mode: "Deal stalls or dies post-procurement when Maria blocks approval and no prior framing exists to counter her position.",
      trigger: "Procurement advances to CFO review without the rep having established a direct line to Maria.",
      in_call_signal: "James references 'Maria will need to sign off' without committing to an introduction.",
      recommended_posture: "Ask Eleanor or James for a scheduled CFO introduction within 7 days.",
      severity: "blocking",
      // source_conflict_evidence_ids OMITTED — input has 0 Pass 2 conflicts
      evidence_ids: ["si_eleanor_stakeholder_map"],
    },
  ],
  stakeholder_strategy: [
    {
      stakeholder_id: "eec477e0-d8e5-4795-9459-c0c5ef682c73",
      stakeholder_name: "Eleanor Beneba",
      role: "Champion",
      current_state: {
        disposition: "champion",
        engagement_level: "active",
        influence_level: "medium",
      },
      call_strategy: "Treat Eleanor as the operational broker; route CFO and procurement engagement through her rather than around her.",
      do_list: [
        "Ask Eleanor explicitly to schedule a 30-minute CFO introduction within 7 days.",
        "Confirm she has what she needs to advance the buying conversation internally.",
      ],
      priority: "high",
      evidence_ids: ["si_eleanor_pain_q3", "si_eleanor_stakeholder_map"],
    },
    {
      stakeholder_id: "7ebfc445-0e07-4e54-9f3c-b6a6bb76aa1b",
      stakeholder_name: "James Okoye",
      role: "Procurement Manager",
      current_state: {
        disposition: "neutral",
        engagement_level: "active",
      },
      call_strategy: "Use Apr 30 touch to map the decision sequence and surface the paper process before procurement drives the timeline.",
      do_list: [
        "Walk James through the proposed timeline and ask him to validate.",
        "Map procurement gates explicitly before the call ends.",
      ],
      priority: "high",
      evidence_ids: ["si_meeting_procurement_intent", "si_call_summary_synthesis"],
    },
  ],
  // commercial_reality omitted (Discovery stage, no commercial state on input)
  talk_track: {
    opening_angle: "Anchor the call on the CFO and decision-process map — every other thread depends on resolving these in the next two weeks.",
    opening_rationale: "Because the CFO is the unsurfaced economic buyer and procurement gates are unmapped — both block the path to signature.",
    key_questions: [
      {
        question: "James, when can we get 20 minutes with Maria to walk through the business case?",
        rationale: "Without a CFO touchpoint, budget approval drifts and the deal slips a quarter.",
        evidence_ids: ["si_eleanor_stakeholder_map"],
      },
      {
        question: "Walk me through how Beneba typically moves from evaluation to commitment — what are the gates between here and a signed agreement?",
        rationale: "Decision process is unmapped; this is the natural moment to capture it before procurement sets the pace.",
        evidence_ids: ["si_meeting_procurement_intent"],
      },
    ],
    objection_angles: [
      {
        likely_objection: "We can loop in finance after we have agreed terms.",
        handling_angle: "Pricing validity is tied to the original quote window — pushing finance later forces a re-quote cycle that costs everyone time.",
        evidence_ids: ["si_call_summary_synthesis"],
      },
    ],
  },
  open_questions: [
    {
      id: "q_cfo_signoff",
      question: "Has Maria Chen signed off on budget allocation for this quarter?",
      why_it_matters: "Without confirmed budget, the close date is unenforceable.",
      urgency: "blocking",
      blocks_decision: true,
      how_to_ask: "Ask Eleanor or James directly during the meeting recap.",
      evidence_ids: ["si_eleanor_stakeholder_map"],
    },
  ],
  success_criteria: {
    summary: "Confirmed CFO meeting on calendar within 7 days; decision process mapped end-to-end.",
    outcomes: [
      {
        outcome: "CFO meeting scheduled with specific date and time on calendar before EOD.",
        why_it_matters: "Converts soft budget interest into a hard approval path.",
      },
      {
        outcome: "Procurement gates captured in writing on the deal record.",
        why_it_matters: "Removes timeline ambiguity that allows the deal to slip silently.",
      },
    ],
    acceptable_partial: "Eleanor commits to scheduling the CFO meeting by end of week.",
    failure_signal: "James deflects on both CFO timeline and process mapping.",
  },
  coaching_notes: [
    {
      topic: "stakeholder_coverage",
      note: "Eleanor is the only stakeholder with whom you have a relationship; use Apr 30 to broaden to James and to broker access to Maria.",
      evidence_ids: ["si_eleanor_stakeholder_map"],
    },
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// AGENT
// ────────────────────────────────────────────────────────────────────────────

export class StubExecutionAgent implements ExecutionAgent {
  async execute(request: ExecutionAgentRequest): Promise<PrepArtifact> {
    const t0 = Date.now();

    // Validate fixture against Layer A on every call. Catches drift the
    // moment the contract tightens.
    const validation = validateExecutionOutput(FIXTURE_PREP_ARTIFACT);
    if (!validation.ok) {
      throw new StubExecutionAgentError(
        `Stub fixture failed Layer A validation — fixture has drifted from the contract. ` +
          `${validation.errors.length} error(s):\n${validation.errors.join("\n")}`
      );
    }

    const artifact = structuredClone(validation.data) as PrepArtifact;

    // Stamp runner-owned metadata to mirror ProductionExecutionAgent.
    artifact.metadata.model = "stub";
    artifact.metadata.prompt_version = EXECUTION_AGENT_PROMPT_VERSION;
    artifact.metadata.generated_at = new Date().toISOString();
    artifact.metadata.opportunity_id = request.enriched_input.opportunity.id;
    artifact.metadata.usage = { input_tokens: 0, output_tokens: 0 };
    artifact.metadata.latency_ms = Date.now() - t0;
    artifact.metadata.attempts = 1;

    return artifact;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ERRORS
// ────────────────────────────────────────────────────────────────────────────

export class StubExecutionAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StubExecutionAgentError";
  }
}
