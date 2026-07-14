/**
 * build-pptx — render a DeckModel to a .pptx as a Node Buffer.
 *
 * Consumes the SAME DeckModel as the in-app DeckView, so the file export and
 * the on-screen deck never drift in content or sanitization.
 *
 * v2 design — a real, dual-branded call deck (not a generic dark brief):
 *   - Title + closing on the SELLER brand color (navy "sandwich"), both company
 *     logos shown.
 *   - Content slides on white with a brand header bar (seller logo left, buyer
 *     logo right, accent rule) — readable, presentation-grade.
 *   - Dedicated Agenda and "On the call" (attendees grouped by company) slides.
 *   - Logos fetched by URL + embedded; missing logo → text wordmark fallback.
 *
 * The old per-deal deck script hand-authored one deal's slides; this is the
 * generalized, DB-driven, dual-branded replacement.
 */

import pptxgen from "pptxgenjs";
import type { DeckModel, Slide } from "./deck-model";
import type { DeckBranding } from "./brands";

// ── Neutral content palette (no leading # — pptxgenjs convention) ──
const WHITE = "FFFFFF";
const PAPER = "F7F9FB";
const INK = "1A2230";
const MUTED = "5C6B7A";
const BORDER = "E1E6EC";
const ON_DARK = "FFFFFF";
const ON_DARK_SOFT = "C8D2DE";

// ── Geometry (LAYOUT_WIDE = 13.33 × 7.5 in) ──
const W = 13.33;
const H = 7.5;
const MX = 0.85; // content left/right margin
const CW = W - MX * 2;

