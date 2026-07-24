/**
 * build-brief-pptx — render the VALIDATED + ASSEMBLED internal executive brief
 * into a native, editable .pptx (Commit 3).
 *
 * Isolated from the customer renderer (build-pptx): this module shares nothing
 * that could change customer-deck output. It consumes ONLY an `ExecutiveBrief`
 * (the assembled, validated model) — never raw model JSON, an unvalidated
 * BriefDraft, transcripts, DB rows, or an unassembled EvidencePacket. A runtime
 * guard enforces that.
 *
 * Pipeline: EvidencePacket → ChangeSet → validated brief model → THIS renderer.
 *
 * All geometry/typography/color lives in brief-layout. The renderer executes
 * neutral DrawOps onto pptxgenjs AND records a parallel geometry `report`, so
 * layout can be asserted in tests without parsing OOXML. No content is ever
 * silently dropped: section overflow is moved to appendix slides and reported
 * in `diagnostics`.
 */

import pptxgen from "pptxgenjs";
import type { ExecutiveBrief, BriefContentItem } from "@/lib/deck/brief-model";
import { isValidatedBrief, type ValidatedExecutiveBrief } from "@/lib/deck/brief-agent";
import * as L from "@/lib/deck/brief-layout";

export interface RenderedElement {
  slide: number;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  text?: string;
}
export interface RenderedSlide {
  index: number;
  title: string;
  elements: RenderedElement[];
  notes?: string;
}
export interface RenderDiagnostic {
  code: "section_overflow_to_appendix" | "oversized_block" | "risk_rows_overflow";
  message: string;
}
export interface BriefRenderResult {
  buffer: Buffer;
  report: { slides: RenderedSlide[] };
  diagnostics: RenderDiagnostic[];
}

interface SlidePlan {
  kind: "cover" | "content";
  title?: string;
  ops: L.DrawOp[];
  notes?: string;
}

/** Defense-in-depth shape check. This is NOT proof of prior validation — the
 *  authoritative gate is the branded `ValidatedExecutiveBrief` produced only by
 *  generateExecutiveBrief. This merely rejects grossly malformed input. */
function assertAssembledShape(b: unknown): void {
  const x = b as Partial<ExecutiveBrief> | undefined;
  const ok =
    !!x &&
    typeof x === "object" &&
    !!x.cover &&
    typeof x.cover.dealName === "string" &&
    Array.isArray(x.executiveSummary) &&
    Array.isArray(x.risks) &&
    !!x.actionPlan &&
    Array.isArray(x.actionPlan.inferredCustomerCommitments) &&
    Array.isArray(x.appendix);
  if (!ok) throw new Error("buildBriefPptx received a structurally invalid brief.");
}

const RISK_MAX_ROWS = 5;

