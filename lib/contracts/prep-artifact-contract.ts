/**
 * ============================================================================
 *  PrepArtifact — v2 (hardened)
 * ============================================================================
 *
 *  Single source of truth between the Execution Agent and the UI.
 *  Derived from v1, hardened by five scenario runs (clean / stalled / cold
 *  outreach / negotiation / multi-stakeholder skeptic).
 *
 *  Principles, carried forward from v1:
 *
 *    1. Structured output, not prose. Enforced shapes and char limits.
 *    2. Evidence required for strategic claims (risks, actions,
 *       value hypotheses). Not required for synthesis layers
 *       (opening, closing).
 *    3. Graceful degradation. Every block has a defined empty-state
 *       meaning. Cold-outreach produces a valid artifact with blocks
 *       that accurately say "no data yet".
 *    4. Methodology-aware. MEDDPICC is the MVP default; pluggable.
 *    5. Conditional by call type. TalkTrack has a structured core plus
 *       conditional sub-blocks gated by meeting_type. Not a discriminated
 *       union. Not optional-everything.
 *    6. Stakeholders are first-class. A call is a conversation with a
 *       set of actors, each with a role, disposition, engagement level,
 *       and influence. The agent and the UI both reason about them as
 *       named entities, not as flat attendee strings.
 *
 * ============================================================================
 */

// ────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL ARTIFACT
// ────────────────────────────────────────────────────────────────────────────

export interface PrepArtifact {
  meeting: MeetingContext;
  account: AccountContext;
  opportunity: OpportunityContext;

  /** First-class list of actors on this deal. Replaces v1's reliance on
   *  Attendee + a single champion string field. */
  stakeholders: Stakeholder[];

  /** Time-shape of the deal. Forcing functions drive urgency and
   *  prioritization; every scenario run surfaced this gap in v1. */
  forcing_function: ForcingFunction | null;

  /** Private directives from Champion to rep. Highest-value information
   *  type in the system; had no home in v1. */
  champion_coaching: ChampionCoaching | null;

  /** Commercial negotiation state. Present for pricing/negotiation/close
   *  meeting types; null otherwise. */
  commercial_state: CommercialState | null;

  summary: ExecutiveSummary;

  risks_and_gaps: RiskGap[];
  recommended_actions: RecommendedAction[];

  talk_track: TalkTrack;

  intelligence: SupportingIntelligence[];

  metadata: ArtifactMetadata;
}

// ────────────────────────────────────────────────────────────────────────────
// MEETING CONTEXT
// ────────────────────────────────────────────────────────────────────────────

export interface MeetingContext {
  meeting_id: string;
  title: string;
  datetime: string;

  meeting_type:
    | "cold_outreach"
    | "discovery"
    | "demo"
    | "technical_review"
    | "pricing"
    | "negotiation"
    | "check_in"
    | "unknown";

  /** Classification confidence. Surfaced in UI as an overridable pill when
   *  low, inviting the rep to correct the type. */
  meeting_type_confidence: "high" | "medium" | "low";

  attendees: Attendee[];
  internal_owner: string;
}

export interface Attendee {
  name: string;
  email?: string;
  role?: string;
  company?: string;

  /** Cross-reference to the full Stakeholder record, when one exists.
   *  Attendees who are not yet modeled as stakeholders (e.g. a new
   *  participant added to the invite today) omit this field. */
  stakeholder_id?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// ACCOUNT + OPPORTUNITY
// ────────────────────────────────────────────────────────────────────────────

export interface AccountContext {
  account_id: string;
  name: string;
  industry?: string;
  size?: string;

  /** Strategic context about the company — macro posture, public signals.
   *  Deal-specific pain lives in the methodology pillars on Opportunity,
   *  not here. This collapses v1's account-level / methodology duplication. */
  strategic_priority?: string;

  /** Public signals about the company that matter for the deal. Pulled from
   *  Intelligence agent. Max 3, each ≤ 140 chars. */
  public_signals?: string[];
}

export interface OpportunityContext {
  opportunity_id: string;
  stage: string;
  amount?: number;
  close_date?: string;

  methodology: MethodologyState;

  last_activity_summary?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// METHODOLOGY (pluggable) — drives qualification reasoning + UI display
// ────────────────────────────────────────────────────────────────────────────

export interface MethodologyState {
  /** Which framework this customer uses. */
  methodology_type: "MEDDPICC" | "MEDDIC" | "BANT" | "CHALLENGER" | "SPICED" | "CUSTOM";