const hex = (c: string) => c.replace(/^#/, "").toUpperCase();

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight; format in UTC so a
  // negative local offset doesn't roll the day back.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso.trim());
  return d.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

/** Fetch a logo URL → data URI for embedding. Times out fast and returns null
 *  on any failure so the deck always renders (text wordmark fallback). */
async function fetchLogo(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

interface Logos {
  seller: string | null;
  buyer: string | null;
}

export async function buildPptx(model: DeckModel): Promise<Buffer> {
  const pres = new pptxgen();
  // 13.33 × 7.5in — must match the W/H geometry constants above. (pptxgen's
  // "LAYOUT_16x9" is 10×5.625, which mismatched the constants and pushed the
  // whole right half of every slide off the page.)
  pres.layout = "LAYOUT_WIDE";
  pres.author = model.branding.seller.name;
  pres.company = model.branding.seller.name;
  pres.title = `${model.branding.buyer.name} — ${model.branding.seller.name} deck`;

  // Prefetch both logos once (reused on every slide).
  const [seller, buyer] = await Promise.all([
    fetchLogo(model.branding.seller.logoUrl),
    fetchLogo(model.branding.buyer.logoUrl),
  ]);
  const logos: Logos = { seller, buyer };

  for (const slide of model.slides) {
    renderSlide(pres, slide, model.branding, logos);
  }

  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}

// ── shared brand helpers ──────────────────────────────────────────────────

/** Brand lockup: square logo icon + company name (or just the name when no
 *  logo). Left- or right-anchored within the given box. */
function brandMark(
  s: pptxgen.Slide,
  name: string,
  logo: string | null,
  opts: { x: number; y: number; boxW: number; boxH: number; align: "left" | "right"; color: string },
) {
  const { x, y, boxW, boxH, align, color } = opts;
  const icon = boxH; // square icon, full box height
  const gap = 0.14;
  const textOpts = {
    valign: "middle" as const, fontFace: "Arial", fontSize: 14, bold: true, color,
  };

  if (!logo) {
    s.addText(name, { x, y, w: boxW, h: boxH, align, ...textOpts });
    return;
  }

  if (align === "left") {
    s.addImage({ data: logo, x, y, w: icon, h: icon, sizing: { type: "contain", w: icon, h: icon } });
    s.addText(name, { x: x + icon + gap, y, w: boxW - icon - gap, h: boxH, align: "left", ...textOpts });
  } else {
    const iconX = x + boxW - icon;
    s.addImage({ data: logo, x: iconX, y, w: icon, h: icon, sizing: { type: "contain", w: icon, h: icon } });
    s.addText(name, { x, y, w: boxW - icon - gap, h: boxH, align: "right", ...textOpts });
  }
}

/** Brand header bar on content slides: seller mark (L), buyer mark (R), accent
 *  rule, and the slide title. Returns the y where body content can start. */
function header(s: pptxgen.Slide, title: string, b: DeckBranding, logos: Logos): number {
  brandMark(s, b.seller.name, logos.seller, { x: MX, y: 0.4, boxW: 3, boxH: 0.42, align: "left", color: INK });
  brandMark(s, b.buyer.name, logos.buyer, { x: W - MX - 3, y: 0.4, boxW: 3, boxH: 0.42, align: "right", color: INK });
  s.addShape("line", { x: MX, y: 1.0, w: CW, h: 0, line: { color: hex(b.seller.colorAccent), width: 1.5 } });
  s.addText(title, {
    x: MX, y: 1.2, w: CW, h: 0.6,
    fontFace: "Arial", fontSize: 26, bold: true, color: INK,
  });
  return 2.05;
}

// ── slide renderers ───────────────────────────────────────────────────────

function renderSlide(pres: pptxgen, slide: Slide, b: DeckBranding, logos: Logos): void {
  const primary = hex(b.seller.colorPrimary);
  const accent = hex(b.seller.colorAccent);

  switch (slide.kind) {
    case "title": {
      const s = pres.addSlide();
      s.background = { color: primary };
      // Both logos, top corners.
      brandMark(s, slide.sellerName, logos.seller, { x: MX, y: 0.55, boxW: 3, boxH: 0.5, align: "left", color: ON_DARK });
      brandMark(s, slide.buyerName, logos.buyer, { x: W - MX - 3, y: 0.55, boxW: 3, boxH: 0.5, align: "right", color: ON_DARK });
      // Center block.
      s.addText("PRE-CALL DECK", {
        x: MX, y: 2.7, w: CW, h: 0.4,
        fontFace: "Courier New", fontSize: 13, color: accent, charSpacing: 2,
      });
      // Adapt size to length; wrap to a second line if needed. (No fit:"shrink"
      // — LibreOffice/exporters don't all honor it, which clipped long titles.)
      const tlen = slide.meetingTitle.length;
      const titleSize = tlen > 34 ? 24 : tlen > 24 ? 28 : 32;
      s.addText(slide.meetingTitle, {
        x: MX, y: 3.0, w: CW, h: 1.7,
        fontFace: "Arial", fontSize: titleSize, bold: true, color: ON_DARK,
        wrap: true, valign: "top",
      });
      s.addText(
        [
          { text: `${slide.sellerName}`, options: { color: ON_DARK, bold: true } },
          { text: "   ×   ", options: { color: accent } },
          { text: `${slide.buyerName}`, options: { color: ON_DARK, bold: true } },
        ],
        { x: MX, y: 4.55, w: CW, h: 0.5, fontFace: "Arial", fontSize: 18 },
      );
      if (slide.meetingDate) {
        s.addText(fmtDate(slide.meetingDate), {
          x: MX, y: 5.1, w: CW, h: 0.4, fontFace: "Arial", fontSize: 14, color: ON_DARK_SOFT,
        });
      }
      return;
    }

    case "intro": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      const line = slide.person.title
        ? `${slide.person.title}${slide.sellerName ? ` · ${slide.sellerName}` : ""}`
        : slide.sellerName;
      s.addText(
        [
          { text: slide.person.name, options: { fontSize: 26, bold: true, color: INK, breakLine: true } },
          ...(line ? [{ text: line, options: { fontSize: 14, color: MUTED } }] : []),
        ],
        { x: MX, y: y0 + 0.2, w: CW, h: 1.0, valign: "top", lineSpacingMultiple: 1.1 },
      );
      if (slide.person.bio) {
        s.addText(slide.person.bio, {
          x: MX, y: y0 + 1.5, w: CW, h: 1.4,
          fontFace: "Arial", fontSize: 16, color: INK, lineSpacingMultiple: 1.35, valign: "top",
        });
      }
      if (slide.person.linkedinUrl) {
        s.addText("LinkedIn", {
          x: MX, y: H - 1.0, w: CW, h: 0.3,
          fontFace: "Courier New", fontSize: 11, color: accent, charSpacing: 1,
          hyperlink: { url: slide.person.linkedinUrl },
        });
      }
      footer(s, b);
      return;
    }

    case "agenda": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      s.addText(
        slide.items.map((it, i) => ({
          text: it,
          options: {
            bullet: { type: "number" as const, startAt: i + 1 },
            fontSize: 18, color: INK, paraSpaceAfter: 14,
          },
        })),
        { x: MX, y: y0 + 0.1, w: CW, h: H - y0 - 0.6, fontFace: "Arial", lineSpacingMultiple: 1.2, valign: "top" },
      );
      footer(s, b);
      return;
    }

    case "points": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      bulletList(s, slide.bullets, y0 + 0.1, accent);
      footer(s, b);
      return;
    }

    case "quotes": {
      // Featured navy slide — the buyer's own words as large pull-quotes.
      const s = pres.addSlide();
      s.background = { color: primary };
      s.addText(slide.title.toUpperCase(), {
        x: MX, y: 0.6, w: CW, h: 0.4,
        fontFace: "Courier New", fontSize: 13, color: accent, charSpacing: 2,
      });
      const n = Math.max(slide.quotes.length, 1);
      const blockH = (H - 1.5) / n;
      slide.quotes.forEach((q, i) => {
        const y = 1.35 + i * blockH;
        // Single string (not a multi-run array) — exporters don't wrap
        // multi-run text, which made long quotes overrun the slide.
        s.addText(`“${q.text}”`, {
          x: MX, y, w: CW, h: blockH - 0.4, valign: "middle", lineSpacingMultiple: 1.15,
          fontFace: "Arial", fontSize: 16, italic: true, color: ON_DARK, wrap: true,
        });
        if (q.attribution) {
          s.addText(`— ${q.attribution}`, {
            x: MX, y: y + blockH - 0.45, w: CW, h: 0.3,
            fontFace: "Arial", fontSize: 12, color: ON_DARK_SOFT,
          });
        }
      });
      return;
    }

    case "impact": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      // Hero metrics row.
      const metrics = slide.metrics;
      if (metrics.length > 0) {
        const colW = CW / metrics.length;
        metrics.forEach((m, i) => {
          const x = MX + i * colW;
          s.addText(m.value, {
            x, y: y0, w: colW - 0.2, h: 0.7,
            fontFace: "Arial", fontSize: 28, bold: true, color: hex(b.seller.colorAccent),
            fit: "shrink",
          });
          s.addText(m.label, {
            x, y: y0 + 0.75, w: colW - 0.25, h: 0.7,
            fontFace: "Arial", fontSize: 12, color: MUTED, lineSpacingMultiple: 1.1, valign: "top",
          });
        });
      }
      // Today vs. With <seller> — before/after.
      const compY = y0 + (metrics.length > 0 ? 1.9 : 0.2);
      const halfW = (CW - 0.5) / 2;
      compareColumn(s, "TODAY", slide.today, MX, compY, halfW, MUTED, BORDER);
      compareColumn(s, `WITH ${slide.sellerName.toUpperCase()}`, slide.withSolution, MX + halfW + 0.5, compY, halfW, hex(b.seller.colorAccent), hex(b.seller.colorAccent));
      footer(s, b);
      return;
    }

    case "attendees": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      const colW = (CW - 0.5) / 2;
      attendeeColumn(s, slide.sellerName, slide.sellerPeople, MX, y0, colW, accent);
      attendeeColumn(s, slide.buyerName, slide.buyerPeople, MX + colW + 0.5, y0, colW, accent);
      footer(s, b);
      return;
    }

    case "fit": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      const colW = (CW - 0.5) / 2;
      bulletColumn(s, slide.buyerLabel, slide.buyerWants, MX, y0, colW, accent);
      bulletColumn(s, slide.sellerLabel, slide.sellerOffers, MX + colW + 0.5, y0, colW, accent);
      footer(s, b);
      return;
    }

    case "logoWall": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      const cols = 3;
      const gap = 0.2;
      const chipW = (CW - gap * (cols - 1)) / cols;
      const chipH = 0.75;
      slide.brands.forEach((name, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = MX + c * (chipW + gap);
        const y = y0 + 0.15 + r * (chipH + gap);
        s.addShape("roundRect", {
          x, y, w: chipW, h: chipH, rectRadius: 0.08,
          fill: { color: PAPER }, line: { color: BORDER, width: 1 },
        });
        s.addText(name, {
          x, y, w: chipW, h: chipH, align: "center", valign: "middle",
          fontFace: "Arial", fontSize: 14, bold: true, color: INK,
        });
      });
      footer(s, b);
      return;
    }

    case "facts": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      const cols = slide.facts.length || 1;
      const colW = CW / cols;
      slide.facts.forEach((f, i) => {
        const x = MX + i * colW;
        s.addText(f.label.toUpperCase(), {
          x, y: y0 + 0.2, w: colW - 0.2, h: 0.35,
          fontFace: "Courier New", fontSize: 11, color: MUTED, charSpacing: 1,
        });
        s.addText(f.value, {
          x, y: y0 + 0.6, w: colW - 0.25, h: 1.2,
          fontFace: "Arial", fontSize: 16, color: INK, lineSpacingMultiple: 1.15,
        });
      });
      footer(s, b);
      return;
    }

    case "events": {
      const s = whiteSlide(pres);
      let y = header(s, slide.title, b, logos) + 0.1;
      for (const e of slide.events) {
        s.addText(
          [
            { text: `${fmtDate(e.date)}   `, options: { color: accent, fontFace: "Courier New", fontSize: 12, bold: true } },
            { text: e.headline, options: { color: INK, fontSize: 15, bold: true } },
          ],
          { x: MX, y, w: CW - 0.3, h: 0.32, valign: "top" },
        );
        s.addText(e.relevance, {
          x: MX, y: y + 0.34, w: CW - 0.3, h: 0.6,
          fontFace: "Arial", fontSize: 12.5, color: MUTED, lineSpacingMultiple: 1.2, valign: "top",
        });
        y += 1.08;
        if (y > H - 0.7) break;
      }
      footer(s, b);
      return;
    }

    case "priorities": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      bulletList(s, slide.items, y0 + 0.1, accent);
      footer(s, b);
      return;
    }

    case "stakeholders": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      const perRow = slide.people.length > 2 ? 2 : slide.people.length || 1;
      const colW = (CW - (perRow - 1) * 0.4) / perRow;
      slide.people.forEach((p, i) => {
        const x = MX + (i % perRow) * (colW + 0.4);
        const y = y0 + 0.1 + Math.floor(i / perRow) * 2.35;
        s.addText(
          [
            { text: p.name, options: { fontSize: 15, bold: true, color: INK, breakLine: true } },
            ...(p.title ? [{ text: p.title, options: { fontSize: 12, color: MUTED } }] : []),
          ],
          { x, y, w: colW - 0.2, h: 0.55, valign: "top", lineSpacingMultiple: 1.05 },
        );
        s.addText(p.background, {
          x, y: y + 0.62, w: colW - 0.2, h: 0.85,
          fontFace: "Arial", fontSize: 11.5, color: MUTED, lineSpacingMultiple: 1.2,
        });
        if (p.priorities.length > 0) {
          s.addText(
            p.priorities.map((vp) => ({ text: vp, options: { bullet: { characterCode: "2022" }, fontSize: 10.5, color: INK, paraSpaceAfter: 3 } })),
            { x, y: y + 1.5, w: colW - 0.2, h: 0.7, fontFace: "Arial" },
          );
        }
      });
      footer(s, b);
      return;
    }

    case "competitive": {
      const s = whiteSlide(pres);
      const y0 = header(s, slide.title, b, logos);
      let y = y0 + 0.1;
      if (slide.marketPosition) {
        s.addText(slide.marketPosition, {
          x: MX, y, w: CW, h: 0.8, fontFace: "Arial", fontSize: 16, color: MUTED, lineSpacingMultiple: 1.3,
        });
        y += 1.0;
      }
      bulletList(s, slide.competitors, y, accent);
      footer(s, b);
      return;
    }

    case "walkingIn": {
      const s = whiteSlide(pres);
      let y = header(s, slide.title, b, logos) + 0.1;
      if (slide.openingAngle) {
        s.addText("OPENING", { x: MX, y, w: CW, h: 0.3, fontFace: "Courier New", fontSize: 11, color: MUTED, charSpacing: 1 });
        s.addText(slide.openingAngle, { x: MX, y: y + 0.32, w: CW, h: 0.9, fontFace: "Arial", fontSize: 16, color: INK, lineSpacingMultiple: 1.3 });
        y += 1.5;
      }
      if (slide.questions.length > 0) {
        s.addText("QUESTIONS", { x: MX, y, w: CW, h: 0.3, fontFace: "Courier New", fontSize: 11, color: MUTED, charSpacing: 1 });
        s.addText(
          slide.questions.map((q, i) => ({ text: q, options: { bullet: { type: "number" as const, startAt: i + 1 }, fontSize: 15, color: INK, paraSpaceAfter: 8 } })),
          { x: MX, y: y + 0.32, w: CW, h: H - y - 1.0, fontFace: "Arial", lineSpacingMultiple: 1.2 },
        );
      }
      footer(s, b);
      return;
    }

    case "closing": {
      const s = pres.addSlide();
      s.background = { color: primary };
      brandMark(s, slide.sellerName, logos.seller, { x: MX, y: 0.55, boxW: 3, boxH: 0.5, align: "left", color: ON_DARK });
      brandMark(s, slide.buyerName, logos.buyer, { x: W - MX - 3, y: 0.55, boxW: 3, boxH: 0.5, align: "right", color: ON_DARK });
      s.addText(
        [
          { text: `${slide.sellerName}`, options: { color: ON_DARK, bold: true } },
          { text: "   ×   ", options: { color: accent } },
          { text: `${slide.buyerName}`, options: { color: ON_DARK, bold: true } },
        ],
        { x: MX, y: 3.1, w: CW, h: 0.6, fontFace: "Arial", fontSize: 26, bold: true },
      );
      s.addText(slide.subhead, { x: MX, y: 3.9, w: CW, h: 0.5, fontFace: "Courier New", fontSize: 13, color: accent, charSpacing: 1 });
      return;
    }
  }
}

