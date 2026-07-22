/**
 * brief-layout — the centralized layout system for the INTERNAL executive
 * brief PowerPoint renderer (Commit 3). ALL coordinates, typography, spacing,
 * and colors live here; the renderer (build-brief-pptx) never hard-codes them.
 *
 * Pure + deterministic. No pptxgenjs import, no I/O. Primitives return neutral
 * `DrawOp`s (executed by the renderer) plus their measured height, so geometry
 * is testable without producing a file.
 *
 * This is a PARALLEL system to the customer renderer (build-pptx); it shares
 * nothing that could change customer-deck output.
 */

import type {
  ActionPlan,
  BriefContentItem,
  BriefAssurance,
} from "@/lib/deck/brief-model";
import type { Provenance } from "@/lib/deck/brief-evidence";

// ── Page geometry (LAYOUT_WIDE = 13.333 × 7.5 in, native 16:9) ──────────────

export const PAGE = {
  W: 13.333,
  H: 7.5,
  MX: 0.62, // left/right margin
  get CW(): number {
    return PAGE.W - PAGE.MX * 2;
  },
  TITLE_Y: 0.46,
  TITLE_H: 0.6,
  RULE_Y: 1.08, // rule under the title
  CONTENT_TOP: 1.26,
  CONTENT_BOTTOM: 6.86, // hard floor for content (footer lives below)
  FOOTER_RULE_Y: 6.95,
  FOOTER_Y: 7.02,
  FOOTER_H: 0.34,
} as const;

// ── Typography (PowerPoint-safe Arial; pt) ──────────────────────────────────

export const FONT = "Arial";
export const TYPO = {
  title: 30, // slide title (28–34)
  conclusion: 22, // conclusion statement (22–28)
  body: 17, // body (16–20)
  label: 13, // labels / tables (12–16)
  footer: 10, // footer / evidence refs (9–11)
  MIN_BODY: 16, // approved minimum — never go below for primary body text
} as const;

// ── Palette (Mallín --ck- system; no leading '#', pptxgenjs convention) ─────

export const COLOR = {
  navy: "1A2230", // --ck-ink (deep navy)
  cream: "F4F1EA", // --ck-paper
  card: "FFFFFF", // --ck-surface
  surface2: "F7F4EC",
  surface3: "EFEADD",
  ink: "1A2230",
  ink2: "3B4658",
  ink3: "6B7689",
  ink4: "9AA3B3",
  rule: "DED8CC",
  blue: "4A7186",
  blueTint: "E7EFF4",
  green: "5A8F7A", // advancing / positive
  greenTint: "E2EFE9",
  amber: "9A6A1A", // pending / inferred
  amberTint: "F5ECD6",
  red: "C25A4A", // risk
  redTint: "F6E7E3",
  onNavy: "F4F1EA",
  onNavySoft: "B9C2CE", // soft cream-grey on navy
} as const;

// ── Provenance & assurance badge specs ──────────────────────────────────────

export interface BadgeSpec {
  label: string;
  fg: string;
  bg: string;
}

export const PROVENANCE_BADGE: Record<Provenance, BadgeSpec> = {
  customer_stated: { label: "Customer stated", fg: COLOR.green, bg: COLOR.greenTint },
  seller_provided: { label: "Seller recorded", fg: COLOR.blue, bg: COLOR.blueTint },
  system_recorded: { label: "System recorded", fg: COLOR.ink3, bg: COLOR.surface2 },
  mallin_inference: { label: "Mallín inference", fg: COLOR.amber, bg: COLOR.amberTint },
  open_question: { label: "Open question", fg: COLOR.red, bg: COLOR.redTint },
};

export const ASSURANCE_BADGE: Record<BriefAssurance, BadgeSpec> = {
  observed: { label: "Observed", fg: COLOR.green, bg: COLOR.greenTint },
  inferred: { label: "Inferred", fg: COLOR.amber, bg: COLOR.amberTint },
  conflicting: { label: "Conflicting", fg: COLOR.red, bg: COLOR.redTint },
  unresolved: { label: "Unresolved", fg: COLOR.ink3, bg: COLOR.surface2 },
};

// ── Renderer-owned human display mappings (the model never writes these) ────

/** Raw enum / typed value → human display form. */
const DISPLAY: Record<string, string> = {
  at_risk: "at risk",
  advancing: "advancing",
  stalled: "stalled",
  indeterminate: "indeterminate",
  customer_stated: "customer stated",
  seller_provided: "seller recorded",
  system_recorded: "system recorded",
  mallin_inference: "Mallín inference",
  open_question: "open question",
  customer_commitment: "customer commitment",
  inferred_customer_commitment: "Mallín-inferred possible commitment",
  seller_action: "seller action",
  mallin_recommendation: "Mallín recommendation",
  unresolved_action: "unresolved action",
  next_action: "next action",
  deal_posture: "deal posture",
};

