import { describe, it, expect } from "vitest";
import { buildEvidencePacket } from "./brief-evidence";
import { detectChanges, type BriefChangeType } from "./brief-change-detection";
import { currentSnapshot, previousSnapshot } from "./fixtures/brief-test-deal";

const current = buildEvidencePacket(currentSnapshot);
const previous = buildEvidencePacket(previousSnapshot);

function change(cs: ReturnType<typeof detectChanges>, type: BriefChangeType) {
  return cs.changes.find((c) => c.type === type);
}

describe("detectChanges — ordering", () => {
  it("returns an unresolved diagnostic and no changes when there is no previous snapshot", () => {
    const cs = detectChanges(current, null);
    expect(cs.ordering.resolved).toBe(false);
    expect(cs.ordering.basis).toBe("none");
    expect(cs.hasPriorState).toBe(false);
    expect(cs.changes).toEqual([]);
    expect(cs.superseded).toEqual([]);
  });

  it("does NOT collapse equal timestamps without a tie-breaker into 'nothing changed'", () => {
    const prevNoSeq = buildEvidencePacket({ ...previousSnapshot, sequence: undefined, capturedAt: current.capturedAt });
    const curNoSeq = buildEvidencePacket({ ...currentSnapshot, sequence: undefined });
    const cs = detectChanges(curNoSeq, prevNoSeq);
    expect(cs.ordering.resolved).toBe(false);
    expect(cs.ordering.basis).toBe("none");
    expect(cs.ordering.detail).toMatch(/tie-breaker/);
    expect(cs.changes).toEqual([]);
  });

  it("resolves equal timestamps via an immutable sequence tie-breaker", () => {
    const prevEqualTs = buildEvidencePacket({ ...previousSnapshot, capturedAt: current.capturedAt }); // seq 1
    const cs = detectChanges(current, prevEqualTs); // current seq 2
    expect(cs.ordering.resolved).toBe(true);
    expect(cs.ordering.basis).toBe("sequence");
    expect(cs.changes.length).toBeGreaterThan(0);
  });

  it("returns unresolved when the 'previous' packet is actually newer", () => {
    const cs = detectChanges(previous, current); // mis-ordered on purpose
    expect(cs.ordering.resolved).toBe(false);
    expect(cs.changes).toEqual([]);
  });
});

describe("detectChanges — full fixture diff", () => {
  const cs = detectChanges(current, previous);

  it("resolves ordering by timestamp and establishes a prior state", () => {
    expect(cs.ordering.resolved).toBe(true);
    expect(cs.ordering.basis).toBe("timestamp");
    expect(cs.hasPriorState).toBe(true);
  });

  it("detects exactly the expected set of change types", () => {
    const types = cs.changes.map((c) => c.type).sort();
    expect(types).toEqual(
      [
        "amount_change",
        "close_date_change",
        "commitment_completed",
        "commitment_missed",
        "new_transcript_evidence",
        "next_action_change",
        "posture_change",
        "risk_new",
        "stage_change",
        "stakeholder_position_change",
      ].sort(),
    );
  });

  it("treats a seller-recorded stage move as observed, not customer-confirmed", () => {
    const c = change(cs, "stage_change")!;
    expect(c.previousValue).toBe("Discovery");
    expect(c.currentValue).toBe("Evaluation");
    expect(c.assurance).toBe("observed");
    expect(c.currentEvidenceIds.length).toBeGreaterThan(0);
    expect(c.previousEvidenceIds.length).toBeGreaterThan(0);
  });

  it("marks an amount that became Not-confirmed as unresolved", () => {
    const c = change(cs, "amount_change")!;
    expect(c.currentValue).toMatch(/Not confirmed/i);
    expect(c.assurance).toBe("unresolved");
  });

  it("keeps disagreeing next-action sources visibly conflicting", () => {
    const c = change(cs, "next_action_change")!;
    expect(c.assurance).toBe("conflicting");
    expect(c.currentValue).toMatch(/^CONFLICT:/);
    expect(c.currentValue).toMatch(/Redline MSA/);
    expect(c.currentValue).toMatch(/Escalate to economic buyer/);
  });

  it("marks a Mallín posture change as inferred", () => {
    const c = change(cs, "posture_change")!;
    expect(c.assurance).toBe("inferred");
    expect(c.previousValue).toBe("advancing");
    expect(c.currentValue).toBe("at_risk");
  });

  it("detects the typed stakeholder position flip skeptic → supporter", () => {
    const c = change(cs, "stakeholder_position_change")!;
    expect(c.logicalKey).toBe("stk:sh_dana:disposition");
    expect(c.previousValue).toBe("skeptic");
    expect(c.currentValue).toBe("supporter");
    expect(c.assurance).toBe("inferred");
  });

  it("detects a newly introduced typed risk", () => {
    const c = change(cs, "risk_new")!;
    expect(c.logicalKey).toBe("risk:r_champion_exit");
    expect(c.previousValue).toBeNull();
    expect(c.currentValue).toBe("blocking");
  });

  it("detects a completed commitment via typed state", () => {
    const c = change(cs, "commitment_completed")!;
    expect(c.logicalKey).toBe("commit:c_security");
    expect(c.previousValue).toBe("open");
    expect(c.currentValue).toBe("done");
  });

  it("detects a missed commitment (open past its expected date)", () => {
    const c = change(cs, "commitment_missed")!;
    expect(c.logicalKey).toBe("commit:c_pricing");
    expect(c.currentValue).toBe("open");
  });

  it("detects new transcript evidence recorded this cycle", () => {
    const c = change(cs, "new_transcript_evidence")!;
    expect(c.logicalKey).toBe("txn:call_nw_2");
    expect(c.currentEvidenceIds.length).toBe(1);
    expect(c.effectiveDate).toBe("2026-07-15");
    expect(c.assurance).toBe("observed"); // buyer statement, recorded
  });

  it("retains superseded prior evidence, never treating it as current", () => {
    expect(cs.superseded.length).toBeGreaterThan(0);
    for (const item of cs.superseded) expect(item.status).toBe("superseded");
    const keys = cs.superseded.map((i) => i.logicalKey);
    expect(keys).toContain("opp:stage");
    expect(keys).toContain("stk:sh_dana:disposition");
    // A commitment whose state did not move (missed) is NOT superseded.
    expect(keys).not.toContain("commit:c_pricing");
  });

  it("carries previous/current evidence ids and an effective date on value changes", () => {
    const c = change(cs, "close_date_change")!;
    expect(c.previousValue).toBe("2026-09-30");
    expect(c.currentValue).toBe("2026-11-15");
    expect(c.previousEvidenceIds.length).toBeGreaterThan(0);
    expect(c.currentEvidenceIds.length).toBeGreaterThan(0);
    expect(c.effectiveDate).toBeTruthy();
  });

  it("is deterministic — same packets yield a deeply-equal ChangeSet", () => {
    expect(detectChanges(current, previous)).toEqual(cs);
  });
});