  /** Display posture, not content. Lets the UI subordinate the methodology
   *  block on late-stage deals where the framework has served its purpose
   *  and only the remaining gaps matter. */
  surface_mode: "full" | "gaps_only" | "reference";

  /** Overall normalized score 0-1 derived by the customer's configured
   *  pillar weighting. Optional; not all customers configure scoring. */
  score?: number;

  /** Pillars in display order. Mappers produce framework-specific keys
   *  and labels. The agent reasons over status + value + evidence; the UI
   *  renders label + status + value. */
  pillars: MethodologyPillar[];
}

export interface MethodologyPillar {
  /** Framework-specific stable key. Not displayed.
   *  MEDDPICC: "metrics", "economic_buyer", "decision_criteria",
   *  "decision_process", "paper_process", "identify_pain", "champion",
   *  "competition".
   *  BANT: "budget", "authority", "need", "timing".
   *  SPICED: "situation", "pain", "impact", "critical_event", "decision". */
  key: string;

  /** Display label. Example: "M · Metrics" or "Budget" or "Critical Event". */
  label: string;

  status: "confirmed" | "partial" | "unknown" | "not_applicable";

  /** What's known. String for single-value pillars (champion, EB);
   *  string array for multi-value pillars (metrics, decision criteria,
   *  competition). */
  value?: string | string[];

  evidence_ids?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// STAKEHOLDERS — first-class actors on the deal
// ────────────────────────────────────────────────────────────────────────────

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  company: string;

  /** Their disposition toward the deal. */
  disposition:
    | "champion"
    | "supporter"
    | "neutral"
    | "skeptic"
    | "blocker"
    | "unknown";

  /** How much weight their opinion carries in the decision. */
  influence_level: "high" | "medium" | "low";

  /** Observed engagement pattern across recent touches. "silent" is a
   *  meaningful signal — a stakeholder present but not speaking is
   *  different from one actively contributing. */
  engagement_level: "active" | "passive" | "silent" | "absent";

  /** Whether this stakeholder is attending the upcoming call. */
  attending_upcoming_call: boolean;

  /** Is this person new to the deal since the last substantive touch?
   *  New entrants warrant re-contextualization. */
  is_new_to_deal: boolean;

  /** Free-text notes about this specific stakeholder. Max 200 chars. */
  notes?: string;

  /** References into risks_and_gaps for risks attributed to this stakeholder. */
  risk_ids?: string[];

  /** Evidence supporting the current characterization. Required if
   *  disposition is claimed as anything other than "unknown". */
  evidence_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// FORCING FUNCTION — temporal anchor of the deal
// ────────────────────────────────────────────────────────────────────────────

export interface ForcingFunction {
  /** What's driving the deadline. */
  kind:
    | "board_meeting"
    | "quarter_end"
    | "budget_cycle"
    | "contract_expiry"
    | "regulatory_event"
    | "product_launch"
    | "competitor_action"
    | "internal_mandate"
    | "other";

  /** Plain-language description. Max 140 chars. */
  description: string;

  /** The date this forcing function lands. */
  date: string;

  /** How many days from artifact generation. Useful for UI urgency rendering. */
  days_out: number;

  /** How firm is this deadline? "hard" = stated hard line; "soft" = inferred
   *  or preferential; "stated" = customer said it but flexibility unclear. */
  firmness: "hard" | "stated" | "soft";

  evidence_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// CHAMPION COACHING — private directives from Champion to rep
// ────────────────────────────────────────────────────────────────────────────

export interface ChampionCoaching {
  id: string;

  /** The Champion who provided this guidance. */
  champion_stakeholder_id: string;

  /** The directive, captured as close to verbatim as possible. Max 300 chars. */
  directive: string;

  /** When this was given. */
  given_at: string;

  /** Context — was this offhand, post-call, in private email, etc. */
  context: "private_email" | "offline_conversation" | "post_call_debrief" | "text_message" | "other";

  /** Evidence — the email, note, or transcript segment where this was captured. */
  evidence_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// COMMERCIAL STATE — negotiation/pricing-specific
// ────────────────────────────────────────────────────────────────────────────

export interface CommercialState {
  list_price_annual?: number;
  proposed_price_annual: number;
  proposed_term_months: number;
  proposed_payment: "annual" | "quarterly" | "monthly" | "custom";
  proposed_discount_pct: number;

  /** What the customer has explicitly asked for. */
  customer_asks: CustomerAsk[];

  /** Concessions already made. Track these so we don't re-concede. */
  concessions_made_to_date: Concession[];

  /** Deal desk floors — what we can approve without escalation. */
  floors: {
    max_discount_pct: number;
    min_term_months: number;
    approved_payment_terms: Array<"annual" | "quarterly" | "monthly">;
  };

