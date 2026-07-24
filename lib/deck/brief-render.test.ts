import { describe, it, expect, beforeAll } from "vitest";
import { assembleBrief, type ExecutiveBrief } from "./brief-model";
import { buildCover, generateExecutiveBrief, type ValidatedExecutiveBrief } from "./brief-agent";
import { makeValidDraft, renderableBrief, request } from "./fixtures/brief-mock-drafts";
import { buildBriefPptx, type BriefRenderResult } from "./build-brief-pptx";
import { humanize } from "./brief-layout";

const PAGE_W = 13.333;
const PAGE_H = 7.5;

/** All content-item texts (humanized, as the renderer shows them). */
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
  return new Set(items.map((i) => humanize(i.text)));
}

let res: BriefRenderResult;
let b: ValidatedExecutiveBrief;
beforeAll(async () => {
  b = await renderableBrief();
  res = await buildBriefPptx(b);
});

describe("buildBriefPptx — input contract (branded ValidatedExecutiveBrief)", () => {
  it("rejects a raw unvalidated BriefDraft", async () => {
    await expect(buildBriefPptx(makeValidDraft() as unknown as ValidatedExecutiveBrief)).rejects.toThrow(/ValidatedExecutiveBrief/i);
  });

  it("rejects a plain lookalike object (correct shape but unbranded)", async () => {
    const lookalike = JSON.parse(JSON.stringify(await renderableBrief())) as ValidatedExecutiveBrief; // drops the non-enumerable brand
    await expect(buildBriefPptx(lookalike)).rejects.toThrow(/ValidatedExecutiveBrief/i);
  });

  it("rejects an EvidencePacket", async () => {
    await expect(buildBriefPptx(request.packet as unknown as ValidatedExecutiveBrief)).rejects.toThrow();
  });

  it("rejects an assembled-but-unvalidated brief (assembleBrief output without the path)", async () => {
    const unbranded = assembleBrief(makeValidDraft(), buildCover(request)).brief as unknown as ValidatedExecutiveBrief;
    await expect(buildBriefPptx(unbranded)).rejects.toThrow(/ValidatedExecutiveBrief/i);
  });

  it("accepts only the validated assembler output", async () => {
    const r = await buildBriefPptx(await renderableBrief());
    expect(r.buffer.length).toBeGreaterThan(20000);
  });
});

