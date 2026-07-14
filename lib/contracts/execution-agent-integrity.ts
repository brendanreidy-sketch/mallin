/**
 * ============================================================================
 *  Execution Agent Integrity Validator — Pass 4 Layer B
 * ============================================================================
 *
 *  RESPONSIBILITY:
 *    Truth-level validation. Cross-references the PrepArtifact against
 *    the ExecutionAgentInput it was generated from, ensuring every
 *    claim resolves to source intelligence and every cross-pass
 *    reference is honored.
 *
 *  RUNS AFTER LAYER A:
 *    Layer A guarantees shape. Layer B assumes shape and checks truth.
 *    A Layer A failure should always block the pipeline before Layer B
 *    is reached.
 *
 *  CHECK INVENTORY:
 *
 *    Check 1 — evidence_ids resolution
 *      Every evidence_ids array in every section (top_line, what_changed,
 *      critical_risks, stakeholder_strategy, commercial_reality.asks,
 *      commercial_reality.prior_concessions, talk_track.key_questions,
 *      talk_track.objection_angles, open_questions, coaching_notes)
 *      contains only IDs that resolve to input.intelligence[].id.
 *
 *    Check 2 — posture equality
 *      artifact.top_line.posture === input.opportunity.deal_posture
 *      Pass 4 must mirror Pass 2 truth, not re-infer it (doctrine §3.4).
 *
 *    Check 3 — stakeholder mirror
 *      Each stakeholder_strategy[].stakeholder_id resolves to a
 *      stakeholder on input.stakeholders[].id. If current_state.disposition
 *      is set, it must equal the matching Pass 2
 *      stakeholder_enrichments[].disposition. Pass 4 must mirror Pass 2's
 *      characterization, not contradict it.
 *
 *    Check 4 — source_conflict_evidence_ids resolution (compound)
 *      Field is OPTIONAL. When present on a critical_risk:
 *        (a) every ID resolves to input.intelligence[].id
 *        (b) every ID appears in at least one input.conflicts[].evidence_ids
 *      The compound semantic enforces both basic resolution AND
 *      participation in a real Pass 2 conflict.
 *
 *      IMPORTANT — Pass 2 conflicts have no id field. The field name
 *      "source_conflict_evidence_ids" reads as "evidence IDs that
 *      participated in the source conflict," not "conflict IDs." Linkage
 *      is via evidence, not via conflict identity.
 *
 *      NO-OP WHEN INPUT.CONFLICTS IS EMPTY: if input.conflicts.length === 0,
 *      Check 4 is not exercised — the model has no conflicts to reference,
 *      so the field will be absent on every risk. This is not the same as
 *      "Check 4 passed"; it means "Check 4 was dormant for this input."
 *      Distinction matters when reading audit logs.
 *
 *    Check 5 — meeting_id linkage. RESERVED.
 *      PrepArtifact contract does not currently carry a meeting_id field.
 *      When deal-stage execution adds explicit meeting linkage to the
 *      artifact, Check 5 ships here. Until then this check is a no-op
 *      placeholder.
 *
 *    Check 6 — deal_thesis evidence resolution
 *      When deal_thesis.status === "formed", every entry in
 *      deal_thesis.evidence_ids must resolve to input.intelligence[].id.
 *      When deal_thesis.status === "indeterminate", evidence_ids is
 *      required to be empty (the doctrinal carve-out enforced by
 *      Layer A); Check 6 is a no-op for indeterminate.
 *
 *      Layer A guarantees the structural shape (formed must have
 *      non-empty evidence_ids; indeterminate must have empty). Check 6
 *      adds the resolution-to-source check that Layer A cannot perform.
 *
 *  RETURN SHAPE:
 *    { valid: true, errors: [] }              — all checks passed
 *    { valid: false, errors: ['...', ...] }   — one or more violations,
 *      each formatted as "<check>: <path>: <detail>"
 *
 *  Mirrors Pass 2's validateEnrichments shape: takes (artifact, input),
 *  returns boolean + error list.
 * ============================================================================
 */

import type { PrepArtifact, CriticalRisk } from "./execution-agent-output";
import type { ExecutionAgentInput } from "./execution-agent-input";

