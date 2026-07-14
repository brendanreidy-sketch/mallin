/**
 * Account Intelligence — Pass 0 artifact types.
 *
 * The stable cognition contract. Same shape whether populated by:
 *   - Manual public-web research (today)
 *   - Crunchbase API (later)
 *   - Apollo / People Data Labs (later)
 *   - Contify news intelligence (later)
 *   - Customer-uploaded CSV (later)
 *
 * Every fact carries source attribution + confidence so the rendering
 * layer can show provenance and the agent layer can prioritize
 * higher-confidence facts. The artifact survives source migration
 * without schema change — that's the architectural commitment.
 *
 * See memory: stable_cognition_layer.md for the principle.
 */

export type Confidence = "high" | "medium" | "low";

export type IntelligenceSource =
  | "manual"
  | "crunchbase"
  | "apollo"
  | "people_data_labs"
  | "contify"
  | "newsapi"
  | "web_search"
  | "company_website"
  | "linkedin_url_provided"
  | "customer_input"
  /** Attendee inserted from a calendar invite (Google / Outlook).
   *  Today: manual CLI; tomorrow: OAuth-driven auto-merge. Provenance
   *  stays the same so the rendering layer doesn't change. */
  | "calendar_invite";

/**
 * One sourced + dated + confidence-rated fact. The atomic unit of
 * Account Intelligence. All higher-level structures (account_facts,
 * recent_events, stakeholder backgrounds) compose from this.
 */
export interface SourcedFact {
  value: string;
  source: IntelligenceSource;
  source_url?: string;
  captured_at: string; // ISO 8601
  confidence: Confidence;
  /** Optional human-readable note about why confidence is what it is. */
  confidence_note?: string;
}

/** Account-level company facts. */
export interface AccountProfile {
  name: string;
  domain?: string;
  /** Operator-grade one-line summary. The line a rep could repeat
   *  back to a colleague to convey "what this company is." */
  one_line: SourcedFact;
  industry: SourcedFact;
  geography: SourcedFact[]; // multiple locations sourced separately
  headcount_range?: SourcedFact;
  revenue_estimate?: SourcedFact;

  /** Funding history. Each round is its own sourced event. */
  funding_history: {
    round: string;
    amount_usd: number;
    date: string;
    investors: string[];
    valuation_usd?: number;
    source: IntelligenceSource;
    source_url?: string;
    confidence: Confidence;
  }[];

  /** Strategic priorities visible from public posture (website, press,
   *  leadership statements). What the company is publicly focused on. */
  strategic_priorities: SourcedFact[];

  /** Known leadership. Stakeholder-level enrichment is separate. */
  leadership: {
    name: string;
    title: string;
    status?: "current" | "departed" | "interim";
    tenure_start?: string;
    tenure_end?: string;
    source: IntelligenceSource;
    confidence: Confidence;
  }[];
}

/** Time-stamped events relevant to the deal. */
export interface RecentEvent {
  date: string;
  headline: string;
  /** Why this event matters for the deal Gianna is working. Written
   *  in operator voice — what the rep should DO with this knowledge. */
  relevance: string;
  source: IntelligenceSource;
  source_url?: string;
  confidence: Confidence;
  /** When Mallin discovered this event (not when it happened — that's
   *  `date`). Set by the daily-refresh job so the UI can render a
   *  "NEW" badge for events surfaced within the last 24 hours.
   *  Optional — older manually-compiled events may not have this. */
  captured_at?: string;
}

/** Per-stakeholder enrichment. Stakeholders are stored separately in
 *  the stakeholders table; this is the intelligence layer ABOUT them. */
export interface StakeholderIntel {
  /** Foreign key to stakeholders.id once they're seeded. */
  stakeholder_id?: string;
  name: string;
  title?: SourcedFact;
  /** Best operator-level read on their role in the deal. */
  role_in_deal: {
    value: "champion" | "economic_buyer" | "operator" | "procurement" | "technical_evaluator" | "user" | "unknown";
    confidence: Confidence;
    rationale: string; // why this read
  };
  /** 2-3 line operator-voice background. */
  background: SourcedFact;
  /** What they publicly care about — from posts, interviews, articles. */
  visible_priorities: SourcedFact[];
  /** Concrete rapport hooks — shared connections, mutual interests,
   *  recent moves the rep can reference. */
  rapport_hooks: SourcedFact[];
  /** Behavioral cues to listen for during calls. Operator-grade. */
  watch_for: string[];
  /** Optional LinkedIn URL (if provided / scraped / inferred). */
  linkedin_url?: string;
  /** Web-researched high-level profile. Populated the first time the rep
   *  opens this person's card (around the call) and then HELD in the deal —
   *  not re-fetched unless explicitly refreshed. Absent until looked up. */
  web_research?: StakeholderWebResearch;
}

/** High-level "who is this person" read pulled from the public web and held
 *  per-deal. Same hold-don't-re-pay discipline as the news refresh: research
 *  on first access, persist, refresh only on demand. */
export interface StakeholderWebResearch {
  /** One short operator-voice paragraph: who they are, why they matter. */
  summary: string;
  /** Career highlights / prior roles worth knowing before the call. */
  highlights: string[];
  /** Where the read came from — titles/domains for the provenance trail. */
  sources: { label: string; url?: string }[];
  /** ISO timestamp of the web lookup (when, not who). */
  researched_at: string;
}

/** Competitive landscape. */
export interface CompetitiveContext {
  /** Direct competitors in the buyer's category (not what we're
   *  selling — what THEY are competing in). Useful framing for the
   *  rep to understand market pressures. */
  direct_competitors: SourcedFact[];
  market_position: SourcedFact;
  /** If we know what Mallin's user (Gianna) is competing against
   *  inside the deal — populated from substrate later. */
  internal_competitors?: SourcedFact[];
}

