/**
 * ============================================================================
 *  Recall — the 5th truth-layer
 * ============================================================================
 *
 *    Verification → what's missing
 *    Tie-back     → what to ask
 *    Recall       → why this move matters (because it worked / hurt before)
 *
 *  Premise: reps don't think in frameworks during calls. They think:
 *    "this feels familiar — what worked last time?"
 *
 *  This module surfaces hand-curated past moments — by deal + call —
 *  in the voice of a manager who was there. No analyst register, no
 *  "in similar situations." Always anchored to a specific deal:
 *
 *    "This looks like Brightpath (Call 4). A competitor came up
 *     mid-cycle. You didn't avoid it — you leaned in and positioned
 *     against it. That worked — stayed in control of the narrative.
 *     Don't let competition sit in the background."
 *
 *  Hard rules (Brendan's design):
 *    - Hand-curated, NOT AI-generated. The library IS the product.
 *    - Always names a specific deal + call, never "in similar situations."
 *    - Surface MAX 1 moment per call. Silence > noise.
 *    - The lesson is the rep's call, never prescriptive.
 *
 *  v1: 3 hardcoded moments + rule-based matcher. v2 (later): AI
 *  similarity over a larger library, only after the voice and matches
 *  are validated by real rep reactions.
 * ============================================================================
 */

import type { BehavioralSignals } from "./methodology-escalation";

export type RecallConfidence = "high" | "medium" | "low";

export interface DealMoment {
  /** Stable id. */
  id: string;
  /** Source deal — surfaced by name in the recall. */
  source_deal: string;
  /** Source call index in the source deal. */
  source_call_index: number;
  /** Outcome of the source DEAL (not the moment). */
  outcome: "won" | "lost" | "open";
  /** The story, in 4 short prose blocks (Brendan's exact format). */
  situation: string; // "A competitor came up mid-cycle."
  rep_move: string; // "You didn't avoid it — you leaned in..."
  what_happened: string; // "That worked — stayed in control..."
  lesson: string; // "Don't let competition sit in the background."
  /** Confidence shapes language: high → direct, medium → softer.
   *  Low → don't show. */
  confidence: RecallConfidence;
  /** Predicate — does this moment match the current call's context? */
  matchPredicate: (ctx: MatchContext) => boolean;
}

export interface MatchContext {
  call_index: number; // 1-based
  total_calls_so_far: number;
  /** Per-call fields the extractor proposed (what was said THIS call). */
  extracted_fields: Record<string, string>;
  /** Cumulative SF state through this call. */
  cumulative_state: Record<string, string | null>;
  /** Raw call summary text. */
  call_summary: string;
  /** Per-call behavioral signals. */
  behavioral: BehavioralSignals;
  /** The 30-second AI read for this call. */
  the_read: string;
  /** Source deal name being replayed (e.g. "Brightpath" / "Summit").
   *  Moments from THIS deal are skipped — recall surfaces lessons
   *  from OTHER deals, not the deal itself. */
  current_deal: string;
}

// ─── Signal helpers (rule-based, no AI) ─────────────────────────────────

// Vendor-neutral competitor tokens. These are illustrative placeholders
// for the demo recall library — a real deployment would source competitor
// names from the deal substrate rather than a hardcoded list.
const KNOWN_COMPETITORS = [
  "vantage",
  "northstar",
  "apex systems",
  "build in-house",
  "build in house",
  "in-house build",
];

const COMPETITOR_M_AND_A_PHRASES = [
  "acquired by",
  "acquired",
  "merger",
  "merged",
  "bought by",
  "got bought",
  "m&a",
  "going public",
  "ipo",
];

const TECH_EXEC_TITLES = [
  "cto",
  "cio",
  "ciso",
  "chief technology",
  "chief information",
  "chief security",
  "head of it",
  "head of technology",
  "vp of technology",
];

const RETIREMENT_PHRASES = [
  "retir",
  "stepping down",
  "leaving",
  "departing",
  "transitioning out",
  "knowledge transfer",
  "succession",
];

function haystack(ctx: MatchContext, fields: string[] = []): string {
  const fieldText = fields
    .map((f) => ctx.extracted_fields[f] ?? ctx.cumulative_state[f] ?? "")
    .join(" ");
  return (fieldText + " " + ctx.the_read + " " + ctx.call_summary).toLowerCase();
}

