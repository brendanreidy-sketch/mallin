import { describe, it, expect } from "vitest";
import { parseBriefDraftStrict, BRIEF_CAPS } from "./brief-schema";
import { makeValidDraft } from "./fixtures/brief-mock-drafts";
import type { BriefContentItem, BriefDraft } from "./brief-model";

describe("parseBriefDraftStrict", () => {
  it("accepts a well-formed draft", () => {
    expect(parseBriefDraftStrict(makeValidDraft()).ok).toBe(true);
  });

  it("rejects non-object / malformed JSON shapes", () => {
    expect(parseBriefDraftStrict(null).ok).toBe(false);
    expect(parseBriefDraftStrict("not an object").ok).toBe(false);
    expect(parseBriefDraftStrict({ executiveSummary: [] }).ok).toBe(false); // missing sections
  });

  it("rejects unknown fields (strict)", () => {
    const d = makeValidDraft() as unknown as Record<string, unknown>;
    (d.executiveSummary as unknown[])[0] = { ...(d.executiveSummary as Record<string, unknown>[])[0], surprise: true };
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a missing required field", () => {
    const d = makeValidDraft() as unknown as Record<string, unknown>;
    const item = { ...(d.executiveSummary as Record<string, unknown>[])[0] };
    delete item.contentType;
    (d.executiveSummary as unknown[])[0] = item;
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a bad enum value", () => {
    const d = makeValidDraft();
    (d.executiveSummary[0] as unknown as Record<string, unknown>).contentType = "bogus_type";
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a malformed evidence id / source-fact key format", () => {
    const d = makeValidDraft();
    d.executiveSummary[0].evidenceIds = ["not-an-ev-id"];
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects duplicate content ids", () => {
    const d = makeValidDraft();
    d.executiveSummary[1].id = d.executiveSummary[0].id;
    const r = parseBriefDraftStrict(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /Duplicate content id/.test(e.message))).toBe(true);
  });

  it("rejects an over-large section (structural cap)", () => {
    const d = makeValidDraft();
    d.executiveSummary = Array.from({ length: 41 }, (_, i) => ({ ...makeValidDraft().executiveSummary[0], id: `es_${i}` }));
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects a nested factBinding with an unknown field", () => {
    const d = makeValidDraft();
    (d.executiveSummary[0].factBindings[0] as unknown as Record<string, unknown>).extra = 1;
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });
});

// ── Executive-deck hard caps (BRIEF_CAPS) enforced at the schema ──────────────
describe("BriefDraftSchema — executive-deck hard caps", () => {
  const clone = (base: BriefContentItem, id: string): BriefContentItem => ({ ...structuredClone(base), id });
  const items = (n: number, prefix: string): BriefContentItem[] =>
    Array.from({ length: n }, (_, i) => clone(makeValidDraft().executiveSummary[0], `${prefix}${i}`));

  it("accepts the at-cap valid fixture", () => {
    expect(parseBriefDraftStrict(makeValidDraft()).ok).toBe(true);
  });

  it("rejects each section one item over its cap", () => {
    const overBy1: Array<[keyof BriefDraft, number]> = [
      ["executiveSummary", BRIEF_CAPS.executiveSummary],
      ["whatChanged", BRIEF_CAPS.whatChanged],
      ["customerPriorities", BRIEF_CAPS.customerPriorities],
      ["stakeholders", BRIEF_CAPS.stakeholders],
      ["decisionProcess", BRIEF_CAPS.decisionProcess],
      ["risks", BRIEF_CAPS.risks],
    ];
    for (const [key, cap] of overBy1) {
      const d = makeValidDraft();
      (d[key] as BriefContentItem[]) = items(cap + 1, String(key));
      expect(parseBriefDraftStrict(d).ok, String(key)).toBe(false);
    }
  });

  it("rejects an action bucket over 3, and a combined total over 8", () => {
    const d1 = makeValidDraft();
    d1.actionPlan.sellerActions = items(BRIEF_CAPS.actionBucket + 1, "sa");
    expect(parseBriefDraftStrict(d1).ok).toBe(false);

    const d2 = makeValidDraft(); // 3 + 3 + 3 = 9 > 8, each bucket ≤ 3
    d2.actionPlan.customerCommitments = items(3, "cc");
    d2.actionPlan.sellerActions = items(3, "sx");
    d2.actionPlan.mallinRecommendations = items(3, "mr");
    d2.actionPlan.inferredCustomerCommitments = [];
    d2.actionPlan.unresolvedActions = [];
    expect(parseBriefDraftStrict(d2).ok).toBe(false);
  });

  it("rejects a non-empty appendix", () => {
    const d = makeValidDraft();
    d.appendix = items(1, "ap");
    expect(parseBriefDraftStrict(d).ok).toBe(false);
  });

  it("rejects per-item over-limits (text, evidenceIds, sourceFactKeys, factBindings, provenance)", () => {
    const okAfter = (mut: (it: BriefContentItem) => void): boolean => {
      const d = makeValidDraft();
      mut(d.executiveSummary[0]);
      return parseBriefDraftStrict(d).ok;
    };
    const binding = { evidenceId: "ev:x", sourceFactKey: "sf:x", payloadKind: "risk", fieldPath: "severity", value: "high" };
    expect(okAfter((it) => (it.text = "x".repeat(BRIEF_CAPS.itemText + 1)))).toBe(false);
    expect(okAfter((it) => (it.evidenceIds = Array(BRIEF_CAPS.evidenceIds + 1).fill("ev:x")))).toBe(false);
    expect(okAfter((it) => (it.sourceFactKeys = Array(BRIEF_CAPS.sourceFactKeys + 1).fill("sf:x")))).toBe(false);
    expect(okAfter((it) => (it.factBindings = Array(BRIEF_CAPS.factBindings + 1).fill(binding) as BriefContentItem["factBindings"]))).toBe(false);
    expect(okAfter((it) => (it.provenance = Array(BRIEF_CAPS.provenance + 1).fill("customer_stated") as BriefContentItem["provenance"]))).toBe(false);
  });
});