  /** Redline/legal status. */
  redline_status?: string;

  /** Currently open redline items. */
  open_redlines?: string[];
}

export interface CustomerAsk {
  category: "price" | "term" | "payment" | "scope" | "legal" | "other";
  description: string; // max 140 chars
  firmness: "hard" | "stated" | "soft";
  evidence_ids: string[];
}

export interface Concession {
  description: string; // max 140 chars
  conceded_at: string; // ISO8601
  conceded_by: "rep" | "deal_desk" | "manager";
  evidence_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTIVE SUMMARY
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutiveSummary {
  /** Current state of the deal. Max 240 chars. */
  situation: string;

  /** What this specific meeting needs to accomplish. Max 140 chars. */
  objective: string;

  /** 2-4 bullets. Each ≤ 90 chars. */
  key_focus: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// RISKS + ACTIONS
// ────────────────────────────────────────────────────────────────────────────

export interface RiskGap {
  id: string;

  category:
    | "MEDDPICC"
    | "Stakeholder"
    | "Timing"
    | "Commercial"
    | "Deal Hygiene"
    | "Technical"
    | "Unknown";

  /** Max 180 chars. */
  description: string;

  impact: "low" | "medium" | "high";

  /** Max 160 chars. */
  suggested_resolution?: string;

  /** Optional link to stakeholder this risk is attributed to. */
  stakeholder_id?: string;

  /** Required. */
  evidence_ids: string[];
}

export interface RecommendedAction {
  id: string;

  /** Max 120 chars. */
  action: string;

  priority: "low" | "medium" | "high";

  /** Max 140 chars. */
  rationale: string;

  related_risk_ids?: string[];

  owner: "rep" | "manager" | "system";

  /** Required. */
  evidence_ids: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// TALK TRACK — structured core + conditional sub-blocks
// ────────────────────────────────────────────────────────────────────────────

export interface TalkTrack {
  /** Max 400 chars. */
  opening: string;

  /** The questions / commitment tests / diagnostic probes the rep should
   *  bring into the call. Name is generic on purpose — discovery calls
   *  populate these with pain-exploration questions, negotiation calls
   *  populate them with commitment probes. Max 7, each ≤ 200 chars. */
  probes: Probe[];

  /** What "good" looks like for this call. Max 140 chars. Forces the
   *  agent to commit to a success definition rather than hedge. */
  success_criterion: string;

  /** Discovery/early-stage sub-block. Populated for cold_outreach,
   *  discovery, demo, technical_review. */
  discovery?: {
    value_hypotheses: ValueHypothesis[]; // max 4
  };

  /** Negotiation/late-stage sub-block. Populated for pricing,
   *  negotiation. */
  negotiation?: {
    proposal_on_the_table: Proposal;
    concession_plan?: string[]; // max 5
    walkaway_position?: string; // max 200 chars, internal only
  };

  /** Objection handling. For negotiation meeting_type, min 3 required;
   *  for other types, optional. Each with optional stakeholder attribution. */
  objections: ObjectionHandle[];

  /** Max 200 chars. */
  closing: string;
}

export interface Probe {
  /** Max 200 chars. */
  text: string;

  /** Optional — which stakeholder is this probe directed at? */
  directed_at_stakeholder_id?: string;

  /** What this probe is trying to surface. */
  targets: "pain" | "authority" | "timing" | "competition" | "criteria" | "commitment" | "dynamics";

  /** Optional — when this probe is derived from a specific risk, stakeholder
   *  signal, or prior call moment, cite it. Not required for generic probes. */
  evidence_ids?: string[];
}

export interface ValueHypothesis {
  /** Max 180 chars. */
  hypothesis: string;

  /** Whether this hypothesis is backed by observed customer signals or
   *  inferred from pattern-matching on company stage/context. Evidence
   *  requirements apply equally, but the UI renders inferred hypotheses
   *  with a visible "inferred" marker. */
  basis: "evidenced" | "inferred";

  evidence_ids: string[];
}

export interface Proposal {
  /** The offer currently on the table. */
  price_annual: number;
  term_months: number;
  payment: "annual" | "quarterly" | "monthly" | "custom";
  discount_pct: number;

  /** What we're asking in exchange for this offer, if anything.
   *  E.g. "conditional on signature by May 15". Max 200 chars. */
  conditional_on?: string;

  /** Required. The proposal is strategic and commercial — must cite the
   *  source data (deal desk approval, customer ask, prior concession). */
  evidence_ids: string[];
}

export interface ObjectionHandle {
  /** Max 120 chars. */
  objection: string;

  /** Max 220 chars. */
  response: string;

  /** Optional attribution — which stakeholder is likely to raise this? */
  attributed_to_stakeholder_id?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// SUPPORTING INTELLIGENCE — evidence layer
// ────────────────────────────────────────────────────────────────────────────

export interface SupportingIntelligence {
  id: string;

  source_channel: "call" | "crm" | "email" | "calendar" | "external";
  derivation: "observed" | "inferred";

  /** Max 200 chars. */
  summary: string;

  /** For observed call/email items, the raw quote or snippet. Max 240 chars.
   *  Not required for CRM fields or inferred items. */
  quote?: string;

  /** Strength of this piece of evidence. Not all observations are created
   *  equal — a direct CFO quote is stronger than a passing mention. */
  strength?: "strong" | "moderate" | "weak";

  source_ref?: {
    system:
      | "gong"
      | "chorus"
      | "fireflies"
      | "google_meet"
      | "salesforce"
      | "hubspot"
      | "gmail"
      | "google_calendar"
      | "linkedin"
      | "sec_edgar"
      | "crunchbase"
      | "news"
      | "internal"
      | "manual";
    external_id?: string;
    timestamp?: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// METADATA — hybrid confidence, dropped warnings
// ────────────────────────────────────────────────────────────────────────────

export interface ArtifactMetadata {
  generated_at: string;
  agent_version: string;

  confidence: {
    level: "high" | "medium" | "low" | "insufficient_data";
    score: number; // 0-1, internal eval use
    rationale: string; // max 200 chars
  };

  data_completeness: number; // 0-1
}

/**
 * Documented UI behavior per confidence level. Not enforced by types;
 * enforced by UI layer against this contract.
 */
export const CONFIDENCE_UI_BEHAVIOR = {
  insufficient_data: "render empty state, do not show artifact",
  low: "render artifact with prominent warning banner",
  medium: "render artifact with subtle confidence indicator",
  high: "render artifact, no warnings",
} as const;

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

export const CONSTRAINTS = {
  items: {
    stakeholders: { max: 12 },
    key_focus: { max: 4 },
    public_signals: { max: 3 },
    risks_and_gaps: { max: 5 },
    recommended_actions: { max: 5 },
    probes: { max: 7 },
    value_hypotheses: { max: 4 },
    concession_plan: { max: 5 },
    objections_by_type: {
      negotiation: { min: 3, max: 5 },
      pricing: { min: 3, max: 5 },
      default: { max: 5 },
    },
    customer_asks: { max: 8 },
    concessions_made_to_date: { max: 10 },
    open_redlines: { max: 8 },
  },
  chars: {
    situation: 240,
    objective: 140,
    key_focus_item: 90,
    public_signal: 140,
    strategic_priority: 200,
    stakeholder_notes: 200,
    forcing_function_description: 140,
    champion_coaching_directive: 300,
    risk_description: 180,
    risk_suggested_resolution: 160,
    action_description: 120,
    action_rationale: 140,
    opening: 400,
    probe_text: 200,
    success_criterion: 140,
    value_hypothesis: 180,
    proposal_conditional_on: 200,
    walkaway_position: 200,
    objection_text: 120,
    objection_response: 220,
    closing: 200,
    intelligence_summary: 200,
    intelligence_quote: 240,
    customer_ask_description: 140,
    concession_description: 140,
    confidence_rationale: 200,
  },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Validates a PrepArtifact against the contract.
 *
 * Validation strictness follows the mixed-mode decision:
 *   - STRICT on structural fields (required blocks, required types,
 *     required evidence on risks/actions/value_hypotheses)
 *   - LENIENT on soft constraints (char limits truncate with ellipsis
 *     in UI; exceeding them does not reject the artifact)
 *   - CONDITIONAL fields enforced by meeting_type:
 *       - cold_outreach / discovery / demo / technical_review →
 *         talk_track.discovery may be populated
 *       - pricing / negotiation →
 *         commercial_state must be present;
 *         talk_track.negotiation must be populated;
 *         talk_track.objections.length >= 3
 *       - negotiation / check_in → talk_track.discovery.value_hypotheses
 *         may be empty or absent
 */
export function validatePrepArtifact(
  artifact: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  // Implementation detail — lives alongside agent code, not in contract.
  // Enforce: required top-level blocks, required evidence on RiskGap /
  // RecommendedAction / ValueHypothesis, conditional blocks per meeting_type,
  // min objections for negotiation/pricing.
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
