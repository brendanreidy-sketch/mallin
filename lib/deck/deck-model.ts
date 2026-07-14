/**
 * Deck model — the view-agnostic slide segmentation for a customer-facing
 * presentation built from an Account Intelligence artifact + dual branding.
 *
 * SINGLE source of truth for "what a customer may see" in deck form. It applies
 * the SAME sanitization rules as /share/[token] (see SanitizedCockpit.tsx), but
 * as explicit data instead of implicit JSX. Both the in-app deck view and the
 * .pptx exporter consume the DeckModel this produces — so the two outputs can
 * never drift apart, and neither can leak a rep-internal field.
 *
 * v2 adds the dual-brand frame (seller + buyer) and the call-specific slides
 * (title, agenda, attendees) sourced from artifact.meeting. Attendees + agenda
 * are customer-safe: everyone listed was on the call, and the agenda is the
 * stated call agenda, not rep-internal tactics.
 *
 * Sanitization (customer-facing — must match SanitizedCockpit):
 *   DROP role_in_deal.rationale / watch_for[] / landmines[] /
 *        questions_to_qualify[].rationale / internal_competitors /
 *        pre_call_brief.primary_objective / metadata.confidence_overall + gaps.
 * Enforced by CONSTRUCTION: a Slide can only carry the customer-safe fields
 * below — there is no escape hatch to a raw artifact.
 */

import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import type { DeckBranding } from "./brands";

export interface DeckFact {
  label: string;
  value: string;
}

export interface DeckEvent {
  date: string;
  headline: string;
  relevance: string;
}

export interface DeckPerson {
  name: string;
  title?: string;
  background: string;
  priorities: string[];
  linkedinUrl?: string;
}

/** One attendee on a slide — name + title only (customer-safe). */
export interface DeckAttendee {
  name: string;
  title?: string;
}

/** The AE presenting the deck, for the "Meet your rep" intro slide. All fields
 *  are the seller introducing themselves — customer-safe by nature. Populated
 *  only from an AE-confirmed profile (see lib/deck/ae-profile.ts). */
export interface DeckSellerPerson {
  name: string;
  title?: string;
  bio?: string;
  linkedinUrl?: string;
}

/** A verbatim quote on a slide, with attribution. */
export interface DeckQuoteView {
  text: string;
  attribution: string; // "Steven Dixon, VP of Finance"
}

/** A single slide. Discriminated by `kind`; each carries only customer-safe
 *  content. Keep this union small and concrete. */
export type Slide =
  | {
      kind: "title";
      sellerName: string;
      buyerName: string;
      meetingTitle: string;
      meetingDate?: string;
    }
  | {
      kind: "intro";
      title: string;
      sellerName: string;
      person: DeckSellerPerson;
    }
  | { kind: "agenda"; title: string; items: string[] }
  | { kind: "points"; title: string; bullets: string[] }
  | { kind: "quotes"; title: string; quotes: DeckQuoteView[] }
  | {
      kind: "impact";
      title: string;
      metrics: { value: string; label: string }[];
      today: string[];
      withSolution: string[];
      sellerName: string;
    }
  | {
      kind: "attendees";
      title: string;
      sellerName: string;
      sellerPeople: DeckAttendee[];
      buyerName: string;
      buyerPeople: DeckAttendee[];
    }
  | { kind: "facts"; title: string; facts: DeckFact[] }
  | { kind: "events"; title: string; events: DeckEvent[] }
  | { kind: "priorities"; title: string; items: string[] }
  | { kind: "stakeholders"; title: string; people: DeckPerson[] }
  | { kind: "competitive"; title: string; marketPosition?: string; competitors: string[] }
  | { kind: "walkingIn"; title: string; openingAngle?: string; questions: string[] }
  | {
      kind: "fit";
      title: string;
      buyerLabel: string;
      buyerWants: string[];
      sellerLabel: string;
      sellerOffers: string[];
    }
  | { kind: "logoWall"; title: string; brands: string[] }
  | { kind: "closing"; sellerName: string; buyerName: string; subhead: string };