// ── small builders ────────────────────────────────────────────────────────

function whiteSlide(pres: pptxgen): pptxgen.Slide {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  return s;
}

function footer(s: pptxgen.Slide, b: DeckBranding) {
  // Seller-branded — never hardcode the vendor name on a customer deck.
  s.addText(`Prepared with ${b.seller.name}`, {
    x: MX, y: H - 0.45, w: CW, h: 0.3,
    fontFace: "Arial", fontSize: 9, color: MUTED, align: "right",
  });
}

function bulletList(s: pptxgen.Slide, items: string[], y: number, _accent: string) {
  s.addText(
    items.map((it) => ({ text: it, options: { bullet: { characterCode: "2022" }, fontSize: 16, color: INK, paraSpaceAfter: 12 } })),
    { x: MX, y, w: CW - 0.3, h: H - y - 0.7, fontFace: "Arial", lineSpacingMultiple: 1.3, valign: "top" },
  );
}

/** A labelled column for the impact before/after comparison. */
function compareColumn(
  s: pptxgen.Slide,
  label: string,
  items: string[],
  x: number,
  y: number,
  w: number,
  labelColor: string,
  ruleColor: string,
) {
  s.addText(label, {
    x, y, w, h: 0.35,
    fontFace: "Courier New", fontSize: 12, bold: true, color: labelColor, charSpacing: 1,
  });
  s.addShape("line", { x, y: y + 0.42, w, h: 0, line: { color: ruleColor, width: 1.5 } });
  s.addText(
    items.map((it) => ({ text: it, options: { bullet: { characterCode: "2022" }, fontSize: 14, color: INK, paraSpaceAfter: 9 } })),
    { x, y: y + 0.6, w, h: H - (y + 0.6) - 0.7, fontFace: "Arial", lineSpacingMultiple: 1.25, valign: "top" },
  );
}

