import { describe, it, expect } from "vitest";
import { generateExecutiveBrief, type BriefModelClient } from "./brief-agent";
import type { BriefDraft } from "./brief-model";
import { makeOverBudgetDraft, makeValidDraft, noPriorChangeSet, request } from "./fixtures/brief-mock-drafts";

const clientReturning = (...drafts: BriefDraft[]): BriefModelClient => {
  let n = 0;
  return async () => drafts[Math.min(n++, drafts.length - 1)];
};

function invalidDraft(): BriefDraft {
  const d = makeValidDraft();
  d.executiveSummary[0].confidence = "high"; // raised confidence → rejected
  return d;
}

describe("generateExecutiveBrief", () => {
  it("produces a validated brief on a clean first attempt", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(makeValidDraft()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempts).toBe(1);
    expect(res.movedToAppendix).toEqual([]);
    expect(res.brief.executiveSummary.length).toBeGreaterThan(0);
    expect(res.brief.cover.classification).toBe("INTERNAL & CONFIDENTIAL");
    expect(res.brief.whatChanged?.length).toBe(5);
  });

  it("is deterministic — same mocked output yields the same brief", async () => {
    const a = await generateExecutiveBrief(request, clientReturning(makeValidDraft()));
    const b = await generateExecutiveBrief(request, clientReturning(makeValidDraft()));
    expect(a).toEqual(b);
  });

  it("moves supported overflow into the appendix rather than dropping it", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(makeOverBudgetDraft()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.brief.risks.length).toBe(5); // budget
    expect(res.movedToAppendix.length).toBe(2); // 7 - 5
    for (const id of res.movedToAppendix) {
      expect(res.brief.appendix.some((a) => a.id === id)).toBe(true);
    }
  });

  it("permits exactly one constrained repair, then succeeds", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(invalidDraft(), makeValidDraft()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempts).toBe(2);
  });

  it("fails closed when a second output is still invalid — no partial brief", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(invalidDraft(), invalidDraft()));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.attempts).toBe(2);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.map((e) => e.code)).toContain("confidence_raised");
    expect("brief" in res).toBe(false);
  });

  it("omits the 'what changed' section when there is no reliable prior state", async () => {
    const draft = makeValidDraft();
    draft.whatChanged = []; // no material change to report without a prior
    const res = await generateExecutiveBrief({ ...request, changeSet: noPriorChangeSet }, clientReturning(draft));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.brief.whatChanged).toBeUndefined();
  });
});
