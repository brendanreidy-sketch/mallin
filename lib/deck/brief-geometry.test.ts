import { describe, it, expect, beforeAll } from "vitest";
import { assembleBrief, type BriefContentItem, type ExecutiveBrief } from "./brief-model";
import { buildCover } from "./brief-agent";
import { makeValidDraft, request } from "./fixtures/brief-mock-drafts";
import { buildBriefPptx, type BriefRenderResult } from "./build-brief-pptx";
import * as L from "./brief-layout";

const EPS = 0.02;

function mk(text: string, provenance: BriefContentItem["provenance"] = ["mallin_inference"], assurance: BriefContentItem["assurance"] = "inferred"): BriefContentItem {
  return {
    id: `x_${text.length}`,
    contentType: "executive_conclusion",
    section: "executive_summary",
    assertionMode: "sourced_fact",
    text,
    evidenceIds: [],
    sourceFactKeys: [],
    factBindings: [],
    provenance,
    confidence: "none",
    assurance,
    appendixEligible: true,
  };
}

let res: BriefRenderResult;
let brief: ExecutiveBrief;
beforeAll(async () => {
  brief = assembleBrief(makeValidDraft(), buildCover(request)).brief;
  res = await buildBriefPptx(brief);
});

const CONTENT_KIND = (kind: string) =>
  !/^(slide-title|classification|title-rule|footer-|cover-)/.test(kind);

describe("text measurement", () => {
  it("charsPerLine is positive and larger for wider boxes", () => {
    expect(L.charsPerLine(6, L.TYPO.body)).toBeGreaterThan(0);
    expect(L.charsPerLine(12, L.TYPO.body)).toBeGreaterThan(L.charsPerLine(6, L.TYPO.body));
  });
  it("estimateTextHeight grows with content and never returns zero", () => {
    const short = L.estimateTextHeight("hi", 10, L.TYPO.body);
    const long = L.estimateTextHeight("x".repeat(600), 10, L.TYPO.body);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });
});

describe("geometry — every placed element is safely inside the slide", () => {
  it("no element crosses the page bounds (13.333 × 7.5)", () => {
    for (const s of res.report.slides)
      for (const e of s.elements) {
        expect(e.x).toBeGreaterThanOrEqual(-EPS);
        expect(e.y).toBeGreaterThanOrEqual(-EPS);
        expect(e.x + e.w).toBeLessThanOrEqual(L.PAGE.W + EPS);
        expect(e.y + e.h).toBeLessThanOrEqual(L.PAGE.H + EPS);
      }
  });

  it("content clears the title zone (starts at/after CONTENT_TOP)", () => {
    for (const s of res.report.slides) {
      if (s.title === "Cover") continue;
      for (const e of s.elements) {
        if (!CONTENT_KIND(e.kind)) continue;
        expect(e.y).toBeGreaterThanOrEqual(L.PAGE.CONTENT_TOP - EPS);
      }
    }
  });

  it("content clears the footer (ends at/before the footer rule)", () => {
    for (const s of res.report.slides) {
      if (s.title === "Cover") continue;
      for (const e of s.elements) {
        if (!CONTENT_KIND(e.kind)) continue;
        expect(e.y + e.h).toBeLessThanOrEqual(L.PAGE.FOOTER_RULE_Y + EPS);
      }
    }
  });

  it("card containers on a slide never overlap", () => {
    const cardKinds = new Set(["conclusion", "change", "priority", "stakeholder", "decision", "action-category"]);
    for (const s of res.report.slides) {
      const cards = s.elements.filter((e) => cardKinds.has(e.kind));
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i];
          const c = cards[j];
          const overlap = a.x < c.x + c.w - EPS && a.x + a.w > c.x + EPS && a.y < c.y + c.h - EPS && a.y + a.h > c.y + EPS;
          expect(overlap).toBe(false);
        }
    }
  });
});

describe("geometry — primitives", () => {
  it("a full risk table (max 5 rows) fits within the content band", () => {
    const risks = Array.from({ length: 5 }, (_, i) =>
      ({ ...mk(`Risk ${i} with a reasonably descriptive sentence about the deal.`), contentType: "risk" as const, factBindings: [{ evidenceId: "ev:x", sourceFactKey: "sf:x", payloadKind: "risk" as const, fieldPath: "severity", value: "high" }] }),
    );
    const block = L.riskTableBlock(risks);
    expect(L.PAGE.CONTENT_TOP + block.height).toBeLessThanOrEqual(L.PAGE.CONTENT_BOTTOM + EPS);
  });

  it("a long but supported conclusion still produces bounded, non-clipping geometry", () => {
    const long = mk("This is a deliberately long executive conclusion that wraps across multiple lines to prove the card grows to fit its text instead of clipping the overflow outside the shape boundary.");
    const block = L.conclusionBlock(long);
    const ops = block.draw(L.PAGE.MX, L.PAGE.CONTENT_TOP);
    for (const op of ops) {
      const w = "w" in op ? op.w : 0;
      const h = "h" in op ? op.h : 0;
      expect(op.x + w).toBeLessThanOrEqual(L.PAGE.W + EPS);
      // The text box height covers the estimated wrapped height (no clipping).
      if (op.op === "text" && op.kind === "conclusion-text") {
        expect(op.h).toBeGreaterThanOrEqual(L.estimateTextHeight(long.text, op.w, op.fontSize) - EPS);
      }
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  it("the title zone and footer zone do not overlap the content band", () => {
    expect(L.PAGE.RULE_Y).toBeLessThan(L.PAGE.CONTENT_TOP);
    expect(L.PAGE.CONTENT_BOTTOM).toBeLessThanOrEqual(L.PAGE.FOOTER_RULE_Y);
  });
});