function mentionsCompetitor(ctx: MatchContext): boolean {
  const h = haystack(ctx, [
    "X10_Competition__c",
    "Final_Competitor__c",
    "Shortlisted_Competition__c",
  ]);
  return KNOWN_COMPETITORS.some((c) => h.includes(c));
}

function mentionsPricing(ctx: MatchContext): boolean {
  const h = haystack(ctx);
  return /\b(price|pricing|discount|negotiat|best.{0,4}final|proposal|quoted|list price)\b/.test(
    h,
  );
}

function hasVendorOfChoiceSignal(ctx: MatchContext): boolean {
  const h = haystack(ctx, [
    "Customer_knows_agrees_on_deal__c",
    "ED_Vendor_of_Choice__c",
  ]);
  return /(going with you|chose (us|you)|picked (us|you)|selected (us|you)|vendor of choice|we['']re going|we are going)/.test(
    h,
  );
}

/** Count distinct buyer-side stakeholders surfaced through this call's
 *  cumulative state. Used to detect "the room got big." */
function buyerStakeholderCount(ctx: MatchContext): number {
  // Heuristic: count distinct title-shaped tokens in stakeholder-bearing
  // fields. Good enough for the v1 keyword matcher.
  const text = (
    (ctx.cumulative_state["Who_is_the_Champion__c"] ?? "") +
    " " +
    (ctx.cumulative_state["Who_is_the_Economic_Buyer__c"] ?? "") +
    " " +
    (ctx.extracted_fields["Other_Stakeholders__c"] ?? "") +
    " " +
    (ctx.extracted_fields["X15_Power_Map_both_IT_Business_done__c"] ?? "") +
    " " +
    ctx.call_summary
  ).toLowerCase();
  // Count distinct given names (capitalized words 3+ chars). Cheap proxy.
  const matches = ((ctx.call_summary || "").match(/\b[A-Z][a-z]{2,}\b/g) ??
    []) as string[];
  return new Set(matches).size;
}

function mentionsCompetitorMAndA(ctx: MatchContext): boolean {
  const h = haystack(ctx);
  const competitorPresent = mentionsCompetitor(ctx);
  const maPhrasePresent = COMPETITOR_M_AND_A_PHRASES.some((p) =>
    h.includes(p),
  );
  return competitorPresent && maPhrasePresent;
}

function mentionsTechExecJoining(ctx: MatchContext): boolean {
  const h = haystack(ctx);
  // Word-boundary matching — substring includes catches "October"
  // (contains "cto"), "vector" (contains "cto"), etc.
  const titlePatterns = [
    /\bcto\b/,
    /\bcio\b/,
    /\bciso\b/,
    /\bchief technology\b/,
    /\bchief information\b/,
    /\bchief security\b/,
    /\bhead of it\b/,
    /\bhead of technology\b/,
    /\bvp of technology\b/,
  ];
  return titlePatterns.some((p) => p.test(h));
}

function mentionsRetirement(ctx: MatchContext): boolean {
  const h = haystack(ctx);
  return RETIREMENT_PHRASES.some((p) => h.includes(p));
}

// ─── The 3 moments (Brendan's exact voice) ──────────────────────────────

