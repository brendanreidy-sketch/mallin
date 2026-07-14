import type { ExecutionAgentInput } from "@/lib/contracts/execution-agent-input";

export interface ExecutionAgentInput_Wrapper {
  enriched_input: ExecutionAgentInput;
  config?: ExecutionAgentConfig;
}

export interface ExecutionAgentConfig {
  model?: string;
  size_caps?: {
    max_critical_risks?: number;
    max_stakeholder_strategies?: number;
    max_talk_track_questions?: number;
    max_open_questions?: number;
  };
  surface_mode?: "full" | "gaps_only" | "executive";
  max_retries?: number;
}

export interface PrepArtifact {
  metadata: ArtifactMetadata;
  top_line: TopLineRead;
  deal_thesis: DealThesis;
  what_changed?: WhatChanged;
  critical_risks: CriticalRisk[];
  stakeholder_strategy: StakeholderStrategy[];
  commercial_reality?: CommercialReality;
  talk_track: TalkTrack;
  open_questions: OpenQuestion[];
  success_criteria: SuccessCriteria;
}

export type DealThesis =
  | {
      status: "formed";
      thesis: string;
      confidence: "low" | "medium" | "high";
      decision_frame: string;
      why_this_matters: string;
      evidence_ids: string[];
    }
  | {
      status: "indeterminate";
      confidence: "low";
      evidence_ids: [];
      indeterminate_reason: string;
      required_evidence_to_form_thesis: string[];
    };

export interface ArtifactMetadata {
  generated_at: string;
  prompt_version: string;
  model: string;
  consumed_intelligence_version?: string;
  opportunity_id: string;
  meeting_id?: string;
  token_usage?: { input: number; output: number };
  surface_mode: "full" | "gaps_only" | "executive";
}

export interface TopLineRead {
  text: string;
  posture: "advancing" | "stalled" | "at_risk" | "indeterminate";
  evidence_ids: string[];
}

export interface WhatChanged {
  summary: string;
  changes: Array<{
    kind: "new_stakeholder" | "position_change" | "commercial_change"
        | "process_change" | "external_signal" | "other";
    description: string;
    evidence_ids: string[];
  }>;
}

export interface CriticalRisk {
  id: string;
  title: string;
  description: string;
  failure_mode: string;
  trigger: string;
  in_call_signal: string;
  recommended_posture: string;
  severity: "blocking" | "high" | "medium";
  source_conflict_evidence_ids: string[];
  evidence_ids: string[];
}

export interface StakeholderStrategy {
  stakeholder_id: string;
  stakeholder_name: string;
  role: string;
  current_state: {
    disposition?: "champion" | "supporter" | "neutral" | "skeptic" | "blocker" | "unknown";
    disposition_rationale?: string;
    engagement_level?: "active" | "passive" | "silent" | "absent";
    influence_level?: "high" | "medium" | "low";
  };
  call_strategy: string;
  do_list: string[];
  dont_list?: string[];
  evidence_ids: string[];
}

export interface CommercialReality {
  situation_summary: string;
  asks: Array<{
    category: "price" | "term" | "payment" | "scope" | "legal" | "other";
    customer_position: string;
    your_flexibility: string;
    firmness: "hard" | "stated" | "soft";
    evidence_ids: string[];
  }>;
  walk_in_posture: string;
  prior_concessions?: Array<{
    description: string;
    conceded_at: string;
    evidence_ids: string[];
  }>;
}

