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
    expect(res.brief.whatChanged?.length).toBe(3);
  });

  it("is deterministic — same mocked output yields the same brief", async () => {
    const a = await generateExecutiveBrief(request, clientReturning(makeValidDraft()));
    const b = await generateExecutiveBrief(request, clientReturning(makeValidDraft()));
    expect(a).toEqual(b);
  });

  it("rejects a draft that exceeds a section cap (hard caps, not appendix overflow)", async () => {
    // Executive-deck hard caps: an over-budget section is REJECTED by the strict
    // schema (no overflow-to-appendix). makeOverBudgetDraft has 7 risks > cap 4.
    const res = await generateExecutiveBrief(request, clientReturning(makeOverBudgetDraft()));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.code === "schema_invalid")).toBe(true);
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

  it("parses the repair response through the same strict schema", async () => {
    const schemaBad = makeValidDraft() as unknown as Record<string, unknown>;
    (schemaBad.executiveSummary as Record<string, unknown>[])[0].bogusField = true; // schema-invalid
    const res = await generateExecutiveBrief(request, clientReturning(schemaBad as unknown as BriefDraft, makeValidDraft()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempts).toBe(2);
  });

  it("fails closed when a schema-invalid repair is returned", async () => {
    const schemaBad = { ...makeValidDraft(), unexpectedTopLevel: 1 } as unknown as BriefDraft;
    const res = await generateExecutiveBrief(request, clientReturning(schemaBad, schemaBad));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.code === "schema_invalid")).toBe(true);
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