export const SEVERITY_DISPLAY: Record<string, string> = { blocking: "Blocking", high: "High", medium: "Medium" };

/** Replace any raw underscore-style enum token in prose with its human form.
 *  Whole-word, no-digit tokens only, so evidence ids / version strings (which
 *  carry digits) are never touched. Underlying typed values are unchanged. */
export function humanize(text: string): string {
  return text.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => DISPLAY[m] ?? m.replace(/_/g, " "));
}

export function formatUsd(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US")}` : raw;
}

// ── Neutral draw ops (executed by the renderer; recorded for geometry tests) ─

export type DrawOp =
  | {
      op: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      fontSize: number;
      color: string;
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center" | "right";
      valign?: "top" | "middle" | "bottom";
      kind: string;
    }
  | { op: "box"; x: number; y: number; w: number; h: number; fill?: string; lineColor?: string; radius?: number; kind: string }
  | { op: "line"; x: number; y: number; w: number; color: string; weight?: number; kind: string }
  | { op: "table"; x: number; y: number; w: number; h: number; rows: string[][]; colW: number[]; fontSize: number; kind: string };

/** A vertical block: knows its height and how to draw itself at (x, y). */
export interface Block {
  height: number;
  draw: (x: number, y: number) => DrawOp[];
  /** Content ids this block renders — used to prove no silent drops. */
  itemIds: string[];
}

// ── Text measurement (conservative → over-estimates height, avoids clipping) ─

function avgCharWidthIn(pt: number): number {
  return pt * 0.0067; // Arial average glyph, slightly wide on purpose
}
function lineHeightIn(pt: number): number {
  return (pt * 1.3) / 72;
}
export function charsPerLine(widthIn: number, pt: number): number {
  return Math.max(1, Math.floor(widthIn / avgCharWidthIn(pt)));
}
export function estimateTextHeight(text: string, widthIn: number, pt: number): number {
  const perLine = charsPerLine(widthIn, pt);
  const explicit = text.split("\n");
  let lines = 0;
  for (const seg of explicit) lines += Math.max(1, Math.ceil(seg.length / perLine));
  return lines * lineHeightIn(pt);
}

// ── Shared spacing ──────────────────────────────────────────────────────────

const PAD = 0.16; // inner padding
const GAP = 0.16; // gap between blocks
const BADGE_H = 0.28;
const ACCENT_W = 0.07;
export { GAP };

function badgesFor(item: BriefContentItem): BadgeSpec[] {
  const out: BadgeSpec[] = item.provenance.map((p) => PROVENANCE_BADGE[p]);
  out.push(ASSURANCE_BADGE[item.assurance]);
  return out;
}

function badgeOps(x: number, y: number, badges: BadgeSpec[]): { ops: DrawOp[]; height: number } {
  const ops: DrawOp[] = [];
  let cx = x;
  for (const b of badges) {
    const w = 0.14 + b.label.length * avgCharWidthIn(TYPO.footer) + 0.16;
    ops.push({ op: "box", x: cx, y, w, h: BADGE_H, fill: b.bg, radius: 0.04, kind: "badge-bg" });
    ops.push({ op: "text", x: cx + 0.06, y, w: w - 0.12, h: BADGE_H, text: b.label, fontSize: TYPO.footer, color: b.fg, bold: true, valign: "middle", kind: "badge" });
    cx += w + 0.1;
  }
  return { ops, height: BADGE_H };
}

// ── Primitive blocks ─────────────────────────────────────────────────────────

/** A generic bordered card: accent rail + statement text + badge row. */
export function cardBlock(item: BriefContentItem, opts: { textSize: number; accent: string; kind: string; prefix?: string }): Block {
  const w = PAGE.CW;
  const textW = w - ACCENT_W - PAD * 2;
  const text = humanize(opts.prefix ? `${opts.prefix}${item.text}` : item.text);
  const textH = estimateTextHeight(text, textW, opts.textSize);
  const height = PAD + textH + 0.12 + BADGE_H + PAD;
  return {
    height,
    itemIds: [item.id],
    draw: (x, y) => {
      const ops: DrawOp[] = [];
      ops.push({ op: "box", x, y, w, h: height, fill: COLOR.card, lineColor: COLOR.rule, radius: 0.05, kind: opts.kind });
      ops.push({ op: "box", x, y, w: ACCENT_W, h: height, fill: opts.accent, kind: `${opts.kind}-accent` });
      ops.push({ op: "text", x: x + ACCENT_W + PAD, y: y + PAD, w: textW, h: textH, text, fontSize: opts.textSize, color: COLOR.ink, bold: opts.textSize >= TYPO.conclusion, valign: "top", kind: `${opts.kind}-text` });
      const b = badgeOps(x + ACCENT_W + PAD, y + PAD + textH + 0.12, badgesFor(item));
      ops.push(...b.ops);
      return ops;
    },
  };
}

