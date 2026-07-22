import { describe, it, expect } from "vitest";
import { buildEvidencePacket, type DealSnapshot } from "./brief-evidence";
import { detectChanges, type BriefChangeType } from "./brief-change-detection";
import { currentSnapshot, previousSnapshot } from "./fixtures/brief-test-deal";

const current = buildEvidencePacket(currentSnapshot);
const previous = buildEvidencePacket(previousSnapshot);

function change(cs: ReturnType<typeof detectChanges>, type: BriefChangeType) {
  return cs.changes.find((c) => c.type === type);
}

describe("detectChanges — ordering", () => {
  it("returns an unresolved diagnostic and no changes with no previous snapshot", () => {
    const cs = detectChanges(current, null);
    expect(cs.ordering.resolved).toBe(false);
    expect(cs.ordering.basis).toBe("none");
    expect(cs.changes).toEqual([]);
  });

  it("does NOT collapse equal timestamps without a tie-breaker into 'nothing changed'", () => {
    const prevNoSeq = buildEvidencePacket({ ...previousSnapshot, sequence: undefined, capturedAt: current.capturedAt });
    const curNoSeq = buildEvidencePacket({ ...currentSnapshot, sequence: undefined });
    const cs = detectChanges(curNoSeq, prevNoSeq);
    expect(cs.ordering.resolved).toBe(false);
    expect(cs.ordering.detail).toMatch(/tie-breaker/);
    expect(cs.changes).toEqual([]);
  });

  it("resolves equal timestamps via an immutable sequence tie-breaker", () => {
    const prevEqualTs = buildEvidencePacket({ ...previousSnapshot, capturedAt: current.capturedAt });
    const cs = detectChanges(current, prevEqualTs);
    expect(cs.ordering.resolved).toBe(true);
    expect(cs.ordering.basis).toBe("sequence");
    expect(cs.changes.length).toBeGreaterThan(0);
  });

  it("returns unresolved when 'previous' is actually newer", () => {
    const cs = detectChanges(previous, current);
    expect(cs.ordering.resolved).toBe(false);
    expect(cs.changes).toEqual([]);
  });
});