export async function buildBriefPptx(brief: ValidatedExecutiveBrief): Promise<BriefRenderResult> {
  // Authoritative gate: only the validated+assembled path can produce this brand.
  if (!isValidatedBrief(brief)) {
    throw new Error("buildBriefPptx accepts only a ValidatedExecutiveBrief from generateExecutiveBrief. Raw BriefDraft / JSON / EvidencePacket / lookalike objects are rejected.");
  }
  assertAssembledShape(brief); // defense in depth

  const diagnostics: RenderDiagnostic[] = [];
  const plans: SlidePlan[] = [];
  const appendixQueue: BriefContentItem[] = [];

  // Index every content item by id so overflow can be resolved back to items.
  const itemIndex = new Map<string, BriefContentItem>();
  const indexAll = (items: BriefContentItem[]) => items.forEach((i) => itemIndex.set(i.id, i));
  indexAll(brief.executiveSummary);
  if (brief.whatChanged) indexAll(brief.whatChanged);
  indexAll(brief.customerPriorities);
  indexAll(brief.stakeholders);
  indexAll(brief.decisionProcess);
  indexAll(brief.risks);
  indexAll(brief.actionPlan.customerCommitments);
  indexAll(brief.actionPlan.inferredCustomerCommitments);
  indexAll(brief.actionPlan.sellerActions);
  indexAll(brief.actionPlan.mallinRecommendations);
  indexAll(brief.actionPlan.unresolvedActions);
  indexAll(brief.appendix);

  // ── Cover (with supported, evidence-backed facts) ──
  plans.push({ kind: "cover", ops: L.coverOps(brief.cover) });

  // Pack a list of blocks top-down; anything that doesn't fit overflows.
  const packBlocks = (blocks: L.Block[]): { placed: Array<{ block: L.Block; y: number }>; overflow: L.Block[] } => {
    const placed: Array<{ block: L.Block; y: number }> = [];
    const overflow: L.Block[] = [];
    let y = L.PAGE.CONTENT_TOP;
    for (const block of blocks) {
      if (block.height > L.PAGE.CONTENT_BOTTOM - L.PAGE.CONTENT_TOP) {
        overflow.push(block);
        diagnostics.push({ code: "oversized_block", message: `A block (${block.itemIds.join(", ")}) is taller than one slide; routed to appendix.` });
        continue;
      }
      if (y + block.height <= L.PAGE.CONTENT_BOTTOM) {
        placed.push({ block, y });
        y += block.height + L.GAP;
      } else {
        overflow.push(block);
      }
    }
    return { placed, overflow };
  };

  const section = (title: string, blocks: L.Block[]): void => {
    if (blocks.length === 0) return; // omit empty sections
    const { placed, overflow } = packBlocks(blocks);
    const ops = placed.flatMap((p) => p.block.draw(L.PAGE.MX, p.y));
    const placedItems = placed.flatMap((p) => p.block.itemIds).map((id) => itemIndex.get(id)).filter((x): x is BriefContentItem => !!x);
    plans.push({ kind: "content", title, ops, notes: notesForItems(title, placedItems) });
    if (overflow.length) {
      const ids = overflow.flatMap((b) => b.itemIds);
      diagnostics.push({ code: "section_overflow_to_appendix", message: `${title}: ${ids.length} item(s) moved to appendix — ${ids.join(", ")}` });
      for (const id of ids) {
        const it = itemIndex.get(id);
        if (it) appendixQueue.push(it);
      }
    }
  };

  // ── Primary sections (rendered only when supported) ──
  section("Executive summary", brief.executiveSummary.map(L.conclusionBlock));
  if (brief.whatChanged && brief.whatChanged.length) section("What changed", brief.whatChanged.map(L.changeBlock));
  section("Customer priorities & outcomes", brief.customerPriorities.map(L.priorityBlock));
  section("Stakeholder influence", brief.stakeholders.map(L.stakeholderBlock));
  section("Decision process & commercial path", brief.decisionProcess.map(L.decisionBlock));

  // Risks — a native table, capped at RISK_MAX_ROWS; extra rows overflow.
  if (brief.risks.length) {
    const primary = brief.risks.slice(0, RISK_MAX_ROWS);
    const extra = brief.risks.slice(RISK_MAX_ROWS);
    section("Risks, gaps & contradictions", [L.riskTableBlock(primary)]);
    if (extra.length) {
      diagnostics.push({ code: "risk_rows_overflow", message: `Risks: ${extra.length} row(s) beyond ${RISK_MAX_ROWS} moved to appendix.` });
      appendixQueue.push(...extra);
    }
  }

  // Action plan — six visually-separate categories.
  section("Recommended action plan", L.actionCategories(brief.actionPlan).map(L.actionCategoryBlock));

  // ── Appendix (assembler overflow + section overflow), paginated ──
  const appendixItems = dedupeById([...brief.appendix, ...appendixQueue]);
  paginateAppendix(appendixItems, plans, diagnostics);

  // ── Render pass (now that total page count is known) ──
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  const total = plans.length;
  const report: { slides: RenderedSlide[] } = { slides: [] };

  plans.forEach((plan, i) => {
    const slide = pres.addSlide();
    const elements: RenderedElement[] = [];
    const chrome: L.DrawOp[] =
      plan.kind === "cover"
        ? plan.ops
        : [
            ...L.titleOps(plan.title ?? ""),
            ...plan.ops,
            ...L.footerOps({ dealName: brief.cover.dealName, asOf: brief.cover.asOf, version: brief.cover.snapshotId, pageNo: i + 1, totalPages: total }),
          ];
    for (const op of chrome) {
      execOp(slide, op);
      elements.push(recordOp(i, op));
    }
    if (plan.notes) slide.addNotes(plan.notes);
    report.slides.push({ index: i, title: plan.kind === "cover" ? "Cover" : plan.title ?? "", elements, notes: plan.notes });
  });

  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return { buffer, report, diagnostics };
}

// ── appendix pagination ──────────────────────────────────────────────────────

