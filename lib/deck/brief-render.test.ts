import { describe, it, expect, beforeAll } from "vitest";
import { assembleBrief, type ExecutiveBrief } from "./brief-model";
import { buildCover } from "./brief-agent";
import { makeValidDraft, request } from "./fixtures/brief-mock-drafts";
import { buildBriefPptx, type BriefRenderResult } from "./build-brief-pptx";

const PAGE_W = 13.333;
const PAGE_H = 7.5;

function brief(): ExecutiveBrief {
  return assembleBrief(makeValidDraft(), buildCover(request)).brief;
}

/** All content-item texts across the assembled brief (source of truth). */
function modelTexts(b: ExecutiveBrief): Set<string> {
  const items = [
    ...b.executiveSummary,
    ...(b.whatChanged ?? []),
    ...b.customerPriorities,
    ...b.stakeholders,
    ...b.decisionProcess,
    ...b.risks,
    ...b.actionPlan.customerCommitments,
    ...b.actionPlan.inferredCustomerCommitments,
    ...b.actionPlan.sellerActions,
    ...b.actionPlan.mallinRecommendations,
    ...b.actionPlan.unresolvedActions,
    ...b.appendix,
  ];
  return new Set(items.map((i) => i.text));
}

let res: BriefRenderResult;
let b: ExecutiveBrief;
beforeAll(async () => {
  b = brief();
  res = await buildBriefPptx(b);
});

describe("buildBriefPptx — input contract", () => {
  it("rejects a raw unvalidated BriefDraft (no cover)", async () => {
    // makeValidDraft() is a BriefDraft, not an assembled ExecutiveBrief.
    await expect(buildBriefPptx(makeValidDraft() as unknown as ExecutiveBrief)).rejects.toThrow(/validated, assembled/i);
  });
});

describe("buildBriefPptx — output", () => {
  it("produces valid PPTX/OOXML (PK zip, non-trivial size)", () => {
    expect(res.buffer.length).toBeGreaterThan(20000);
    expect(res.buffer.subarray(0, 2).toString("latin1")).toBe("PK"); // zip signature
  });

  it("renders the expected primary slides in order", () => {
    expect(res.report.slides.map((s) => s.title)).toEqual([
      "Cover",
      "Executive summary",
      "What changed",
      "Customer priorities & outcomes",
      "Stakeholder influence",
      "Decision process & commercial path",
      "Risks, gaps & contradictions",
      "Recommended action plan",
      "Evidence appendix",
    ]);
  });

  it("shows INTERNAL & CONFIDENTIAL on every slide", () => {
    for (const s of res.report.slides) {
      const hasClass = s.elements.some((e) => (e.text ?? "").includes("INTERNAL & CONFIDENTIAL")) || (s.title === "Cover");
      expect(hasClass).toBe(true);
    }
    // Cover carries the classification badge too.
    expect(res.report.slides[0].elements.some((e) => e.text === "INTERNAL & CONFIDENTIAL")).toBe(true);
  });

  it("omits empty sections rather than rendering blank slides", async () => {
    const draft = makeValidDraft();
    draft.stakeholders = [];
    const r = await buildBriefPptx(assembleBrief(draft, buildCover(request)).brief);
    expect(r.report.slides.map((s) => s.title)).not.toContain("Stakeholder influence");
  });

  it("renders every factual slide text from the validated model (no invention)", () => {
    const texts = modelTexts(b);
    const factualKinds = new Set(["conclusion-text", "change-text", "priority-text", "stakeholder-text", "decision-text", "action-line", "appendix-text"]);
    for (const s of res.report.slides) {
      for (const e of s.elements) {
        if (!factualKinds.has(e.kind)) continue;
        let t = e.text ?? "";
        if (t.startsWith("Not confirmed — ")) t = t.slice("Not confirmed — ".length);
        if (t.startsWith("•  ")) t = t.slice(3);
        expect(texts.has(t)).toBe(true);
      }
    }
  });

  it("keeps the six commitment categories distinct", () => {
    const headers = res.report.slides.flatMap((s) => s.elements).filter((e) => e.kind === "action-category-header").map((e) => e.text);
    expect(headers).toContain("CUSTOMER-STATED COMMITMENTS");
    expect(headers).toContain("SELLER-RECORDED COMMITMENTS");
    expect(headers).toContain("INFERRED POSSIBLE COMMITMENTS");
    // Confirmed and inferred are separate headers.
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("never labels a seller-recorded commitment as customer-confirmed", () => {
    const allText = res.report.slides.flatMap((s) => s.elements).map((e) => e.text ?? "").join(" | ");
    expect(allText.toLowerCase()).not.toContain("customer-confirmed");
    expect(allText.toLowerCase()).not.toContain("customer confirmed");
    // The seller-recorded row (ac2) marker must not claim "Customer stated".
    const ac2 = b.actionPlan.customerCommitments[1];
    expect(ac2.provenance).not.toContain("customer_stated");
  });

  it("respects minimum font sizes and never emits empty text", () => {
    for (const s of res.report.slides) {
      for (const e of s.elements) {
        if (e.fontSize == null) continue;
        expect(e.fontSize).toBeGreaterThanOrEqual(9); // footer floor
        expect((e.text ?? "").length).toBeGreaterThan(0); // no empty placeholder
        // Primary body/conclusion text never below the approved minimum.
        if (["conclusion-text", "change-text", "priority-text", "stakeholder-text", "decision-text", "action-line"].includes(e.kind)) {
          expect(e.fontSize).toBeGreaterThanOrEqual(16);
        }
      }
    }
  });

  it("keeps every element inside the 13.333 × 7.5 slide", () => {
    for (const s of res.report.slides) {
      for (const e of s.elements) {
        expect(e.x).toBeGreaterThanOrEqual(-0.001);
        expect(e.y).toBeGreaterThanOrEqual(-0.001);
        expect(e.x + e.w).toBeLessThanOrEqual(PAGE_W + 0.01);
        expect(e.y + e.h).toBeLessThanOrEqual(PAGE_H + 0.01);
      }
    }
  });

  it("moves overflow to appendix slides and reports it — no silent drops", () => {
    expect(res.diagnostics.some((d) => d.code === "section_overflow_to_appendix")).toBe(true);
    expect(res.report.slides.some((s) => s.title.startsWith("Evidence appendix"))).toBe(true);
    // Every model item text is rendered somewhere (on a section slide or appendix).
    const rendered = new Set(res.report.slides.flatMap((s) => s.elements).map((e) => (e.text ?? "").replace(/^Not confirmed — /, "").replace(/^•\s\s/, "")));
    for (const t of modelTexts(b)) {
      const cell = res.report.slides.some((s) => s.elements.some((e) => e.kind === "risk-table")) && b.risks.some((r) => r.text === t);
      expect(rendered.has(t) || cell).toBe(true);
    }
  });

  it("carries detailed evidence in speaker notes (pptxgenjs addNotes)", () => {
    const withNotes = res.report.slides.filter((s) => s.notes && s.notes.length > 0);
    expect(withNotes.length).toBeGreaterThan(0);
    expect(withNotes[0].notes).toMatch(/evidence:/);
  });
});
