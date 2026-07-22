import { describe, it, expect } from "vitest";
import { validateBriefDraft, type ValidationErrorCode } from "./brief-validator";
import { buildCover } from "./brief-agent";
import { FACTUAL_CONTENT_TYPES, type BriefDraft } from "./brief-model";
import {
  changeSet,
  makeValidDraft,
  noPriorChangeSet,
  packet,
  request,
  factKeyOf,
} from "./fixtures/brief-mock-drafts";

const cover = buildCover(request);
const ctx = { packet, changeSet, cover };
const noPriorCtx = { packet, changeSet: noPriorChangeSet, cover };

function codes(draft: BriefDraft, c = ctx): ValidationErrorCode[] {
  return validateBriefDraft(draft, c).errors.map((e) => e.code);
}

describe("validateBriefDraft — the valid Northwind draft", () => {
  it("passes clean", () => {
    const result = validateBriefDraft(makeValidDraft(), ctx);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("every factual output references evidence that exists", () => {
    const draft = makeValidDraft();
    const evIds = new Set(packet.items.map((i) => i.evidenceId));
    const changeIds = new Set(changeSet.changes.flatMap((c) => [...c.previousEvidenceIds, ...c.currentEvidenceIds]));
    const items = [
      ...draft.executiveSummary,
      ...draft.customerPriorities,
      ...draft.stakeholders,
      ...draft.decisionProcess,
      ...draft.risks,
      ...draft.whatChanged,
      ...draft.actionPlan.customerCommitments,
      ...draft.actionPlan.sellerActions,
      ...draft.actionPlan.mallinRecommendations,
      ...draft.actionPlan.unresolvedActions,
    ];
    for (const item of items) {
      if (!FACTUAL_CONTENT_TYPES.has(item.contentType)) continue;
      expect(item.evidenceIds.length).toBeGreaterThan(0);
      for (const id of item.evidenceIds) expect(evIds.has(id) || changeIds.has(id)).toBe(true);
    }
  });

  it("keeps a supported completed commitment", () => {
    expect(codes(makeValidDraft())).not.toContain("completed_commitment_without_evidence");
  });

  it("keeps a labeled, evidence-backed Mallín recommendation", () => {
    const rec = makeValidDraft().actionPlan.mallinRecommendations[0];
    expect(rec.contentType).toBe("mallin_recommendation");
    expect(rec.evidenceIds.length).toBeGreaterThan(0);
  });
});

describe("validateBriefDraft — rejections (fail closed)", () => {
  it("rejects a fabricated evidence id", () => {
    const d = makeValidDraft();
    d.executiveSummary[0].evidenceIds = ["ev:does-not-exist"];
    expect(codes(d)).toContain("evidence_id_not_found");
  });

  it("rejects an evidence id / source-fact key mismatch", () => {
    const d = makeValidDraft();
    d.executiveSummary[0].sourceFactKeys = [factKeyOf("opp:stage")]; // wrong fact for a posture evidence id
    expect(codes(d)).toContain("evidence_key_mismatch");
  });

  it("rejects a provenance upgrade to customer_stated", () => {
    const d = makeValidDraft();
    d.customerPriorities[0].provenance = ["customer_stated"]; // evidence is system_recorded
    expect(codes(d)).toContain("provenance_upgraded");
  });

  it("rejects raised confidence", () => {
    const d = makeValidDraft();
    d.executiveSummary[0].confidence = "high"; // posture ceiling is none
    expect(codes(d)).toContain("confidence_raised");
  });

  it("rejects a real evidence id paired with an unsupported claim (unbound entities)", () => {
    const d = makeValidDraft();
    // es1 still cites the (real) posture evidence, but the text now asserts a
    // fabricated amount, person, and date — none bound to typed evidence.
    d.executiveSummary[0].text = "Deal amount is $999,999 per Jane Halloway on 2031-01-01.";
    expect(codes(d)).toContain("unbound_fact");
  });

  it("rejects presenting a conflicting next action as a confirmed seller action", () => {
    const d = makeValidDraft();
    d.actionPlan.unresolvedActions[0].contentType = "seller_action"; // still nextActionClaim=true
    expect(codes(d)).toContain("unsupported_next_action");
  });

  it("rejects claiming a removed commitment was completed", () => {
    const d = makeValidDraft();
    const removedKey = changeSet.changes.find((c) => c.type === "commitment_removed")!.sourceFactKeys[0];
    d.actionPlan.sellerActions.push({
      ...makeValidDraft().actionPlan.sellerActions[0],
      id: "bad_removed",
      text: "The redline draft was completed.",
      commitmentClaim: { sourceFactKey: removedKey, status: "completed" },
    });
    expect(codes(d)).toContain("completed_commitment_without_evidence");
  });

  it("rejects a Mallín recommendation placed among customer commitments", () => {
    const d = makeValidDraft();
    const rec = makeValidDraft().actionPlan.mallinRecommendations[0];
    rec.id = "rec_moved"; // unique id so the schema's duplicate check doesn't fire first
    d.actionPlan.customerCommitments.push(rec);
    expect(codes(d)).toContain("recommendation_as_commitment");
  });

  it("rejects a conflicting item that is not labeled conflicting", () => {
    const d = makeValidDraft();
    d.decisionProcess[2].assurance = "observed"; // dp3 cites conflicting next-action evidence
    expect(codes(d)).toContain("conflict_unlabeled");
  });

  it("rejects an unresolved item written as certain", () => {
    const d = makeValidDraft();
    d.executiveSummary[2].assurance = "observed"; // es3 cites open_question amount
    expect(codes(d)).toContain("unresolved_written_as_certain");
  });

  it("omits 'what changed' when ordering is unresolved", () => {
    // The same draft that is valid WITH a prior state is rejected without one.
    expect(codes(makeValidDraft(), noPriorCtx)).toContain("what_changed_without_prior_state");
  });

  it("rejects a 'what changed' item absent from the ChangeSet", () => {
    const d = makeValidDraft();
    // Point a what-changed item at a real evidence id that is not in any change.
    const orphan = packet.items.find((i) => i.logicalKey === "intel:context:legacy-system")!;
    d.whatChanged[0] = {
      ...d.whatChanged[0],
      evidenceIds: [orphan.evidenceId],
      sourceFactKeys: [orphan.sourceFactKey],
    };
    expect(codes(d)).toContain("source_fact_key_not_found");
  });
});

describe("validateBriefDraft — typed fact bindings & 2A semantics", () => {
  it("rejects a bound value that does not match the typed payload", () => {
    const d = makeValidDraft();
    d.executiveSummary[0].factBindings[0].value = "advancing"; // posture is actually at_risk
    expect(codes(d)).toContain("binding_value_mismatch");
  });

  it("rejects a value bound to the wrong (uncited) evidence item", () => {
    const d = makeValidDraft();
    const stage = packet.items.find((i) => i.logicalKey === "opp:stage")!;
    d.executiveSummary[0].factBindings[0].evidenceId = stage.evidenceId; // es1 cites posture, not stage
    expect(codes(d)).toContain("binding_evidence_mismatch");
  });

  it("every 'what changed' item references a valid change id", () => {
    const d = makeValidDraft();
    const changeIds = new Set(changeSet.changes.map((c) => c.changeId));
    for (const wc of d.whatChanged) {
      const cids = wc.factBindings.map((b) => b.changeId).filter(Boolean);
      expect(cids.length).toBeGreaterThan(0);
      for (const cid of cids) expect(changeIds.has(cid!)).toBe(true);
    }
    expect(validateBriefDraft(d, ctx).valid).toBe(true);
  });

  it("rejects a 'what changed' item citing a non-existent change id", () => {
    const d = makeValidDraft();
    d.whatChanged[0].factBindings[0].changeId = "chg:does-not-exist";
    expect(codes(d)).toContain("change_id_not_found");
  });

  it("does not let a generic customer statement become a commitment", () => {
    const d = makeValidDraft();
    const t = packet.items.find((i) => i.logicalKey === "txn:call_nw_2:0")!;
    d.actionPlan.customerCommitments = [
      {
        id: "cc_bad",
        contentType: "customer_commitment",
        section: "action_plan",
        assertionMode: "sourced_fact",
        text: "The buyer committed to proceed.",
        evidenceIds: [t.evidenceId],
        sourceFactKeys: [t.sourceFactKey],
        factBindings: [{ evidenceId: t.evidenceId, sourceFactKey: t.sourceFactKey, payloadKind: "transcript_statement", fieldPath: "side", value: "buyer" }],
        provenance: ["customer_stated"],
        confidence: "none",
        assurance: "observed",
        appendixEligible: true,
      },
    ];
    expect(codes(d)).toContain("customer_commitment_not_typed");
  });

  it("allows an explicit, typed customer-party commitment", () => {
    expect(codes(makeValidDraft())).not.toContain("customer_commitment_not_typed");
  });

  it("rejects an invented owner or deadline in a recommendation", () => {
    const d = makeValidDraft();
    d.actionPlan.mallinRecommendations[0].text = "Recommend Sanjay Gupta finish this by 2026-08-15.";
    expect(codes(d)).toContain("unbound_fact");
  });

  it("rejects a supported_synthesis that introduces a new amount", () => {
    const d = makeValidDraft();
    d.executiveSummary[1].assertionMode = "supported_synthesis";
    d.executiveSummary[1].text = "The champion transition could cost $250,000 in pipeline.";
    expect(codes(d)).toContain("unbound_fact");
  });

  it("rejects asserting unresolved evidence as a sourced_fact", () => {
    const d = makeValidDraft();
    d.executiveSummary[2].assertionMode = "sourced_fact"; // es3 cites open_question amount
    expect(codes(d)).toContain("assertion_mode_invalid");
  });

  it("rejects a mislabeled recommendation assertion mode", () => {
    const d = makeValidDraft();
    d.actionPlan.mallinRecommendations[0].assertionMode = "sourced_fact";
    expect(codes(d)).toContain("assertion_mode_invalid");
  });
});