describe("buildBriefPptx — output", () => {
  it("produces valid PPTX/OOXML (PK zip, non-trivial size)", () => {
    expect(res.buffer.length).toBeGreaterThan(20000);
    expect(res.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
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

  it("shows supported, evidence-backed cover facts and omits the unsupported amount", () => {
    const coverText = res.report.slides[0].elements.map((e) => e.text ?? "").join(" | ");
    expect(coverText).toContain("Northwind Freight"); // company name
    expect(coverText).toContain("Stage: Evaluation"); // supported stage
    expect(coverText).toContain("Latest incorporated call: 2026-07-15"); // explicit transcript metadata
    expect(coverText).toContain("Artifact version snap_nw_v2");
    expect(coverText).not.toMatch(/Amount:/); // amount is Not confirmed → omitted
    expect(coverText).not.toMatch(/Not confirmed/); // never shown on the cover
    // The cover facts are evidence-backed on the model.
    expect(b.cover.stage?.provenance).toBe("seller_provided");
    expect(b.cover.latestCallDate?.provenance).toBe("customer_stated");
    expect(b.cover.amount).toBeUndefined();
  });

  it("shows INTERNAL & CONFIDENTIAL on every slide", () => {
    for (const s of res.report.slides) {
      const hasClass = s.elements.some((e) => (e.text ?? "").includes("INTERNAL & CONFIDENTIAL")) || s.title === "Cover";
      expect(hasClass).toBe(true);
    }
    expect(res.report.slides[0].elements.some((e) => e.text === "INTERNAL & CONFIDENTIAL")).toBe(true);
  });

  it("never shows a raw underscore-style enum in visible slide text", () => {
    const enums = ["at_risk", "customer_stated", "seller_provided", "system_recorded", "mallin_inference", "open_question", "inferred_customer_commitment", "customer_commitment", "seller_action", "mallin_recommendation", "unresolved_action", "next_action", "deal_posture"];
    const proseKinds = new Set(["conclusion-text", "change-text", "priority-text", "stakeholder-text", "decision-text", "action-line", "action-category-header", "appendix-text", "cover-title", "cover-company", "cover-meta", "risk-table"]);
    for (const s of res.report.slides)
      for (const e of s.elements) {
        if (!proseKinds.has(e.kind)) continue;
        for (const en of enums) expect(e.text ?? "").not.toContain(en);
      }
  });

  it("omits empty sections rather than rendering blank slides", async () => {
    const draft = makeValidDraft();
    draft.stakeholders = [];
    const gen = await generateExecutiveBrief(request, async () => draft);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    const r = await buildBriefPptx(gen.brief);
    expect(r.report.slides.map((s) => s.title)).not.toContain("Stakeholder influence");
  });

  it("renders every factual slide text from the validated model (no invention)", () => {
    const texts = modelTexts(b);
    const factualKinds = new Set(["conclusion-text", "change-text", "priority-text", "stakeholder-text", "decision-text", "action-line", "appendix-text"]);
    for (const s of res.report.slides)
      for (const e of s.elements) {
        if (!factualKinds.has(e.kind)) continue;
        let t = e.text ?? "";
        if (t.startsWith("Not confirmed — ")) t = t.slice("Not confirmed — ".length);
        if (t.startsWith("•  ")) t = t.slice(3);
        expect(texts.has(t)).toBe(true);
      }
  });

  it("keeps the commitment categories distinct and never labels seller-recorded as customer-confirmed", () => {
    const headers = res.report.slides.flatMap((s) => s.elements).filter((e) => e.kind === "action-category-header").map((e) => e.text);
    expect(headers).toContain("CUSTOMER-STATED COMMITMENTS");
    expect(headers).toContain("SELLER-RECORDED COMMITMENTS");
    expect(headers).toContain("INFERRED POSSIBLE COMMITMENTS");
    expect(new Set(headers).size).toBe(headers.length);
    const allText = res.report.slides.flatMap((s) => s.elements).map((e) => e.text ?? "").join(" | ").toLowerCase();
    expect(allText).not.toContain("customer-confirmed");
    expect(allText).not.toContain("customer confirmed");
    expect(b.actionPlan.customerCommitments[1].provenance).not.toContain("customer_stated");
  });

  it("respects minimum font sizes and never emits empty text", () => {
    for (const s of res.report.slides)
      for (const e of s.elements) {
        if (e.fontSize == null) continue;
        expect(e.fontSize).toBeGreaterThanOrEqual(9);
        expect((e.text ?? "").length).toBeGreaterThan(0);
        if (["conclusion-text", "change-text", "priority-text", "stakeholder-text", "decision-text", "action-line"].includes(e.kind)) {
          expect(e.fontSize).toBeGreaterThanOrEqual(16);
        }
      }
  });

  it("keeps every element inside the 13.333 × 7.5 slide", () => {
    for (const s of res.report.slides)
      for (const e of s.elements) {
        expect(e.x).toBeGreaterThanOrEqual(-0.001);
        expect(e.y).toBeGreaterThanOrEqual(-0.001);
        expect(e.x + e.w).toBeLessThanOrEqual(PAGE_W + 0.01);
        expect(e.y + e.h).toBeLessThanOrEqual(PAGE_H + 0.01);
      }
  });

  it("moves overflow to appendix slides and reports it — no silent drops", () => {
    expect(res.diagnostics.some((d) => d.code === "section_overflow_to_appendix")).toBe(true);
    expect(res.report.slides.some((s) => s.title.startsWith("Evidence appendix"))).toBe(true);
    const rendered = new Set(res.report.slides.flatMap((s) => s.elements).map((e) => (e.text ?? "").replace(/^Not confirmed — /, "").replace(/^•\s\s/, "")));
    for (const t of modelTexts(b)) {
      const inTable = res.report.slides.some((s) => s.elements.some((e) => e.kind === "risk-table" && (e.text ?? "").includes(t)));
      expect(rendered.has(t) || inTable).toBe(true);
    }
  });

  it("carries detailed evidence in speaker notes", () => {
    const withNotes = res.report.slides.filter((s) => s.notes && s.notes.length > 0);
    expect(withNotes.length).toBeGreaterThan(0);
    expect(withNotes[0].notes).toMatch(/evidence:/);
  });
});