export function conclusionBlock(item: BriefContentItem): Block {
  return cardBlock(item, { textSize: TYPO.conclusion, accent: ASSURANCE_BADGE[item.assurance].fg, kind: "conclusion" });
}
export function changeBlock(item: BriefContentItem): Block {
  return cardBlock(item, { textSize: TYPO.body, accent: ASSURANCE_BADGE[item.assurance].fg, kind: "change" });
}
export function priorityBlock(item: BriefContentItem): Block {
  return cardBlock(item, { textSize: TYPO.body, accent: COLOR.blue, kind: "priority" });
}
export function stakeholderBlock(item: BriefContentItem): Block {
  return cardBlock(item, { textSize: TYPO.body, accent: item.provenance.includes("mallin_inference") ? COLOR.amber : COLOR.blue, kind: "stakeholder" });
}
export function decisionBlock(item: BriefContentItem): Block {
  const prefix = item.provenance.includes("open_question") ? "Not confirmed — " : "";
  return cardBlock(item, { textSize: TYPO.body, accent: item.provenance.includes("open_question") ? COLOR.ink3 : COLOR.ink2, kind: "decision", prefix });
}
export function actionRowBlock(item: BriefContentItem): Block {
  return cardBlock(item, { textSize: TYPO.body, accent: ASSURANCE_BADGE[item.assurance].fg, kind: "action" });
}
export function appendixEntryBlock(item: BriefContentItem): Block {
  const w = PAGE.CW;
  const refs = item.evidenceIds.map(shortEvId).join(", ");
  const marker = item.provenance.map((p) => PROVENANCE_BADGE[p].label).join(" · ");
  const line1 = humanize(item.text);
  const line2 = `${marker}  ·  ${refs || "—"}`;
  const h1 = estimateTextHeight(line1, w - PAD * 2, TYPO.label);
  const h2 = estimateTextHeight(line2, w - PAD * 2, TYPO.footer);
  const height = PAD * 0.8 + h1 + 0.06 + h2 + PAD * 0.8;
  return {
    height,
    itemIds: [item.id],
    draw: (x, y) => [
      { op: "line", x, y, w, color: COLOR.rule, weight: 0.75, kind: "appendix-rule" },
      { op: "text", x: x + PAD, y: y + PAD * 0.8, w: w - PAD * 2, h: h1, text: line1, fontSize: TYPO.label, color: COLOR.ink2, valign: "top", kind: "appendix-text" },
      { op: "text", x: x + PAD, y: y + PAD * 0.8 + h1 + 0.06, w: w - PAD * 2, h: h2, text: line2, fontSize: TYPO.footer, color: COLOR.ink4, valign: "top", kind: "appendix-ref" },
    ],
  };
}

/** Risk table block (native PowerPoint table). Max rows enforced by caller. */
export function riskTableBlock(items: BriefContentItem[]): Block {
  const w = PAGE.CW;
  const colW = [1.7, w - 1.7 - 1.6 - 2.9, 1.6, 2.9];
  const header = ["Severity", "Risk", "Assurance", "Evidence"];
  const rows: string[][] = [header];
  for (const it of items) {
    const sevRaw = it.factBindings.find((b) => b.payloadKind === "risk" && b.fieldPath === "severity")?.value ?? "—";
    const sev = SEVERITY_DISPLAY[sevRaw] ?? sevRaw;
    rows.push([sev, humanize(it.text), ASSURANCE_BADGE[it.assurance].label, it.provenance.map((p) => PROVENANCE_BADGE[p].label).join(", ")]);
  }
  const rowH = 0.46;
  const height = rowH * rows.length;
  return {
    height,
    itemIds: items.map((i) => i.id),
    draw: (x, y) => [{ op: "table", x, y, w, h: height, rows, colW, fontSize: TYPO.label, kind: "risk-table" }],
  };
}

// ── Slide chrome ─────────────────────────────────────────────────────────────

