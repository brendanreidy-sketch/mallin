/**
 * Demo pipeline — a full, made-up book of business for the `mallin-demo`
 * tenant, so a prospect can see Mallín working across a real-shaped pipeline
 * (not one lonely deal).
 *
 * The rep is an Account Executive at **Meridian**, a (fictional) financial-
 * planning platform. Each deal is a different company evaluating Meridian, at
 * a different stage, with a different failure mode — deliberately spread so
 * every surface fills:
 *   - Home:      a real mix of "needs you" vs "on track"
 *   - Deals:     a full list to scroll
 *   - Team:      genuine stall patterns across deals (blocking/high risks)
 *   - Knowledge: winning plays (how_you_win) AND deal traps (top risk)
 *   - Ledger:    closed deals with outcome reasons
 *
 * Voice: plain, human, no jargon. Believable enterprise deals, not happy path.
 *
 * `brief()` expands a concise spec into a schema-complete PrepArtifact so each
 * deal reads richly on /prep without hand-authoring 400 lines of JSON apiece.
 */

export type Posture = "at_risk" | "stalled" | "on_track" | "advancing";
export type Severity = "blocking" | "high" | "medium";
export type Role = "champion" | "economic_buyer" | "user" | "procurement" | "technical";

export interface DemoStakeholder {
  name: string;
  title: string;
  role: Role;
  note: string;
}

export interface DemoCall {
  id: string;
  date: string; // YYYY-MM-DD
  durationMin: number;
  title: string;
  attendees: { name: string; airtimeMin?: number }[];
  summary: string;
  excerpts: { speaker: string; quote: string }[];
}

export interface DemoRisk {
  severity: Severity;
  title: string;
  description: string;
  failureMode: string;
  posture: string; // recommended_posture — the move
}

export interface DemoBriefSpec {
  posture: Posture;
  topLine: string;
  thesis: string;
  decisionFrame: string;
  whyMatters: string;
  whatChanged: string;
  risks: DemoRisk[];
  howYouWin: string;
  opening: string;
  questions: string[];
  nextSteps: string[];
}

export interface DemoOutcome {
  outcome: "won" | "lost";
  closedAt: string; // YYYY-MM-DD
  notes: string; // win/loss reason — feeds Knowledge + the ledger
  riskMaterialized: boolean; // did the risk Mallín flagged actually happen?
  moveTaken: boolean; // did the rep run the recommended move?
}

export interface DemoDeal {
  key: string; // stable slug for source_external_id
  account: { name: string; domain: string; industry: string };
  deal: {
    name: string;
    stageLabel: string;
    stagePosition: number;
    totalStages: number;
    arr: number;
    closeDate: string; // YYYY-MM-DD
    methodology: "MEDDPICC" | "SPICED" | "none";
  };
  stakeholders: DemoStakeholder[];
  calls: DemoCall[];
  brief: DemoBriefSpec;
  outcome?: DemoOutcome;
}

/** Expand a concise spec into a schema-complete PrepArtifact (JSONB shape the
 *  cockpit + /prep read). Structural boilerplate is filled here; the meaty,
 *  per-deal narrative comes from the spec. */
export function brief(d: DemoDeal): Record<string, unknown> {
  const evidence = d.calls.map((c) => c.id);
  const risks = d.brief.risks.map((r, i) => ({
    id: `cr_${String(i + 1).padStart(3, "0")}`,
    title: r.title,
    description: r.description,
    failure_mode: r.failureMode,
    trigger: null,
    in_call_signal: null,
    recommended_posture: r.posture,
    severity: r.severity,
    evidence_ids: evidence,
  }));
  return {
    metadata: {
      surface_mode: "full",
      rationale: d.brief.whyMatters,
      insufficiently_evidenced: [],
      model: "claude-sonnet-4-6",
      prompt_version: "v1.4.1",
      generated_at: `${d.calls[d.calls.length - 1]?.date ?? d.deal.closeDate}T14:00:00.000Z`,
    },
    top_line: { text: d.brief.topLine, posture: d.brief.posture, evidence_ids: evidence },
    deal_thesis: {
      status: "formed",
      thesis: d.brief.thesis,
      confidence: "high",
      decision_frame: d.brief.decisionFrame,
      why_this_matters: d.brief.whyMatters,
      evidence_ids: evidence,
    },
    post_call_synthesis: { summary: d.brief.whatChanged, evidence_ids: evidence },
    what_changed: {
      summary: d.brief.whatChanged,
      changes: [{ kind: "position_change", description: d.brief.whatChanged, evidence_ids: evidence }],
    },
    primary_decision_focus: { focus: d.brief.decisionFrame, why: d.brief.whyMatters },
    critical_risks: risks,
    stakeholder_strategy: Object.fromEntries(
      d.stakeholders.map((s) => [
        `sth_${s.name.toLowerCase().replace(/\s+/g, "_")}`,
        { name: s.name, role: s.role, disposition: s.note, disposition_rationale: s.note },
      ]),
    ),
    commercial_reality: { summary: `${d.deal.stageLabel} · ${d.deal.methodology}`, arr: d.deal.arr },
    talk_track: {
      opening_angle: d.brief.opening,
      opening_rationale: d.brief.whyMatters,
      key_questions: d.brief.questions.map((q) => ({ question: q })),
    },
    open_questions: d.brief.questions.map((q, i) => ({ id: `oq_${i + 1}`, question: q })),
    success_criteria: d.brief.nextSteps.map((s, i) => ({ id: `sc_${i + 1}`, criterion: s })),
    coaching_notes: { notes: d.brief.howYouWin },
    how_you_win: d.brief.howYouWin,
    manager_note: null,
  };
}