export const MOMENTS: DealMoment[] = [
  {
    id: "brightpath_competition_call_4",
    source_deal: "Brightpath",
    source_call_index: 4,
    outcome: "won",
    situation: "A competitor came up mid-cycle.",
    rep_move:
      "You didn't avoid it — you leaned in and positioned against it.",
    what_happened: "That worked — stayed in control of the narrative.",
    lesson: "Don't let competition sit in the background.",
    confidence: "high",
    matchPredicate: (ctx) => {
      // Mid-cycle = call 3 or 4 of a typical 6-call cycle.
      // Generalize: roughly the middle 1/3 of calls so far, with min call 3.
      const isMidCycle = ctx.call_index >= 3 && ctx.call_index <= 4;
      return isMidCycle && mentionsCompetitor(ctx);
    },
  },
  {
    id: "summit_best_and_final_call_5",
    source_deal: "Summit",
    source_call_index: 5,
    outcome: "lost",
    situation: "Deal moved to best-and-final against a competitor.",
    rep_move: "You competed on price.",
    what_happened: "That hurt — lost control of the decision.",
    lesson: "If you're in best-and-final, you're already late.",
    confidence: "high",
    matchPredicate: (ctx) => {
      // Late stage + competitor in play + pricing on the table
      const isLateStage = ctx.call_index >= 5;
      return (
        isLateStage && mentionsCompetitor(ctx) && mentionsPricing(ctx)
      );
    },
  },
  {
    id: "summit_no_voc_late",
    source_deal: "Summit",
    source_call_index: 6,
    outcome: "lost",
    situation: "No clear 'we're going with you' moment.",
    rep_move: "Deal stayed competitive until the end.",
    what_happened: "That hurt — became a pricing decision.",
    lesson: "If they haven't picked you, they haven't picked you.",
    confidence: "medium",
    matchPredicate: (ctx) => {
      const isLateStage = ctx.call_index >= 5;
      return isLateStage && !hasVendorOfChoiceSignal(ctx);
    },
  },
  // ─── More moments (Meridian / Delta / Orion) ────────────────────────
  {
    id: "meridian_full_room_demo",
    source_deal: "Meridian",
    source_call_index: 2,
    outcome: "won",
    situation: "Demo brought 8 people from their side — Finance, Ops, IT, and department leads.",
    rep_move:
      "You didn't simplify — you let each stakeholder validate their own pain in the room.",
    what_happened:
      "That worked — by call 7 they pushed for EOY signature themselves.",
    lesson: "A full room is your ally if you let it talk.",
    confidence: "high",
    matchPredicate: (ctx) => {
      const isDemoStage = ctx.call_index >= 2 && ctx.call_index <= 3;
      const bigRoom = buyerStakeholderCount(ctx) >= 4;
      // The CURRENT call must be a demo. Past-tense references in the
      // read ("after the demos…") shouldn't fire this — must be a
      // demo-shaped call now.
      const isCurrentCallDemo =
        /\bdemo\b|kickoff demo|product demo|tailored demo|deep[-\s]dive demo/i.test(
          (ctx.call_summary || "").slice(0, 600),
        );
      return isDemoStage && bigRoom && isCurrentCallDemo;
    },
  },
  {
    id: "delta_cto_at_pricing",
    source_deal: "Delta Foods",
    source_call_index: 15,
    outcome: "won",
    situation:
      "The CTO joined for the first time at pricing. Asked for it in writing to review and document.",
    rep_move:
      "You took it as a real escalation, not paranoia. Pulled in the solutions lead and ran an exec call within 30 days.",
    what_happened:
      "That worked — exec involvement closed the deal even with security and liability concerns.",
    lesson:
      "When the CTO shows up at pricing, treat it like a new evaluation. Move fast.",
    confidence: "high",
    matchPredicate: (ctx) => {
      const techExecPresent = mentionsTechExecJoining(ctx);
      const pricingPresent = mentionsPricing(ctx);
      return techExecPresent && pricingPresent;
    },
  },
  {
    id: "orion_retiring_stakeholder",
    source_deal: "Orion",
    source_call_index: 1,
    outcome: "won",
    situation:
      "The department head was retiring. Institutional knowledge was about to walk out the door.",
    rep_move:
      "You named the urgency on call 1 — knowledge transfer = real deal-driver.",
    what_happened:
      "That worked — got the buyer to fund the eval and the rollout in the same year.",
    lesson: "A retirement is a buying trigger. Surface it on call 1.",
    confidence: "high",
    matchPredicate: (ctx) => {
      const isEarly = ctx.call_index <= 2;
      return isEarly && mentionsRetirement(ctx);
    },
  },
];

/**
 * Match at most ONE moment per call. Priority order = list order.
 * First match wins. Returns null when no moment fires (silence > noise).
 *
 * Self-reference filter: never surface a moment from the same deal
 * being replayed (avoids the tautology "this looks like Brightpath" while
 * playing Brightpath).
 */
export function recallMomentForCall(ctx: MatchContext): DealMoment | null {
  const currentDealNorm = normalizeDealName(ctx.current_deal);
  for (const m of MOMENTS) {
    if (m.confidence === "low") continue; // never show low-confidence
    if (normalizeDealName(m.source_deal) === currentDealNorm) continue;
    if (m.matchPredicate(ctx)) return m;
  }
  return null;
}

function normalizeDealName(name: string): string {
  return name.toLowerCase().trim().split(/[\s,.\-—]/)[0];
}