export function titleOps(title: string): DrawOp[] {
  return [
    { op: "text", x: PAGE.MX, y: PAGE.TITLE_Y, w: PAGE.CW - 3.2, h: PAGE.TITLE_H, text: title, fontSize: TYPO.title, color: COLOR.ink, bold: true, valign: "middle", kind: "slide-title" },
    { op: "text", x: PAGE.W - PAGE.MX - 3.2, y: PAGE.TITLE_Y, w: 3.2, h: PAGE.TITLE_H, text: "INTERNAL & CONFIDENTIAL", fontSize: TYPO.footer, color: COLOR.red, bold: true, align: "right", valign: "middle", kind: "classification" },
    { op: "line", x: PAGE.MX, y: PAGE.RULE_Y, w: PAGE.CW, color: COLOR.rule, weight: 1, kind: "title-rule" },
  ];
}

export interface FooterCtx {
  dealName: string;
  asOf: string;
  version: string;
  pageNo: number;
  totalPages: number;
}
export function footerOps(ctx: FooterCtx): DrawOp[] {
  return [
    { op: "line", x: PAGE.MX, y: PAGE.FOOTER_RULE_Y, w: PAGE.CW, color: COLOR.rule, weight: 0.75, kind: "footer-rule" },
    { op: "text", x: PAGE.MX, y: PAGE.FOOTER_Y, w: PAGE.CW * 0.5, h: PAGE.FOOTER_H, text: ctx.dealName, fontSize: TYPO.footer, color: COLOR.ink4, valign: "middle", kind: "footer-deal" },
    { op: "text", x: PAGE.MX + PAGE.CW * 0.5, y: PAGE.FOOTER_Y, w: PAGE.CW * 0.32, h: PAGE.FOOTER_H, text: `Generated ${ctx.asOf} · ${ctx.version}`, fontSize: TYPO.footer, color: COLOR.ink4, align: "center", valign: "middle", kind: "footer-meta" },
    { op: "text", x: PAGE.MX + PAGE.CW * 0.82, y: PAGE.FOOTER_Y, w: PAGE.CW * 0.18, h: PAGE.FOOTER_H, text: `${ctx.pageNo} / ${ctx.totalPages}`, fontSize: TYPO.footer, color: COLOR.ink4, align: "right", valign: "middle", kind: "footer-page" },
  ];
}

export interface CoverModel {
  dealName: string;
  companyName?: string;
  asOf: string;
  classification: string;
  snapshotId: string;
  stage?: { value: string };
  amount?: { value: string };
  latestCallDate?: { value: string };
}
export function coverOps(cover: CoverModel): DrawOp[] {
  const ops: DrawOp[] = [];
  ops.push({ op: "box", x: 0, y: 0, w: PAGE.W, h: PAGE.H, fill: COLOR.navy, kind: "cover-bg" });
  ops.push({ op: "text", x: PAGE.MX, y: 0.9, w: PAGE.CW, h: 0.4, text: "INTERNAL EXECUTIVE DEAL BRIEF", fontSize: TYPO.label, color: COLOR.blue, bold: true, valign: "middle", kind: "cover-kicker" });
  ops.push({ op: "text", x: PAGE.MX, y: 1.7, w: PAGE.CW, h: 1.5, text: cover.dealName, fontSize: TYPO.title + 4, color: COLOR.onNavy, bold: true, valign: "top", kind: "cover-title" });
  if (cover.companyName) {
    ops.push({ op: "text", x: PAGE.MX, y: 3.15, w: PAGE.CW, h: 0.4, text: cover.companyName, fontSize: TYPO.body, color: COLOR.onNavySoft, valign: "middle", kind: "cover-company" });
  }
  ops.push({ op: "line", x: PAGE.MX, y: 3.75, w: 3.2, color: COLOR.blue, weight: 2, kind: "cover-rule" });

  // Supported cover facts + provenance metadata (omitted when unsupported).
  const meta: string[] = [];
  if (cover.stage) meta.push(`Stage: ${humanize(cover.stage.value)}`);
  if (cover.amount) meta.push(`Amount: ${formatUsd(cover.amount.value)}`);
  if (cover.latestCallDate) meta.push(`Latest incorporated call: ${cover.latestCallDate.value}`);
  meta.push(`Generated ${cover.asOf}`);
  meta.push(`Artifact version ${cover.snapshotId}`);
  ops.push({ op: "text", x: PAGE.MX, y: 4.05, w: PAGE.CW, h: 2.0, text: meta.join("\n"), fontSize: TYPO.body, color: COLOR.onNavySoft, valign: "top", kind: "cover-meta" });

  ops.push({ op: "box", x: PAGE.MX, y: PAGE.H - 0.95, w: 3.4, h: 0.42, fill: COLOR.red, radius: 0.05, kind: "cover-class-bg" });
  ops.push({ op: "text", x: PAGE.MX, y: PAGE.H - 0.95, w: 3.4, h: 0.42, text: cover.classification, fontSize: TYPO.label, color: COLOR.onNavy, bold: true, align: "center", valign: "middle", kind: "cover-class" });
  return ops;
}