describe("detectChanges — full fixture diff", () => {
  const cs = detectChanges(current, previous);

  it("resolves ordering by timestamp", () => {
    expect(cs.ordering.resolved).toBe(true);
    expect(cs.ordering.basis).toBe("timestamp");
    expect(cs.hasPriorState).toBe(true);
  });

  it("detects exactly the expected set of change types", () => {
    expect(cs.changes.map((c) => c.type).sort()).toEqual(
      [
        "amount_change",
        "close_date_change",
        "commitment_completed",
        "commitment_missed",
        "commitment_removed",
        "new_transcript_evidence",
        "next_action_change",
        "posture_change",
        "risk_new",
        "stage_change",
        "stakeholder_position_change",
      ].sort(),
    );
  });

  it("treats a seller-recorded stage move as observed", () => {
    const c = change(cs, "stage_change")!;
    expect(c.previousValue).toBe("Discovery");
    expect(c.currentValue).toBe("Evaluation");
    expect(c.assurance).toBe("observed");
    expect(c.sourceFactKeys.length).toBeGreaterThan(0);
  });

  it("marks an amount that became Not-confirmed as unresolved", () => {
    expect(change(cs, "amount_change")!.assurance).toBe("unresolved");
  });

  it("keeps disagreeing next-action sources visibly conflicting", () => {
    const c = change(cs, "next_action_change")!;
    expect(c.assurance).toBe("conflicting");
    expect(c.currentValue).toMatch(/^CONFLICT:/);
    expect(c.sourceFactKeys.length).toBe(2); // two distinct source facts
  });

  it("marks a Mallín posture change as inferred", () => {
    expect(change(cs, "posture_change")!.assurance).toBe("inferred");
  });

  it("detects the typed stakeholder position flip skeptic → supporter", () => {
    const c = change(cs, "stakeholder_position_change")!;
    expect(c.previousValue).toBe("skeptic");
    expect(c.currentValue).toBe("supporter");
    expect(c.assurance).toBe("inferred");
  });

  it("detects a newly introduced typed risk", () => {
    const c = change(cs, "risk_new")!;
    expect(c.logicalKey).toBe("risk:r_champion_exit");
    expect(c.currentValue).toBe("blocking");
  });

  it("classifies a completed commitment WITH proof as observed", () => {
    const c = change(cs, "commitment_completed")!;
    expect(c.logicalKey).toBe("commit:c_security");
    expect(c.previousValue).toBe("open");
    expect(c.currentValue).toBe("done");
    expect(c.assurance).toBe("observed"); // stateEvidence present
  });

  it("classifies an explicitly missed commitment as inferred (no external proof)", () => {
    const c = change(cs, "commitment_missed")!;
    expect(c.logicalKey).toBe("commit:c_pricing");
    expect(c.currentValue).toBe("missed");
    expect(c.assurance).toBe("inferred");
  });

  it("reports a disappeared commitment as removed + unresolved, NOT completed", () => {
    const c = change(cs, "commitment_removed")!;
    expect(c.logicalKey).toBe("commit:c_legal");
    expect(c.previousValue).toBe("open");
    expect(c.currentValue).toBeNull();
    expect(c.assurance).toBe("unresolved");
    // It must NOT be reported as completed.
    expect(cs.changes.some((x) => x.type === "commitment_completed" && x.logicalKey === "commit:c_legal")).toBe(false);
  });

  it("detects new transcript evidence recorded this cycle", () => {
    const c = change(cs, "new_transcript_evidence")!;
    expect(c.logicalKey).toBe("txn:call_nw_2");
    expect(c.effectiveDate).toBe("2026-07-15");
    expect(c.assurance).toBe("observed");
  });

  it("retains superseded prior evidence, never treating it as current", () => {
    for (const item of cs.superseded) expect(item.status).toBe("superseded");
    const keys = cs.superseded.map((i) => i.logicalKey);
    expect(keys).toContain("opp:stage");
    expect(keys).toContain("commit:c_legal"); // removed → prior retained
    expect(keys).not.toContain("stk:sh_marcus:disposition"); // unchanged → not superseded
  });

  it("is deterministic — same packets yield a deeply-equal ChangeSet", () => {
    expect(detectChanges(current, previous)).toEqual(cs);
  });
});

describe("detectChanges — date-based miss requires an explicit asOf", () => {
  const mini = (snapshotId: string, sequence: number, capturedAt: string): DealSnapshot => ({
    tenantId: "t", dealId: "d", snapshotId, sequence, capturedAt,
    opportunity: { recordId: "o", name: "Deal", origin: "seller_entered" },
    prep: {
      versionId: `p_${snapshotId}`, generatedAt: capturedAt, criticalRisks: [], stakeholderStates: [],
      commitments: [{ id: "c_late", label: "Late thing", state: "open", expectedBy: "2026-07-01" }],
    },
    transcripts: [],
  });
  const prev = buildEvidencePacket(mini("s1", 1, "2026-06-15T00:00:00.000Z"));
  const cur = buildEvidencePacket(mini("s2", 2, "2026-07-18T00:00:00.000Z"));

  it("does NOT infer a miss from a date alone when asOf is absent", () => {
    const cs = detectChanges(cur, prev);
    expect(cs.changes.some((c) => c.type === "commitment_missed")).toBe(false);
  });

  it("infers a miss only when an explicit asOf proves the due date has passed", () => {
    const cs = detectChanges(cur, prev, { asOf: "2026-08-01T00:00:00.000Z" });
    const c = change(cs, "commitment_missed")!;
    expect(c.logicalKey).toBe("commit:c_late");
    expect(c.assurance).toBe("inferred");
  });
});