export interface DeckModel {
  accountName: string;
  productContext: string;
  generatedAt: string;
  branding: DeckBranding;
  slides: Slide[];
}

function titleCaseFallback(productContext: string): string {
  if (!productContext) return "Discovery call";
  // Just the lead clause — the full product_context is a run-on that reads as
  // internal framing ("…being offered to X for a future location").
  const head = productContext.split(/\s+[—–-]\s+/)[0].trim();
  return `Discovery — ${head}`;
}

// ── Conciseness — a deck is slide copy, not an intel brief. Source artifacts
// store long paragraphs; these trim them to slide-ready length so nothing
// overflows or overlaps. (The full text still lives on the rep-internal /prep
// cockpit; the deck is the customer-facing, compressed view.) ────────────────

/** Clip to `max` chars at a word boundary with an ellipsis. */
function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—–-]+$/, "") + "…";
}

/** First sentence of a paragraph (so a bullet reads as one clean thought).
 *  A sentence ends only at .!? that is followed by whitespace + a capital
 *  letter (or end of string) — so abbreviations like "U.S." or "e.g." inside a
 *  sentence don't get treated as a full stop (which used to clip "U.S.
 *  expansion" down to "U.S."). */
function firstSentence(s: string): string {
  const t = s.trim();
  const m = t.match(/^.*?[.!?](?=\s+[A-Z]|\s*$)/);
  return (m ? m[0] : t).trim();
}

/** First sentence, then hard-clipped — for bullets / relevance lines. */
function lead(s: string, max: number): string {
  return clip(firstSentence(s), max);
}

