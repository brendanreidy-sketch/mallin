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

  it("normalizes a count-over-budget draft to the caps and succeeds (no rejection)", async () => {
    // Executive-deck hard caps: an over-count section is deterministically TRIMMED
    // to its cap before validation (not rejected). makeOverBudgetDraft has 7 risks;
    // it is coerced to the cap and renders on the first attempt.
    const res = await generateExecutiveBrief(request, clientReturning(makeOverBudgetDraft()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempts).toBe(1); // trimming alone made it valid — no repair needed
    expect(res.brief.risks.length).toBeLessThanOrEqual(4); // trimmed to the risks cap
  });

  it("permits exactly one constrained repair, then succeeds", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(invalidDraft(), makeValidDraft()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attempts).toBe(2);
  });

  it("fails closed when every output stays invalid — no partial brief, bounded attempts", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(invalidDraft(), invalidDraft()));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.attempts).toBe(4); // 1 initial + 3 repairs, then fail closed
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.map((e) => e.code)).toContain("confidence_raised");
    expect("brief" in res).toBe(false);
  });

  it("captures validation codes for every attempt on failure", async () => {
    const res = await generateExecutiveBrief(request, clientReturning(invalidDraft(), invalidDraft()));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.codesByAttempt.length).toBe(4); // one code list per attempt
    expect(res.codesByAttempt[0]).toContain("confidence_raised"); // initial draft
    expect(res.codesByAttempt.at(-1)).toContain("confidence_raised"); // last repair repeated it
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
    // A NESTED unknown field survives count-normalization (which only trims
    // arrays), so the strict schema still rejects it on both attempts.
    const schemaBad = makeValidDraft();
    (schemaBad.executiveSummary[0] as unknown as Record<string, unknown>).unexpectedNested = 1;
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