/** Pre-call deal-specific brief. Depends on what's being sold.
 *  When sold_product is unknown, this section is null and the
 *  component renders a placeholder noting we need that info.
 *
 *  NOTE: deliberately does NOT include "likely_objections" /
 *  "objection prep" — pre-call objection prediction is speculative
 *  noise. Top AEs prep questions + discovery, then handle objections
 *  in real time via the Live Coach surface. Adding speculative
 *  objection prep back here would walk us back toward "AI-generated
 *  prep that looks smart but isn't useful." */
export interface PreCallBrief {
  /** What the rep is selling to this account. */
  product_context: string;
  /** ONE prescriptive objective. Same five-element discipline as
   *  Primary Decision Focus. */
  primary_objective: string;
  /** Opening line / framing for the call. */
  opening_angle: string;
  questions_to_qualify: {
    question: string;
    rationale: string;
  }[];
  landmines: string[];
  /** Customer examples / data points to bring up if relevant. */
  evidence_to_bring?: string[];
}

/** Which side of the deal a meeting attendee is on. */
export type MeetingSide = "seller" | "buyer";

/** One attendee of the call, attributed to a company + side. Extracted from
 *  the transcript's participant list (see intake-substrate-agent). Customer-safe:
 *  everyone here was on the call. */
export interface MeetingAttendee {
  name: string;
  /** Role/title as stated or inferred (e.g. "VP of Finance", "Sr. Mid Market AE"). */
  title?: string;
  /** Company they belong to (e.g. "Northwind", "Acme Corp, LLC"). */
  company: string;
  /** seller = the rep's side; buyer = the prospect's side. */
  side: MeetingSide;
}

/** Call/meeting context — who was on the call and what it covered. Populated by
 *  the intake agent from the transcript. Optional + backward-compatible: older
 *  artifacts predate it and render without title/agenda/attendee slides. */
export interface MeetingBlock {
  /** Meeting title, e.g. "Northwind / Acme Corp — Intro Call". */
  title?: string;
  /** ISO date the call happened. */
  date?: string;
  /** discovery | demo | pricing | intro | technical_review | check_in | unknown */
  meeting_type?: string;
  /** Everyone on the call, attributed to seller/buyer. */
  attendees: MeetingAttendee[];
  /** Ordered agenda topics — what the call set out to cover. Extracted from the
   *  transcript's stated agenda, NOT synthesized advice. */
  agenda: string[];
  /** Optional narrative sections for the deck — punchy, slide-ready bullets that
   *  tell the deal story (e.g. "Where you are today", "What you're solving for",
   *  "Why <seller>", "Next steps"). Generated from the call by the deck-copy
   *  step. Customer-facing: framed for the buyer, no rep-internal tactics. */
  sections?: { heading: string; bullets: string[] }[];
  /** Verbatim quotes pulled from the transcript, attributed to the speaker. The
   *  "show them their own words" lever — the single strongest way to make a
   *  prospect feel seen. Customer-safe (they said it on the call). Quote
   *  EXACTLY; no paraphrase (see memory: recommendation_sequence — quoted
   *  evidence, not paraphrase). */
  quotes?: DeckQuote[];
  /** Quantified impact for an executive audience: hero metrics + the cost of the
   *  status quo vs. the value back. Uses real numbers stated on the call. */
  impact?: DeckImpact | null;
  /** created_at of the transcript this deck copy was generated from. Lets
   *  ensureDeckCopy detect a NEWER transcript and regenerate, so the next-call
   *  deck reflects the latest call instead of staying stuck on the first. */
  deck_copy_source_at?: string | null;
}

/** One verbatim quote, attributed. */
export interface DeckQuote {
  /** Exact words from the transcript. Lightly cleaned of filler only. */
  text: string;
  speaker: string;
  /** Role/title, e.g. "VP of Finance". */
  role?: string;
  company?: string;
}

/** One hero metric — a single undeniable figure for an exec slide. */
export interface DeckImpactMetric {
  /** The big number, e.g. "12–15 hrs/wk", "~$40K", "6-7 entities". */
  value: string;
  /** What it measures, e.g. "spent on manual cash prep today". */
  label: string;
}

/** Quantified impact: cost of today vs. value back. */
export interface DeckImpact {
  /** 2-4 hero figures drawn from the call. */
  metrics: DeckImpactMetric[];
  /** The cost of the status quo, short phrases. */
  today: string[];
  /** What changes with the seller's solution, short phrases. */
  with_solution: string[];
}

/** The full Account Intelligence artifact. */
export interface AccountIntelligenceArtifact {
  account: AccountProfile;
  recent_events: RecentEvent[];
  stakeholders: StakeholderIntel[];
  competitive_context: CompetitiveContext;
  pre_call_brief: PreCallBrief | null;
  /** Call context (attendees + agenda). Optional — only present once the intake
   *  agent has extracted it from a transcript. */
  meeting?: MeetingBlock | null;

  metadata: {
    generated_at: string;
    sources_used: IntelligenceSource[];
    confidence_overall: Confidence;
    /** The product context anchors news relevance. EVERY recent_event's
     *  `relevance` field MUST explicitly tie back to what's being sold —
     *  otherwise the news is noise. See memory:
     *  news_to_product_relevance.md for the principle.
     *
     *  Format: short, operator-grade — "Customer Data Platform (CDP)"
     *  or "Hedge accounting + ERP integration" or "Construction-project
     *  financial controls." Specific enough to make every relevance
     *  line testable against it. */
    product_context: string;
    /** Optional: free-form note on confidence + assumptions. */
    notes?: string;
    /** What's missing / would need user input to improve. */
    gaps?: string[];
  };
}