/** A short fact value: take the head before the first delimiter, then clip. */
function factValue(s: string): string {
  const head = s.split(/\s[—–-]\s|\(|;|, |\. /)[0];
  return clip(head, 32);
}

/** A place value: pull "City, ST" out of a full address if present. */
function placeValue(s: string): string {
  const m = s.match(/([A-Z][A-Za-z.]+(?:\s[A-Z][A-Za-z.]+){0,2},\s*[A-Z]{2})\b/);
  return m ? m[1] : factValue(s);
}

/** A competitor's name: the part before an em-dash/period/paren, clipped — so a
 *  verbose "Mastro's Ocean Club (Kierland Commons in-center, …)" renders as just
 *  "Mastro's Ocean Club" instead of a fragment with a dangling "(". */
function competitorName(s: string): string {
  const head = s.split(/\s[—–-]\s|\. |:|,|\(/)[0];
  return clip(head, 56);
}

/** Build a redactor from the deal's landmines + opening angle: terms a landmine
 *  says NOT to surface (quoted names, or "do NOT name/mention/propose X"). The
 *  returned fn trims any customer-facing string back to the clause BEFORE such a
 *  term. Field-level sanitization can't catch sensitive *content* inside an
 *  otherwise-safe field — e.g. a stalled project named inside a priority or a
 *  qualifying question — so this is the content-level backstop. */
function makeRedactor(a: AccountIntelligenceArtifact): (s: string) => string {
  const pb = a.pre_call_brief as { landmines?: string[]; opening_angle?: string } | undefined;
  const sources = [...(pb?.landmines ?? []), pb?.opening_angle ?? ""];
  const terms = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/['"]([A-Z][\w&'’ ]{2,40})['"]/g)) terms.add(m[1].trim());
    for (const m of src.matchAll(
      /\bdo not (?:name|mention|propose)\s+['"]?([A-Z][\w&'’ ]{2,40}?)['"]?(?=\s+(?:by name|first|as)\b|[—–,.]|$)/gi,
    ))
      terms.add(m[1].trim());
  }
  const list = [...terms].filter((t) => t.length > 2);
  return (s: string): string => {
    if (!s) return s;
    let out = s;
    for (const t of list) {
      const idx = out.toLowerCase().indexOf(t.toLowerCase());
      if (idx >= 0) {
        const before = out.slice(0, idx);
        const cut = Math.max(
          before.lastIndexOf(" — "),
          before.lastIndexOf(" – "),
          before.lastIndexOf(", "),
          before.lastIndexOf(". "),
        );
        out = (cut > 10 ? before.slice(0, cut) : before).replace(/[\s—–\-,.:;]+$/, "").trim();
      }
    }
    return out;
  };
}

/** Pull notable neighbor/co-tenant brand names out of the offering context:
 *  parenthetical comma-lists (an F&B mix) and any "co-tenancy with X, Y, Z"
 *  phrase. Names only — the wall renders them as chips (real logos are a
 *  Brandfetch-powered follow-up). Returns [] when none are found (no slide). */
function neighborBrands(ctx: string): string[] {
  const names: string[] = [];
  // Lead with the marquee "co-tenancy with X, Y, Z" names (most premium).
  const ct = /co-?tenan\w*\s+(?:with|includes?|:)?\s*([^.]+)/i.exec(ctx);
  if (ct) names.push(...ct[1].split(/,\s*|\s+and\s+/));
  // Then parenthetical comma-lists, SKIPPING location parentheticals like
  // "(Scottsdale, AZ)" so a city/state pair doesn't become a fake brand.
  for (const m of ctx.matchAll(/\(([^)]*,[^)]*)\)/g)) {
    const inner = m[1].trim();
    if (/^[A-Z][\w.\s]+,\s*[A-Z]{2}$/.test(inner)) continue;
    names.push(...inner.split(/,\s*/));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = raw.trim().replace(/^and\s+/i, "");
    const key = n.toLowerCase();
    // Drop blanks, over-long fragments, and bare 2–3 char all-caps (state codes).
    if (n.length > 1 && n.length < 28 && /[A-Za-z]/.test(n) && !/^[A-Z]{2,3}$/.test(n) && !seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out.slice(0, 8);
}

/**
 * Build a customer-facing, dual-branded deck model from an artifact + branding.
 * Only sections with real content produce a slide (mirrors SanitizedCockpit's
 * conditional rendering) so the deck never shows an empty section.
 */
export function buildDeckModel(
  artifact: AccountIntelligenceArtifact,
  accountName: string,
  branding: DeckBranding,
  sellerPerson?: DeckSellerPerson | null,
): DeckModel {
  const a = artifact;
  const m = a.meeting ?? null;
  const slides: Slide[] = [];
  // Content-level safety net: strip anything the landmines say not to surface
  // from every customer-facing free-text field below.
  const redact = makeRedactor(a);

  // 1 — Title (dual brand)
  slides.push({
    kind: "title",
    sellerName: branding.seller.name,
    buyerName: branding.buyer.name || accountName,
    // Use the deck-copy agent's curated meeting title verbatim (e.g.
    // "Northwind / Acme Corp — Intro Call"). Only the product_context
    // FALLBACK gets trimmed to its lead phrase, so a verbose fallback like
    // "Kierland Commons — Proposed JOEY Restaurant Group" collapses to its
    // lead — but a real meeting title keeps its "— <type>" suffix.
    meetingTitle: clip(
      m?.title?.trim() || titleCaseFallback(a.metadata.product_context).split(/\s+[—–]\s+/)[0],
      42,
    ),
    // The deck-copy agent's date is unreliable (it can invent one) — omit it
    // rather than print a wrong "January 1, 2025" on the cover.
    meetingDate: undefined,
  });

  // 1a — Meet your rep. The AE's own confirmed intro, right after the cover so
  // the room knows who they're meeting before the content starts. Rendered only
  // when the caller passes a confirmed profile (loadSellerPerson gates on
  // ae_profile_confirmed) AND it carries at least a name.
  if (sellerPerson?.name?.trim()) {
    slides.push({
      kind: "intro",
      title: "Your contact",
      sellerName: branding.seller.name,
      person: {
        name: clip(sellerPerson.name, 60),
        title: sellerPerson.title ? clip(sellerPerson.title, 60) : undefined,
        bio: sellerPerson.bio ? clip(sellerPerson.bio, 220) : undefined,
        linkedinUrl: sellerPerson.linkedinUrl,
      },
    });
  }

  // 2 — Agenda (from the call's stated agenda)
  if (m && m.agenda.length > 0) {
    slides.push({ kind: "agenda", title: "Agenda", items: m.agenda });
  }

  // 3 — Attendees (grouped by company)
  if (m && m.attendees.length > 0) {
    const seller = m.attendees.filter((p) => p.side === "seller");
    const buyer = m.attendees.filter((p) => p.side === "buyer");
    if (seller.length > 0 || buyer.length > 0) {
      slides.push({
        kind: "attendees",
        title: "On the call",
        sellerName: branding.seller.name,
        sellerPeople: seller.map((p) => ({ name: p.name, title: p.title })),
        buyerName: branding.buyer.name || accountName,
        buyerPeople: buyer.map((p) => ({ name: p.name, title: p.title })),
      });
    }
  }

  // 3a — In their words (verbatim quotes). The strongest "they feel seen"
  // moment for an exec audience; placed early to hook the room.
  if (m?.quotes?.length) {
    const quotes = m.quotes
      .filter((q) => q.text?.trim())
      .slice(0, 3)
      .map((q) => ({
        text: clip(q.text, 150),
        attribution: [q.speaker, q.role].filter(Boolean).join(", "),
      }));
    if (quotes.length > 0) {
      // Frame as continuity — this is a NEXT-call deck, so the quotes are from
      // the last conversation. Opening on "Last time, you said…" is what makes
      // the deck compound across calls instead of reading like a cold pitch.
      slides.push({ kind: "quotes", title: "Last time, you said", quotes });
    }
  }

  // 3a2 — Impact (cost of today vs. value back) — the CFO money slide.
  if (m?.impact && (m.impact.metrics.length > 0 || m.impact.today.length > 0)) {
    slides.push({
      kind: "impact",
      title: "The cost of today",
      sellerName: branding.seller.name,
      // Hero value: allow up to 16 chars so a value+unit range like
      // "90–120 min/day" renders whole instead of clipping mid-word to
      // "90–120 min/da…" (which reads like a typo). Still capped to prevent
      // a runaway string from overflowing the 3-across metric row.
      metrics: m.impact.metrics.slice(0, 3).map((x) => ({ value: clip(x.value, 16), label: clip(x.label, 46) })),
      today: m.impact.today.slice(0, 4).map((t) => clip(t, 64)),
      withSolution: m.impact.with_solution.slice(0, 4).map((t) => clip(t, 64)),
    });
  }

  // 3b — Narrative sections (the deal story): "Where you are today", "What
  // you're solving for", "Why <seller>", "Next steps" — generated by the
  // deck-copy step. Rendered right after attendees, before the account intel.
  if (m?.sections?.length) {
    for (const sec of m.sections) {
      const bullets = sec.bullets.map((b) => lead(b, 130)).filter(Boolean).slice(0, 6);
      if (bullets.length > 0) {
        slides.push({ kind: "points", title: clip(sec.heading, 60), bullets });
      }
    }
  }

  // 4 — Account facts (short values only)
  const facts: DeckFact[] = [];
  if (a.account.industry?.value) facts.push({ label: "Industry", value: factValue(a.account.industry.value) });
  if (a.account.geography?.[0]?.value) facts.push({ label: "Headquarters", value: placeValue(a.account.geography[0].value) });
  if (a.account.revenue_estimate?.value) facts.push({ label: "Revenue", value: factValue(a.account.revenue_estimate.value) });
  if (a.account.headcount_range?.value) facts.push({ label: "Headcount", value: factValue(a.account.headcount_range.value) });
  if (facts.length > 0) slides.push({ kind: "facts", title: `${branding.buyer.name || accountName} at a glance`, facts });

  // When the deck-copy agent has written narrative sections, they tell the deal
  // story better than the deterministic account-intel slices. Lead with the
  // narrative + a clean "at a glance" snapshot and suppress the weaker
  // auto-derived slides (events / priorities / stakeholders / competitive /
  // "what we'd cover") so they don't drag the deck down.
  const hasNarrative = Boolean(m?.sections?.length);

  // 5 — The opportunity (seller-safe backdrop). We deliberately do NOT surface
  // the buyer's recent_events on a customer-facing deck: the `relevance` text is
  // written FOR THE REP (operator voice), and the headlines can surface
  // sensitive news about the prospect (e.g. a stalled rezoning) that a landmine
  // explicitly says to avoid raising. The customer-safe context is the seller's
  // own offering — pulled from the (rep-secret-free) product_context.
  if (!hasNarrative) {
    const ctx = (
      (a.pre_call_brief as { product_context?: string } | undefined)?.product_context ||
      a.metadata.product_context ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const bullets = ctx
      .split(/[.;]\s+(?=[A-Z])|\s+[—–-]\s+/)
      .map((x) => clip(x.trim(), 150))
      .filter(Boolean)
      .slice(0, 4);
    if (bullets.length > 0) {
      slides.push({ kind: "points", title: "The opportunity", bullets });
    }
  }

  // 6 — Why it's a fit. The argument slide: the buyer's stated priorities
  // (left) set against what the offering delivers (right). This replaces a
  // bare "strategic priorities" list — juxtaposition turns a fact dump into a
  // case. Both columns are customer-safe (public priorities + the offering).
  if (!hasNarrative && a.account.strategic_priorities.length > 0) {
    const wants = a.account.strategic_priorities
      .slice(0, 4)
      .map((p) => clip(redact(p.value), 88))
      .filter(Boolean);
    const ctx = (
      (a.pre_call_brief as { product_context?: string } | undefined)?.product_context ||
      a.metadata.product_context ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const offers = ctx
      .split(/[,;.]\s+|\s+[—–-]\s+/)
      .map((x) => clip(x.trim().replace(/^[a-z]/, (c) => c.toUpperCase()), 46))
      .filter((x) => x.length > 3)
      .slice(0, 4);
    if (wants.length > 0 && offers.length > 0) {
      slides.push({
        kind: "fit",
        title: "Why it's a fit",
        buyerLabel: `${branding.buyer.name || accountName} is looking for`,
        buyerWants: wants,
        sellerLabel: `What ${branding.seller.name} offers`,
        sellerOffers: offers,
      });
    }
  }

  // 6b — The neighborhood: notable co-tenants / nearby brands as a chip wall.
  // A visual "caliber of company you'd keep" slide for venue/site deals.
  // Autonomous from the offering context; no slide when none are found.
  if (!hasNarrative) {
    const ctx =
      (a.pre_call_brief as { product_context?: string } | undefined)?.product_context ||
      a.metadata.product_context ||
      "";
    const brands = neighborBrands(ctx);
    if (brands.length >= 3) {
      slides.push({ kind: "logoWall", title: "The neighborhood", brands });
    }
  }

  // 7 — Stakeholders — public-safe fields only (cap 4 people, concise bg)
  if (!hasNarrative && a.stakeholders.length > 0) {
    slides.push({
      kind: "stakeholders",
      title: "Who's in the room",
      people: a.stakeholders.slice(0, 4).map((sh) => ({
        name: sh.name,
        title: sh.title?.value ? clip(sh.title.value, 32) : undefined,
        background: lead(redact(sh.background.value), 110),
        // visible_priorities are the rep's read on what each stakeholder cares
        // about (e.g. "walks from deals over rent") — negotiation intel, not for
        // the buyer's eyes. The rep gets it via the cockpit + landmines slide.
        priorities: [],
        linkedinUrl: sh.linkedin_url,
      })),
    });
  }

  // 8 — Competitive context — buyer-side competitors only (concise)
  if (!hasNarrative && a.competitive_context?.direct_competitors?.length > 0) {
    slides.push({
      kind: "competitive",
      title: "Competitive context",
      marketPosition: a.competitive_context.market_position?.value
        ? lead(redact(a.competitive_context.market_position.value), 150)
        : undefined,
      competitors: a.competitive_context.direct_competitors.slice(0, 5).map((c) => competitorName(c.value)),
    });
  }

  // 9 — What we'd like to cover — the qualifying questions only (the shareable
  // agenda). We DROP opening_angle from the customer deck: it mixes a
  // customer-safe hook with rep-only tactics (e.g. "Do NOT mention <their other
  // deal> by name — let them surface it"), so it can't go on a deck the buyer
  // sees. Question rationale is already excluded (we only take .question).
  if (!hasNarrative && a.pre_call_brief) {
    const questions = (a.pre_call_brief.questions_to_qualify ?? [])
      .slice(0, 5)
      .map((q) => clip(redact(q.question), 130))
      .filter(Boolean);
    if (questions.length > 0) {
      slides.push({
        kind: "walkingIn",
        title: "What we'd like to cover",
        openingAngle: undefined,
        questions,
      });
    }
  }

  // 10 — Closing (dual brand)
  slides.push({
    kind: "closing",
    sellerName: branding.seller.name,
    buyerName: branding.buyer.name || accountName,
    // The deck belongs to the seller's brand — never hardcode the vendor name.
    subhead: `Prepared by ${branding.seller.name}`,
  });

  return {
    accountName,
    productContext: a.metadata.product_context,
    generatedAt: a.metadata.generated_at,
    branding,
    slides,
  };
}

/**
 * REP-FACING prep deck — the private companion to the customer deck. Same
 * renderers, but it deliberately INCLUDES the judgment the customer deck
 * strips: the objective, the landmines, the full opening angle (tactics and
 * all), and the WHY behind each qualifying question. This is Mallín's actual
 * edge, and it must NEVER be shared via the public token — it's generated only
 * through the auth-gated /api/generate-deck/prep route (rep's own tenant only).
 */
export function buildRepDeckModel(
  artifact: AccountIntelligenceArtifact,
  accountName: string,
  branding: DeckBranding,
  sellerPerson?: DeckSellerPerson | null,
): DeckModel {
  const base = buildDeckModel(artifact, accountName, branding, sellerPerson);
  const pb = artifact.pre_call_brief as
    | {
        primary_objective?: string;
        landmines?: string[];
        opening_angle?: string;
        questions_to_qualify?: { question: string; rationale?: string }[];
      }
    | undefined;

  const rep: Slide[] = [];
  if (pb?.primary_objective) {
    rep.push({ kind: "points", title: "Your objective", bullets: [clip(pb.primary_objective, 280)] });
  }
  if (pb?.landmines?.length) {
    rep.push({
      kind: "points",
      title: "Landmines — do NOT",
      bullets: pb.landmines.slice(0, 6).map((l) => clip(l, 180)),
    });
  }
  if (pb?.opening_angle || pb?.questions_to_qualify?.length) {
    rep.push({
      kind: "walkingIn",
      title: "How to play it",
      openingAngle: pb?.opening_angle ? clip(pb.opening_angle, 280) : undefined,
      questions: (pb?.questions_to_qualify ?? [])
        .slice(0, 5)
        .map((q) =>
          q.rationale ? `${lead(q.question, 104)}  — why: ${lead(q.rationale, 88)}` : lead(q.question, 130),
        ),
    });
  }

  // Rep slides lead with what the rep needs first, then the shared context.
  const slides = base.slides.length ? [base.slides[0], ...rep, ...base.slides.slice(1)] : rep;
  return { ...base, slides };
}