export interface IntegrityResult {
  valid: boolean;
  errors: string[];
  /** Diagnostic: which checks were exercised vs. dormant on this input.
   *  Useful for audit logs that need to distinguish "passed" from
   *  "didn't run." */
  exercised: {
    check_1_evidence_resolution: boolean;
    check_2_posture_equality: boolean;
    check_3_stakeholder_mirror: boolean;
    check_4_source_conflict: boolean;
    check_5_meeting_linkage: boolean;
    check_6_deal_thesis: boolean;
    check_7_premortem_integrity: boolean;
  };
}

export function validateExecutionIntegrity(
  artifact: PrepArtifact,
  input: ExecutionAgentInput
): IntegrityResult {
  const errors: string[] = [];

  // ── Build resolution sets up front ────────────────────────────────────
  const intelligenceIdSet = new Set(
    (input.intelligence ?? []).map((rec: { id: string }) => rec.id)
  );
  const stakeholderIdSet = new Set(
    (input.stakeholders ?? []).map((s: { id: string }) => s.id)
  );

  // stakeholder_enrichments is not top-level on the merged ExecutionAgentInput.
  // Pass 3's applyCoreIntelligence may either keep it under
  // core_intelligence_enrichments or expose it at the top level. Try both;
  // narrow locally rather than weakening the input contract.
  type StakeholderEnrichmentLike = {
    stakeholder_id: string;
    disposition?: string | null;
  };
  const stakeholderEnrichments: StakeholderEnrichmentLike[] =
    ((input as unknown as { stakeholder_enrichments?: StakeholderEnrichmentLike[] }).stakeholder_enrichments) ??
    ((input as unknown as { core_intelligence_enrichments?: { stakeholder_enrichments?: StakeholderEnrichmentLike[] } }).core_intelligence_enrichments?.stakeholder_enrichments) ??
    [];

  const stakeholderDispositionById = new Map<string, string>();
  for (const e of stakeholderEnrichments) {
    if (e.disposition !== undefined && e.disposition !== null) {
      stakeholderDispositionById.set(e.stakeholder_id, e.disposition);
    }
  }

  // Union of all evidence_ids across all conflicts on the input.
  // Membership in this set means "this intelligence record participated
  // in at least one conflict" — what Check 4 requires.
  // Same shape question as stakeholder_enrichments — conflicts may be
  // top-level or nested under core_intelligence_enrichments depending on
  // Pass 3 merge convention.
  type ConflictLike = { evidence_ids?: string[] };
  const conflicts: ConflictLike[] =
    ((input as unknown as { conflicts?: ConflictLike[] }).conflicts) ??
    ((input as unknown as { core_intelligence_enrichments?: { conflicts?: ConflictLike[] } }).core_intelligence_enrichments?.conflicts) ??
    [];

  const conflictParticipantSet = new Set<string>();
  for (const c of conflicts) {
    for (const eid of c.evidence_ids ?? []) {
      conflictParticipantSet.add(eid);
    }
  }
  const conflictsExist = conflicts.length > 0;

  // ─────────────────────────────────────────────────────────────────────
  // Check 1 — evidence_ids resolution across every section
  // ─────────────────────────────────────────────────────────────────────
  const checkEvidence = (path: string, ids: string[] | undefined): void => {
    if (!ids) return;
    for (const id of ids) {
      if (!intelligenceIdSet.has(id)) {
        errors.push(
          `check_1: ${path}: evidence_id "${id}" does not resolve to any input.intelligence[].id`
        );
      }
    }
  };

  checkEvidence("top_line.evidence_ids", artifact.top_line.evidence_ids);

  if (artifact.what_changed) {
    artifact.what_changed.changes.forEach((ch, i) =>
      checkEvidence(`what_changed.changes[${i}].evidence_ids`, ch.evidence_ids)
    );
  }

  artifact.critical_risks.forEach((r, i) =>
    checkEvidence(`critical_risks[${i}].evidence_ids`, r.evidence_ids)
  );

  artifact.stakeholder_strategy.forEach((s, i) =>
    checkEvidence(`stakeholder_strategy[${i}].evidence_ids`, s.evidence_ids)
  );

  if (artifact.commercial_reality) {
    artifact.commercial_reality.asks.forEach((a, i) =>
      checkEvidence(
        `commercial_reality.asks[${i}].evidence_ids`,
        a.evidence_ids
      )
    );
    (artifact.commercial_reality.prior_concessions ?? []).forEach((c, i) =>
      checkEvidence(
        `commercial_reality.prior_concessions[${i}].evidence_ids`,
        c.evidence_ids
      )
    );
  }

  artifact.talk_track.key_questions.forEach((q, i) =>
    checkEvidence(
      `talk_track.key_questions[${i}].evidence_ids`,
      q.evidence_ids
    )
  );
  artifact.talk_track.objection_angles.forEach((o, i) =>
    checkEvidence(
      `talk_track.objection_angles[${i}].evidence_ids`,
      o.evidence_ids
    )
  );

  artifact.open_questions.forEach((q, i) =>
    checkEvidence(`open_questions[${i}].evidence_ids`, q.evidence_ids)
  );

  artifact.coaching_notes.forEach((c, i) =>
    checkEvidence(`coaching_notes[${i}].evidence_ids`, c.evidence_ids)
  );

  // ─────────────────────────────────────────────────────────────────────
  // Check 2 — posture equality (Pass 4 mirrors Pass 2, doctrine §3.4)
  // ─────────────────────────────────────────────────────────────────────
  const pass2Posture = input.opportunity?.deal_posture;
  if (pass2Posture === undefined) {
    errors.push(
      `check_2: input.opportunity.deal_posture is missing — cannot verify posture equality`
    );
  } else if (artifact.top_line.posture !== pass2Posture) {
    errors.push(
      `check_2: top_line.posture: Pass 4 emitted "${artifact.top_line.posture}" but Pass 2 deal_posture is "${pass2Posture}" — Pass 4 must mirror, not re-infer`
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Check 3 — stakeholder ID resolution + disposition mirror
  // ─────────────────────────────────────────────────────────────────────
  artifact.stakeholder_strategy.forEach((s, i) => {
    if (!stakeholderIdSet.has(s.stakeholder_id)) {
      errors.push(
        `check_3: stakeholder_strategy[${i}].stakeholder_id: "${s.stakeholder_id}" does not resolve to any input.stakeholders[].id`
      );
      return;
    }

    const pass4Disp = s.current_state?.disposition;
    if (pass4Disp === undefined || pass4Disp === null) return;

    const pass2Disp = stakeholderDispositionById.get(s.stakeholder_id);
    if (pass2Disp === undefined) {
      // Pass 2 did not set a disposition for this stakeholder. Pass 4
      // setting one is acceptable — it is not contradicting Pass 2,
      // since Pass 2 made no claim. No error.
      return;
    }

    if (pass4Disp !== pass2Disp) {
      errors.push(
        `check_3: stakeholder_strategy[${i}].current_state.disposition: Pass 4 emitted "${pass4Disp}" but Pass 2 enriched "${s.stakeholder_name}" (${s.stakeholder_id}) as "${pass2Disp}" — Pass 4 must mirror, not contradict`
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Check 4 — source_conflict_evidence_ids compound resolution
  //   (a) every ID resolves to input.intelligence[].id
  //   (b) every ID appears in at least one input.conflicts[].evidence_ids
  // No-op when input.conflicts is empty — the field will be absent on
  // every risk and there is nothing to validate against.
  // ─────────────────────────────────────────────────────────────────────
  artifact.critical_risks.forEach((r: CriticalRisk, i) => {
    const ids = r.source_conflict_evidence_ids;
    if (!ids || ids.length === 0) return;

    for (const id of ids) {
      if (!intelligenceIdSet.has(id)) {
        errors.push(
          `check_4a: critical_risks[${i}].source_conflict_evidence_ids: "${id}" does not resolve to any input.intelligence[].id`
        );
        continue;
      }
      if (!conflictParticipantSet.has(id)) {
        errors.push(
          `check_4b: critical_risks[${i}].source_conflict_evidence_ids: "${id}" resolves to intelligence but did not participate in any input.conflicts[].evidence_ids — risk claims conflict lineage that Pass 2 did not produce`
        );
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // Check 5 — RESERVED. Not implemented; PrepArtifact contract has no
  // meeting_id field yet. When the field is added, this is where the
  // linkage check belongs.
  // ─────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────
  // Check 6 — deal_thesis evidence resolution
  //   formed: every evidence_id must resolve to input.intelligence[].id
  //   indeterminate: no-op (Layer A enforces empty evidence_ids)
  // ─────────────────────────────────────────────────────────────────────
  let check6Exercised = false;
  if (artifact.deal_thesis && artifact.deal_thesis.status === 'formed') {
    check6Exercised = true;
    for (const id of artifact.deal_thesis.evidence_ids) {
      if (!intelligenceIdSet.has(id)) {
        errors.push(
          `check_6: deal_thesis.evidence_ids: "${id}" does not resolve to any input.intelligence[].id`
        );
      }
    }
  }

  // ── Check 7: pre-mortem path integrity ──────────────────────────────
  //
  // Layer A (zod) enforces shape; Layer B enforces semantics that
  // schemas can't express:
  //   7a. forcing_move ownership — must be rep-actioned, not "team" /
  //       "stakeholders" / "org"
  //   7b. no hedging language in forcing_move ("consider", "might help",
  //       "try to", "explore")
  //   7c. solvable_pre_event must be true (else path should have been
  //       dropped pre-render)
  //   7d. distinct primary_driver — no two paths share a driver
  //   7e. if_no_action template match — must contain "→" markers showing
  //       causal chain
  //   7f. failure_path causal chain — must contain "→" or " then " to
  //       prove X→Y→Z structure rather than risk labeling
  //   7g. primary_driver MUST match the declared altitude on the
  //       artifact. Stakeholder altitude → driver is a stakeholder_id
  //       from substrate. Committee altitude → driver matches a
  //       committee/review-forum keyword. Commercial → commercial
  //       keywords. Governance → governance keywords. This is the
  //       altitude-diagnosis fix — system was reasoning at the
  //       wrong altitude and producing specific-but-wrong output.
  const paths = artifact.pre_mortem_paths ?? [];
  const FORCING_MOVE_HEDGES = [
    /\bconsider\b/i,
    /\bmight (?:help|want|consider)\b/i,
    /\btry to\b/i,
    /\bexplore\b/i,
    /\bperhaps\b/i,
    /\bmaybe\b/i,
  ];
  const FORCING_MOVE_DIFFUSED_OWNERS = [
    /\bteam\b/i,
    /\bstakeholders?\b/i,
    /\borg\b/i,
    /\borganization\b/i,
    /\beveryone\b/i,
  ];
  // Altitude-keyword sets for check 7g. Lowercased substring match on
  // primary_driver. Conservative — false negatives (rejecting a valid
  // committee path because the driver string didn't include "committee")
  // are recoverable via retry; false positives (accepting a stakeholder-
  // level path on a committee-gated deal) are the failure mode this
  // check exists to prevent.
  const ALTITUDE_KEYWORDS: Record<string, RegExp[]> = {
    committee: [
      /committee/i,
      /steering/i,
      /\bsteerco\b/i,
      /\bboard\b/i,
      /investment[_\s-]?committee/i,
      /exec(?:utive)?[_\s-]?review/i,
      /review[_\s-]?forum/i,
    ],
    commercial: [
      /pricing/i,
      /price/i,
      /redline/i,
      /contract/i,
      /procurement/i,
      /\bdiscount/i,
      /\bmsa\b/i,
      /\bsow\b/i,
      /commercial[_\s-]?terms/i,
      /paper[_\s-]?process/i,
    ],
    governance: [
      /\blegal\b/i,
      /\binfosec\b/i,
      /\bsecurity\b/i,
      /compliance/i,
      /\bsox\b/i,
      /\bgdpr\b/i,
      /data[_\s-]?residency/i,
      /\bvendor[_\s-]?review\b/i,
    ],
  };
  const declaredAltitude = artifact.metadata?.declared_altitude ?? null;

  const driversSeen = new Set<string>();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const prefix = `check_7: pre_mortem_paths[${i}]`;
    // 7a + 7b — forcing_move discipline
    for (const re of FORCING_MOVE_HEDGES) {
      if (re.test(p.forcing_move)) {
        errors.push(
          `${prefix}.forcing_move: hedging language not allowed (matched ${re}). Forcing moves must be binary and direct.`,
        );
      }
    }
    for (const re of FORCING_MOVE_DIFFUSED_OWNERS) {
      // Allow "team" if it appears after "your" (as in "your team is…");
      // forbid "get the team to…" patterns that diffuse ownership.
      if (re.test(p.forcing_move) && !/your\s+\w+/i.test(p.forcing_move)) {
        errors.push(
          `${prefix}.forcing_move: ownership is diffuse (matched ${re}). Must be a single rep-executable action.`,
        );
      }
    }
    // 7c — solvability self-assertion
    if (p.solvable_pre_event !== true) {
      errors.push(
        `${prefix}.solvable_pre_event: must be true at this stage (paths flagged unsolvable should have been filtered pre-render).`,
      );
    }
    // 7d — distinct primary_driver
    const driverKey = p.primary_driver.trim().toLowerCase();
    if (driversSeen.has(driverKey)) {
      errors.push(
        `${prefix}.primary_driver: duplicate driver "${p.primary_driver}" — each path must be driven by a distinct actor or constraint.`,
      );
    } else {
      driversSeen.add(driverKey);
    }
    // 7e — if_no_action template match
    if (!/→/.test(p.if_no_action)) {
      errors.push(
        `${prefix}.if_no_action: must follow template "If you do nothing: [actor] X → [next actor] Y → [outcome Z]" — at least one "→" marker required.`,
      );
    }
    // 7f — failure_path causal chain
    if (!/→/.test(p.failure_path) && !/\bthen\b/i.test(p.failure_path)) {
      errors.push(
        `${prefix}.failure_path: must express causal chain X → Y → Z, not just risk labeling.`,
      );
    }
    // 7g — primary_driver must match declared altitude
    if (declaredAltitude) {
      const driver = p.primary_driver;
      if (declaredAltitude === "stakeholder") {
        // Driver must resolve to a known stakeholder_id from substrate.
        if (!stakeholderIdSet.has(driver)) {
          errors.push(
            `${prefix}.primary_driver: declared_altitude="stakeholder" requires driver "${driver}" to resolve to a known stakeholder_id from input.stakeholders. Got a non-stakeholder key — wrong altitude.`,
          );
        }
      } else {
        // For committee / commercial / governance: driver must NOT be
        // a stakeholder_id (that would be an actor-level path, wrong
        // altitude), AND must match at least one keyword for the
        // declared altitude.
        if (stakeholderIdSet.has(driver)) {
          errors.push(
            `${prefix}.primary_driver: declared_altitude="${declaredAltitude}" forbids individual-actor drivers — "${driver}" resolves to a stakeholder_id. Reframe at altitude "${declaredAltitude}".`,
          );
        } else {
          const patterns = ALTITUDE_KEYWORDS[declaredAltitude] ?? [];
          if (
            patterns.length > 0 &&
            !patterns.some((rx) => rx.test(driver))
          ) {
            errors.push(
              `${prefix}.primary_driver: declared_altitude="${declaredAltitude}" requires driver "${driver}" to match an altitude-typical keyword (one of: ${patterns.map((p) => p.source).join(", ")}). Reframe or drop the path.`,
            );
          }
        }
      }
    }
  }

  // ── Determine which checks were exercised ───────────────────────────
  const anyEvidenceArrays =
    (artifact.top_line.evidence_ids?.length ?? 0) > 0 ||
    artifact.critical_risks.length > 0 ||
    artifact.stakeholder_strategy.length > 0 ||
    artifact.coaching_notes.length > 0;

  const anySourceConflictPopulated = artifact.critical_risks.some(
    (r) => (r.source_conflict_evidence_ids?.length ?? 0) > 0
  );

  return {
    valid: errors.length === 0,
    errors,
    exercised: {
      check_1_evidence_resolution: anyEvidenceArrays,
      check_2_posture_equality:
        input.opportunity?.deal_posture !== undefined,
      check_3_stakeholder_mirror: artifact.stakeholder_strategy.length > 0,
      check_4_source_conflict: conflictsExist && anySourceConflictPopulated,
      check_5_meeting_linkage: false, // reserved
      check_6_deal_thesis: check6Exercised,
      check_7_premortem_integrity: paths.length > 0,
    },
  };
}