// ── Action-plan categories (visually separate, never collapsed) ──────────────

export interface ActionCategory {
  key: string;
  label: string;
  items: BriefContentItem[];
}

/** Split the assembled action plan into the six display categories. A
 *  customerCommitments item is "customer-stated" only when it carries explicit
 *  customer_stated provenance; otherwise it is a seller-recorded commitment
 *  (never labeled customer-confirmed). */
export function actionCategories(plan: ActionPlan): ActionCategory[] {
  const customerStated = plan.customerCommitments.filter((i) => i.provenance.includes("customer_stated"));
  const sellerRecorded = plan.customerCommitments.filter((i) => !i.provenance.includes("customer_stated"));
  return [
    { key: "customer_stated", label: "Customer-stated commitments", items: customerStated },
    { key: "seller_recorded", label: "Seller-recorded commitments", items: sellerRecorded },
    { key: "seller_actions", label: "Seller actions", items: plan.sellerActions },
    { key: "mallin_recommendations", label: "Mallín recommendations", items: plan.mallinRecommendations },
    { key: "inferred_commitments", label: "Inferred possible commitments", items: plan.inferredCustomerCommitments },
    { key: "unresolved_actions", label: "Unresolved actions", items: plan.unresolvedActions },
  ].filter((c) => c.items.length > 0);
}

/** One action category rendered as a compact, bordered group: header label +
 *  one line per item with its provenance/assurance marker. Keeps the six
 *  categories visually distinct without a card per row. */
export function actionCategoryBlock(cat: ActionCategory): Block {
  const w = PAGE.CW;
  const headerH = 0.3;
  const markerW = 2.6;
  const lineW = w - PAD * 2 - markerW - 0.2;
  const lines = cat.items.map((it) => {
    const text = `•  ${humanize(it.text)}`;
    const h = Math.max(0.3, estimateTextHeight(text, lineW, TYPO.body) + 0.06);
    return { it, text, h };
  });
  const bodyH = lines.reduce((s, l) => s + l.h, 0);
  const height = PAD * 0.7 + headerH + 0.04 + bodyH + PAD * 0.7;
  return {
    height,
    itemIds: cat.items.map((i) => i.id),
    draw: (x, y) => {
      const ops: DrawOp[] = [];
      ops.push({ op: "box", x, y, w, h: height, fill: COLOR.surface2, lineColor: COLOR.rule, radius: 0.05, kind: "action-category" });
      ops.push({ op: "text", x: x + PAD, y: y + PAD * 0.7, w: w - PAD * 2, h: headerH, text: cat.label.toUpperCase(), fontSize: TYPO.label, color: COLOR.ink3, bold: true, valign: "middle", kind: "action-category-header" });
      let ly = y + PAD * 0.7 + headerH + 0.04;
      for (const l of lines) {
        ops.push({ op: "text", x: x + PAD, y: ly, w: lineW, h: l.h, text: l.text, fontSize: TYPO.body, color: COLOR.ink, valign: "top", kind: "action-line" });
        ops.push({ op: "text", x: x + PAD + lineW + 0.2, y: ly, w: markerW, h: l.h, text: evidenceMarker(l.it), fontSize: TYPO.footer, color: COLOR.ink4, align: "right", valign: "top", kind: "action-marker" });
        ly += l.h;
      }
      return ops;
    },
  };
}

export function categoryHeaderBlock(label: string): Block {
  const height = 0.34;
  return {
    height,
    itemIds: [],
    draw: (x, y) => [
      { op: "text", x, y, w: PAGE.CW, h: height, text: label.toUpperCase(), fontSize: TYPO.label, color: COLOR.ink3, bold: true, valign: "middle", kind: "category-header" },
    ],
  };
}

export function shortEvId(evId: string): string {
  // "ev:19:tenant…|…|fact/x" → a compact tail for references.
  const m = evId.split(/[:|]/).filter(Boolean);
  return "…" + m.slice(-2).join("/");
}

// ── Provenance marker (concise, for speaker notes / inline) ─────────────────

export function evidenceMarker(item: BriefContentItem): string {
  return item.provenance.map((p) => PROVENANCE_BADGE[p].label).join(" · ");
}