function paginateAppendix(items: BriefContentItem[], plans: SlidePlan[], diagnostics: RenderDiagnostic[]): void {
  if (items.length === 0) return;
  let idx = 0;
  let slideNo = 0;
  while (idx < items.length) {
    const title = slideNo === 0 ? "Evidence appendix" : "Evidence appendix (cont.)";
    const ops: L.DrawOp[] = [];
    let y = L.PAGE.CONTENT_TOP;
    let placedAny = false;
    while (idx < items.length) {
      const block = L.appendixEntryBlock(items[idx]);
      if (y + block.height <= L.PAGE.CONTENT_BOTTOM) {
        ops.push(...block.draw(L.PAGE.MX, y));
        y += block.height;
        idx++;
        placedAny = true;
      } else break;
    }
    if (!placedAny) {
      // A single entry taller than a slide — place at top rather than drop it.
      const block = L.appendixEntryBlock(items[idx]);
      ops.push(...block.draw(L.PAGE.MX, L.PAGE.CONTENT_TOP));
      diagnostics.push({ code: "oversized_block", message: `Appendix entry ${items[idx].id} exceeds one slide.` });
      idx++;
    }
    plans.push({ kind: "content", title, ops });
    slideNo++;
  }
}

// ── op execution + recording ─────────────────────────────────────────────────

function execOp(slide: pptxgen.Slide, op: L.DrawOp): void {
  if (op.op === "text") {
    slide.addText(op.text, {
      x: op.x, y: op.y, w: op.w, h: op.h,
      fontFace: L.FONT, fontSize: op.fontSize, color: op.color,
      bold: op.bold, italic: op.italic, align: op.align ?? "left", valign: op.valign ?? "top",
      wrap: true, lineSpacingMultiple: 1.14, margin: 0,
    });
  } else if (op.op === "box") {
    slide.addShape(op.radius ? "roundRect" : "rect", {
      x: op.x, y: op.y, w: op.w, h: op.h,
      fill: op.fill ? { color: op.fill } : { type: "none" },
      line: op.lineColor ? { color: op.lineColor, width: 0.75 } : { type: "none" },
      ...(op.radius ? { rectRadius: op.radius } : {}),
    });
  } else if (op.op === "line") {
    slide.addShape("line", { x: op.x, y: op.y, w: op.w, h: 0, line: { color: op.color, width: op.weight ?? 1 } });
  } else if (op.op === "table") {
    const rows = op.rows.map((r, ri) =>
      r.map((c) => ({
        text: c,
        options: { fontFace: L.FONT, fontSize: op.fontSize, bold: ri === 0, color: ri === 0 ? L.COLOR.ink : L.COLOR.ink2, fill: { color: ri === 0 ? L.COLOR.surface3 : L.COLOR.card }, valign: "middle" as const },
      })),
    );
    slide.addTable(rows, { x: op.x, y: op.y, w: op.w, colW: op.colW, border: { type: "solid", color: L.COLOR.rule, pt: 0.5 }, autoPage: false, rowH: 0.46 });
  }
}

function recordOp(slideIndex: number, op: L.DrawOp): RenderedElement {
  const base = { slide: slideIndex, kind: op.kind, x: op.x, y: op.y, w: op.w };
  if (op.op === "text") return { ...base, h: op.h, fontSize: op.fontSize, text: op.text };
  if (op.op === "line") return { ...base, h: 0 };
  if (op.op === "table") return { ...base, h: op.h, fontSize: op.fontSize, text: op.rows.map((r) => r.join(" ")).join("  ") };
  return { ...base, h: op.h };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function dedupeById(items: BriefContentItem[]): BriefContentItem[] {
  const seen = new Set<string>();
  const out: BriefContentItem[] = [];
  for (const i of items) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

/** Detailed evidence lives in speaker notes (confirmed supported by pptxgenjs
 *  addNotes), keeping the slide face executive and clean. */
function notesForItems(sectionTitle: string, items: BriefContentItem[]): string {
  const lines: string[] = [`INTERNAL & CONFIDENTIAL — ${sectionTitle} · evidence detail (do not distribute)`, ""];
  for (const it of items) {
    lines.push(`• ${it.text}`);
    lines.push(`   markers: ${L.evidenceMarker(it)}  ·  assurance: ${it.assurance}`);
    lines.push(`   evidence: ${it.evidenceIds.map(L.shortEvId).join(", ") || "—"}`);
    for (const b of it.factBindings.slice(0, 8)) lines.push(`     · ${b.payloadKind}.${b.fieldPath} = ${b.value}`);
  }
  return lines.join("\n");
}