/** A titled card with a bulleted list — the two columns of the "fit" slide. */
function bulletColumn(
  s: pptxgen.Slide,
  label: string,
  items: string[],
  x: number,
  y: number,
  w: number,
  accent: string,
) {
  s.addShape("rect", { x, y, w, h: H - y - 0.7, fill: { color: PAPER }, line: { color: BORDER, width: 1 } });
  s.addText(label.toUpperCase(), {
    x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.6,
    fontFace: "Courier New", fontSize: 11, bold: true, color: accent, charSpacing: 1, valign: "top",
  });
  let py = y + 0.9;
  for (const it of items) {
    s.addText(
      [
        { text: "—  ", options: { color: accent, fontSize: 13, bold: true } },
        { text: it, options: { fontSize: 13, color: INK } },
      ],
      { x: x + 0.25, y: py, w: w - 0.5, h: 0.9, valign: "top", lineSpacingMultiple: 1.1 },
    );
    py += 0.5 + Math.ceil(it.length / 26) * 0.26;
    if (py > H - 1.0) break;
  }
}

function attendeeColumn(
  s: pptxgen.Slide,
  company: string,
  people: { name: string; title?: string }[],
  x: number,
  y: number,
  w: number,
  accent: string,
) {
  // Card backdrop.
  s.addShape("rect", { x, y, w, h: H - y - 0.7, fill: { color: PAPER }, line: { color: BORDER, width: 1 } });
  s.addText(company.toUpperCase(), {
    x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.4,
    fontFace: "Courier New", fontSize: 12, bold: true, color: accent, charSpacing: 1,
  });
  let py = y + 0.75;
  for (const p of people) {
    s.addText(
      [
        { text: p.name, options: { fontSize: 15, bold: true, color: INK } },
        ...(p.title ? [{ text: `\n${p.title}`, options: { fontSize: 12, color: MUTED } }] : []),
      ],
      { x: x + 0.25, y: py, w: w - 0.5, h: 0.7, valign: "top", lineSpacingMultiple: 1.05 },
    );
    py += 0.85;
    if (py > H - 1.0) break;
  }
}