export interface TalkTrack {
  opening_angle: string;
  key_questions: Array<{
    question: string;
    rationale: string;
    evidence_ids: string[];
  }>;
  objection_angles: Array<{
    likely_objection: string;
    handling_angle: string;
    evidence_ids: string[];
  }>;
  positioning_angles?: string[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  urgency: "blocking" | "high" | "medium";
  blocks_decision: boolean;
  how_to_ask?: string;
  evidence_ids: string[];
}

export interface SuccessCriteria {
  summary: string;
  outcomes: Array<{
    outcome: string;
    why_it_matters: string;
  }>;
  acceptable_partial?: string;
  failure_signal?: string;
}

export interface ExecutionAgent {
  generate(input: {
    enriched_input: ExecutionAgentInput;
    config?: ExecutionAgentConfig;
  }): Promise<PrepArtifact>;
}

export function validatePrepArtifact(
  artifact: PrepArtifact,
  input: ExecutionAgentInput
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const intelligenceIds = new Set(input.intelligence.map(i => i.id));
  const stakeholderIds = new Set(input.stakeholders.map(s => s.id));

  const checkEvidenceIds = (ids: string[], path: string) => {
    for (const id of ids) {
      if (!intelligenceIds.has(id)) {
        errors.push(path + ": evidence_id '" + id + "' not found in input.intelligence");
      }
    }
  };

  if (!artifact.top_line) {
    errors.push("top_line: required");
  } else {
    if (artifact.top_line.text.length > 240) {
      warnings.push("top_line.text: exceeds 240 char cap (got " + artifact.top_line.text.length + ")");
    }
    checkEvidenceIds(artifact.top_line.evidence_ids, "top_line");

    const dealPosture = (input.opportunity as any).deal_posture;
    if (!dealPosture) {
      warnings.push(
        "top_line.posture: cannot validate against Pass 2 deal_posture (Pass 2 didn't produce one — upstream contract violation)"
      );
    } else if (artifact.top_line.posture !== dealPosture) {
      errors.push(
        "top_line.posture: '" + artifact.top_line.posture + "' contradicts Pass 2 deal_posture '" + dealPosture + "'. " +
        "Pass 3 must surface Pass 2 posture, not contradict it."
      );
    }
  }

  // Patch v1.0.1 — what_changed.kind enum validation
  if (artifact.what_changed) {
    const validKinds = new Set([
      'new_stakeholder', 'position_change', 'commercial_change',
      'process_change', 'external_signal', 'other'
    ]);
    artifact.what_changed.changes.forEach((change, i) => {
      if (!validKinds.has(change.kind)) {
        errors.push('what_changed.changes[' + i + '].kind: ' + JSON.stringify(change.kind) + ' is not a valid enum value. Valid values: new_stakeholder, position_change, commercial_change, process_change, external_signal, other');
      }
    });
  }

  if (!Array.isArray(artifact.critical_risks)) {
    errors.push("critical_risks: must be array");
  } else {
    if ((input.conflicts?.length ?? 0) > 0 && artifact.critical_risks.length === 0) {
      errors.push("critical_risks: input has conflicts but no critical_risks were surfaced");
    }
    artifact.critical_risks.forEach((risk, i) => {
      if (risk.title.length > 80) warnings.push("critical_risks[" + i + "].title: exceeds 80 chars");
      if (risk.description.length > 400) warnings.push("critical_risks[" + i + "].description: exceeds 400 chars");
      if (risk.recommended_posture.length > 300) warnings.push("critical_risks[" + i + "].recommended_posture: exceeds 300 chars");

      if (!risk.failure_mode || risk.failure_mode.trim().length === 0) {
        errors.push("critical_risks[" + i + "].failure_mode: required (names what goes wrong)");
      } else if (risk.failure_mode.length > 200) {
        warnings.push("critical_risks[" + i + "].failure_mode: exceeds 200 chars");
      }
      if (!risk.trigger || risk.trigger.trim().length === 0) {
        errors.push("critical_risks[" + i + "].trigger: required (names what causes failure)");
      } else if (risk.trigger.length > 200) {
        warnings.push("critical_risks[" + i + "].trigger: exceeds 200 chars");
      }
      if (!risk.in_call_signal || risk.in_call_signal.trim().length === 0) {
        errors.push("critical_risks[" + i + "].in_call_signal: required (names how rep recognizes risk firing)");
      } else if (risk.in_call_signal.length > 240) {
        warnings.push("critical_risks[" + i + "].in_call_signal: exceeds 240 chars");
      }

      checkEvidenceIds(risk.evidence_ids, "critical_risks[" + i + "]");
      checkEvidenceIds(risk.source_conflict_evidence_ids, "critical_risks[" + i + "].source_conflict");
    });
  }

  if (!Array.isArray(artifact.stakeholder_strategy)) {
    errors.push("stakeholder_strategy: must be array");
  } else {
    artifact.stakeholder_strategy.forEach((strat, i) => {
      if (!stakeholderIds.has(strat.stakeholder_id)) {
        errors.push("stakeholder_strategy[" + i + "].stakeholder_id: '" + strat.stakeholder_id + "' not found in input.stakeholders");
      }
      if (strat.call_strategy.length > 300) warnings.push("stakeholder_strategy[" + i + "].call_strategy: exceeds 300 chars");
      if (strat.do_list.length === 0 || strat.do_list.length > 3) {
        errors.push("stakeholder_strategy[" + i + "].do_list: must have 1-3 items (got " + strat.do_list.length + ")");
      }
      strat.do_list.forEach((item, j) => {
        if (item.length > 120) warnings.push("stakeholder_strategy[" + i + "].do_list[" + j + "]: exceeds 120 chars");
      });
      if (strat.dont_list && strat.dont_list.length > 2) {
        errors.push("stakeholder_strategy[" + i + "].dont_list: max 2 items (got " + strat.dont_list.length + ")");
      }
      checkEvidenceIds(strat.evidence_ids, "stakeholder_strategy[" + i + "]");
    });
  }

  if (artifact.commercial_reality) {
    if (artifact.commercial_reality.situation_summary.length > 280) {
      warnings.push("commercial_reality.situation_summary: exceeds 280 chars");
    }
    if (artifact.commercial_reality.walk_in_posture.length > 300) {
      warnings.push("commercial_reality.walk_in_posture: exceeds 300 chars");
    }
    artifact.commercial_reality.asks.forEach((ask, i) => {
      if (ask.customer_position.length > 140) warnings.push("commercial_reality.asks[" + i + "].customer_position: exceeds 140 chars");
      if (ask.your_flexibility.length > 140) warnings.push("commercial_reality.asks[" + i + "].your_flexibility: exceeds 140 chars");
      checkEvidenceIds(ask.evidence_ids, "commercial_reality.asks[" + i + "]");
    });
  }

  if (!artifact.talk_track) {
    errors.push("talk_track: required");
  } else {
    if (artifact.talk_track.opening_angle.length > 300) {
      warnings.push("talk_track.opening_angle: exceeds 300 chars");
    }
    artifact.talk_track.key_questions.forEach((q, i) => {
      if (q.question.length > 200) warnings.push("talk_track.key_questions[" + i + "].question: exceeds 200 chars");
      if (q.rationale.length > 200) warnings.push("talk_track.key_questions[" + i + "].rationale: exceeds 200 chars");
      checkEvidenceIds(q.evidence_ids, "talk_track.key_questions[" + i + "]");
    });
    artifact.talk_track.objection_angles.forEach((obj, i) => {
      if (obj.likely_objection.length > 200) warnings.push("talk_track.objection_angles[" + i + "].likely_objection: exceeds 200 chars");
      if (obj.handling_angle.length > 280) warnings.push("talk_track.objection_angles[" + i + "].handling_angle: exceeds 280 chars");
      checkEvidenceIds(obj.evidence_ids, "talk_track.objection_angles[" + i + "]");
    });
    if (artifact.talk_track.positioning_angles && artifact.talk_track.positioning_angles.length > 3) {
      errors.push("talk_track.positioning_angles: max 3 angles");
    }
  }

  if (!Array.isArray(artifact.open_questions)) {
    errors.push("open_questions: must be array");
  } else {
    artifact.open_questions.forEach((q, i) => {
      if (q.question.length > 240) warnings.push("open_questions[" + i + "].question: exceeds 240 chars");
      if (q.why_it_matters.length > 200) warnings.push("open_questions[" + i + "].why_it_matters: exceeds 200 chars");
      if (q.how_to_ask && q.how_to_ask.length > 240) warnings.push("open_questions[" + i + "].how_to_ask: exceeds 240 chars");

      if (typeof q.blocks_decision !== "boolean") {
        errors.push("open_questions[" + i + "].blocks_decision: required boolean");
      }

      if (q.urgency === "blocking" && q.blocks_decision === false) {
        errors.push("open_questions[" + i + "]: urgency='blocking' contradicts blocks_decision=false. If blocking, set blocks_decision=true.");
      }

      checkEvidenceIds(q.evidence_ids, "open_questions[" + i + "]");
    });
  }

  if (!artifact.success_criteria) {
    errors.push("success_criteria: required");
  } else {
    if (artifact.success_criteria.summary.length > 200) {
      warnings.push("success_criteria.summary: exceeds 200 chars");
    }
    if (!Array.isArray(artifact.success_criteria.outcomes) || artifact.success_criteria.outcomes.length === 0) {
      errors.push("success_criteria.outcomes: must have at least 1 outcome");
    }
    artifact.success_criteria.outcomes?.forEach((o, i) => {
      if (o.outcome.length > 200) warnings.push("success_criteria.outcomes[" + i + "].outcome: exceeds 200 chars");
      if (o.why_it_matters.length > 160) warnings.push("success_criteria.outcomes[" + i + "].why_it_matters: exceeds 160 chars");
    });
    if (artifact.success_criteria.acceptable_partial && artifact.success_criteria.acceptable_partial.length > 240) {
      warnings.push("success_criteria.acceptable_partial: exceeds 240 chars");
    }
    if (artifact.success_criteria.failure_signal && artifact.success_criteria.failure_signal.length > 240) {
      warnings.push("success_criteria.failure_signal: exceeds 240 chars");
    }
  }

  return { errors, warnings };
}
