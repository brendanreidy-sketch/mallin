/**
 * ============================================================================
 *  ExecutionAgentInput — source-neutral normalized input
 * ============================================================================
 *
 *  This is the shape the Execution agent prompt consumes. Mappers turn
 *  per-source raw data (Salesforce SObjects, HubSpot CRM objects, Gong
 *  transcripts, Chorus transcripts, Fireflies transcripts, Google Meet
 *  recordings, Gmail messages, Google Calendar events, LinkedIn profiles,
 *  SEC EDGAR filings, news APIs) into this shape.
 *
 *  Discipline: every field below is a concept that exists meaningfully
 *  across all supported sources. Source-specific concepts (Salesforce
 *  SObject IDs, HubSpot pipeline_stage_ids, Gong call_id formats) live
 *  only in raw types and mappers, never here.
 *
 *  When a mapper needs to resolve a source-specific concept (e.g. Salesforce
 *  StageName) into a neutral concept (stage_label + stage_position), that
 *  resolution is the mapper's job. The agent never sees the source-specific
 *  artifact.
 *
 * ============================================================================
 */

// ────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL INPUT
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutionAgentInput {
  /** The specific upcoming call this prep is being generated for. */
  meeting: NormalizedMeeting;

  /** The account this call is tied to. */
  account: NormalizedAccount;

  /** The opportunity (deal) this call is tied to. */
  opportunity: NormalizedOpportunity;

  /** The full set of stakeholders known on the deal. Includes upcoming-call
   *  attendees plus any other modeled actors (departed champions still
   *  carry signal, for example). */
  stakeholders: NormalizedStakeholder[];

  /** Logged activities — the structured CRM record of touches over time.
   *  Calls, emails, meetings, notes. Refers by ID into calls / emails / etc.
   *  for richer payload. */
  activities: NormalizedActivity[];

  /** Call records (transcripts and metadata) from any call intelligence
   *  source. Source provider preserved on each. */
  calls: NormalizedCall[];

  /** Email threads. Source provider preserved. */
  emails: NormalizedEmail[];

  /** External intelligence — synthesized signals from public data sources.
   *  This is the substrate's view, not raw API responses. */
  external_intelligence: NormalizedExternalSignal[];

  /** Supporting intelligence — observation records produced by Pass 2
   *  Core Intelligence agent. Each carries an ID referenced from
   *  evidence_ids on methodology pillars, stakeholder claims,
   *  customer_asks, etc. Empty pre-Pass-2; populated after Core
   *  Intelligence runs. */
  intelligence: SupportingIntelligence[];

  /** Commercial state if this deal has progressed to pricing/negotiation.
   *  Null for early-stage deals where no proposal exists yet. */
  /** Conflicts surfaced by Pass 2. */
  conflicts?: unknown[];

  /** Full Pass 2 enrichments payload. */
  core_intelligence_enrichments?: unknown;


  commercial_state?: NormalizedCommercialState;

  /** Generation context — when the input was assembled and against which
   *  methodology framework. */
  context: InputContext;

  /** Feed-forward: questions the rep has been asking Mallín on this deal (from
   *  live_coach_turns). When present, the brief should lead with what the rep
   *  is actually probing. Optional — absent on first generation / no chat. */
  rep_focus?: string[];

  /** Cross-deal lens: recurring questions the rep asks across their OTHER
   *  deals — reveals how they reason, so the brief reflects their analytical
   *  lens. Optional. */
  rep_cross_deal_focus?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// MEETING
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedMeeting {
  /** Stable ID across the substrate. Mapper-generated when source ID
   *  is provider-specific (e.g. a Google Calendar event ID). */
  id: string;

  /** Source-system reference, retained for write-back later. */
  source_ref: SourceRef;

  /** Title as it appears on the calendar. May be cryptic ("VRT/Kearney sync");
   *  the agent classifies meaning. */
  title: string;

  /** Optional description / agenda from the calendar event body. */
  description?: string;

  /** When the meeting is scheduled. */
  scheduled_at: string; // ISO8601

  /** Duration in minutes. */
  duration_minutes: number;

  /** How the meeting is being held. Resolved by mapper from calendar
   *  conferencing data. */
  medium: "video" | "phone" | "in_person" | "other";

  /** Direction. Resolved from organizer + attendee membership relative
   *  to the rep's organization. */
  direction: "outbound" | "inbound";

  /** Calendar attendees with response status. The agent uses this list
   *  to determine who is actually expected vs invited but unconfirmed. */
  attendees: MeetingAttendee[];

  /** ID of the rep this meeting belongs to. */
  internal_owner_id: string;
}

export interface MeetingAttendee {
  /** Stable ID resolving to a NormalizedStakeholder when one exists. */
  stakeholder_id?: string;

  /** Display name. Always present even if stakeholder_id is missing. */
  name: string;

  /** Email if known. */
  email?: string;

  /** Calendar response status. */
  response_status: "accepted" | "declined" | "tentative" | "no_response";

  /** Whether this attendee is on the selling org's side or the customer side. */
  party: "internal" | "external" | "unknown";

  /** Whether this attendee is the organizer of the event. Preserved from
   *  the source (Google Calendar's `attendee.organizer` flag). Useful for
   *  ownership resolution and influence inference in Pass 1.5. */
  is_organizer?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// ACCOUNT
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedAccount {
  id: string;
  source_ref: SourceRef;

  name: string;

  /** Industry as classified in source CRM. Mapper preserves source value
   *  rather than translating to a fixed taxonomy. */
  industry?: string;

  /** Free-form size descriptor. "420 employees, $85M ARR" or "Series B,
   *  ~140 employees" — whatever the substrate has assembled. Source-system
   *  numeric fields (employee_count, annual_revenue) feed this. */
  size_descriptor?: string;

  /** Headquarters location if known. */
  headquarters?: string;

  /** URL of the company's primary web presence. */
  website?: string;

  /** Strategic posture and macro priorities, as synthesized by the
   *  Intelligence agent from external sources. Free text. */
  strategic_priority?: string;

  /** Optional public signals about the company. Each signal is an
   *  observation with a source. */
  public_signals: PublicSignal[];
}

export interface PublicSignal {
  /** Short summary of the signal. Max ~200 chars. */
  summary: string;

  /** When this was observed. */
  observed_at: string; // ISO8601

  /** Where it came from. */
  source: ExternalSource;

  /** Source-specific reference for the original artifact. */
  source_ref?: SourceRef;
}

// ────────────────────────────────────────────────────────────────────────────
// OPPORTUNITY
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedOpportunity {
  id: string;
  source_ref: SourceRef;

  name: string;

  /** Stage label as the customer's CRM expresses it. Customers configure
   *  their own stage names; we preserve theirs rather than imposing ours. */
  stage_label: string;

  /** Optional ordering position within the customer's pipeline.
   *  Lets the agent reason about late-stage vs early-stage deals
   *  without parsing stage names. */
  stage_position?: number;

  /** Total number of stages in the customer's configured pipeline,
   *  if known. Used with stage_position to derive "60% through pipeline". */
  total_stages?: number;

  /** Annual contract value being pursued, in account currency. */
  amount?: number;

  /** Currency code. ISO 4217. */
  currency?: string;

  /** Target close date. */
  close_date?: string; // ISO8601

  /** Owner — typically the rep this artifact is being generated for. */
  owner_id: string;

  /** Last substantive activity timestamp. Drives staleness detection. */
  last_activity_at?: string; // ISO8601

  /** Free-text summary of last activity, when available. Synthesized by
   *  the Intelligence agent from the most recent transcript or email. */
  last_activity_summary?: string;

  /** Pass 2-promoted deal posture. Optional pre-enrichment. */
  deal_posture?: 'advancing' | 'stalled' | 'at_risk' | 'indeterminate';

  /** Methodology state — explicitly pluggable. MEDDPICC is the MVP default
   *  but the structure does not assume it. Other frameworks plug in via
   *  this same shape. */
  methodology: MethodologyState;
}

// ────────────────────────────────────────────────────────────────────────────
// METHODOLOGY (pluggable)
// ────────────────────────────────────────────────────────────────────────────

export interface MethodologyState {
  /** Which framework this customer uses. Drives interpretation of pillars
   *  by the agent and rendering by the UI. */
  methodology_type: "MEDDPICC" | "MEDDIC" | "BANT" | "CHALLENGER" | "SPICED" | "CUSTOM";

  /** Display posture. Lets the UI subordinate the methodology block on
   *  late-stage deals where the framework has served its purpose and only
   *  remaining gaps matter. */
  surface_mode: "full" | "gaps_only" | "reference";

  /** Overall normalized score 0-1 derived by the customer's configured
   *  pillar weighting. Optional; not all customers configure scoring. */
  score?: number;

  /** Pillars in display order. Mappers populate framework-specific keys
   *  and labels (MEDDPICC: "metrics" → "M · Metrics"; BANT: "budget" →
   *  "B · Budget"). The agent reasons over status + value + evidence;
   *  the UI renders label + status + value. */
  pillars: MethodologyPillar[];
}

export interface MethodologyPillar {
  /** Framework-specific key. Stable identifier; not displayed.
   *  Examples: "metrics", "economic_buyer" (MEDDPICC); "budget" (BANT);
   *  "situation", "pain", "impact" (SPICED). */
  key: string;

  /** Display label as the customer expects to see it.
   *  Example: "M · Metrics" or "Budget" or "Critical Event". */
  label: string;

  /** Current state of this pillar. Pass 3 may override to "conflicted"
   *  when Pass 2 surfaces evidence in tension on the pillar (e.g., champion
   *  asserts confirmed but EB email contradicts). */
  status: "confirmed" | "partial" | "unknown" | "not_applicable" | "conflicted";

  /** What's known. String for single-value pillars (champion name,
   *  economic buyer); string array for multi-value pillars (metrics,
   *  decision criteria, competition). */
  value?: string | string[];

  /** Source records that informed the current state. */
  evidence_ids?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// STAKEHOLDERS
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedStakeholder {
  id: string;
  source_ref?: SourceRef; // optional — some stakeholders are inferred from transcripts

  name: string;
  title?: string;
  email?: string;
  phone?: string;

  /** Which company they belong to. Customer-side stakeholders link to
   *  the deal account; internal stakeholders to the selling company. */
  company: string;
  party: "internal" | "external";

  /** LinkedIn URL if known. Used by Intelligence for enrichment. */
  linkedin_url?: string;

  /** Career history if enriched. */
  career_history?: CareerEvent[];

  /** Mutual connections with the rep's company. */
  mutual_connections?: MutualConnection[];

  /** Buying-committee role if known. Inferred by the Qualification agent
   *  from CRM custom fields, transcripts, and behavioral signals. */
  committee_role?:
    | "champion"
    | "economic_buyer"
    | "user"
    | "technical_buyer"
    | "decision_maker"
    | "influencer"
    | "skeptic"
    | "blocker"
    | "unknown";

  /** Disposition toward the deal, observed across recent touches. */
  disposition?:
    | "champion"
    | "supporter"
    | "neutral"
    | "skeptic"
    | "blocker"
    | "unknown";

  /** Engagement pattern across recent touches. */
  engagement_level?: "active" | "passive" | "silent" | "absent";

  /** Influence weighting — how much their opinion shapes the decision. */
  influence_level?: "high" | "medium" | "low";

  /** Activity IDs where this stakeholder appeared. Lets the agent
   *  back-reference what they've actually said or done. */
  activity_ids?: string[];

  /** Departure flag — for stakeholders no longer with the deal (left the
   *  company, role change, replaced). Their signal still matters. */
  is_departed?: boolean;

  /** Date this stakeholder was first seen on the deal. Combined with
   *  meeting attendance, lets the agent identify "new to this call". */
  first_seen_at?: string; // ISO8601
}

export interface CareerEvent {
  company: string;
  title: string;
  start_date?: string; // ISO8601 or "YYYY-MM"
  end_date?: string; // ISO8601 or "YYYY-MM" or undefined for current
}

export interface MutualConnection {
  /** Stakeholder on the rep's side or in the rep's customer base. */
  internal_stakeholder_id: string;
  internal_stakeholder_name: string;

  /** Nature of the connection. */
  connection_type: "former_colleague" | "alma_mater" | "industry_peer" | "shared_customer" | "other";

  /** Strength signal. */
  strength: "strong" | "moderate" | "weak";

  /** Notes — e.g. "worked together at Stripe 2019-2023". */
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// ACTIVITIES — the spine of touch history
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedActivity {
  id: string;
  source_ref: SourceRef;

  /** Type of activity. */
  type: "call" | "email" | "meeting" | "note" | "task" | "stage_change";

  /** When it occurred. */
  occurred_at: string; // ISO8601

  /** Short subject / title. */
  subject: string;

  /** One-line summary. Synthesized for transcripts; raw for notes. */
  summary?: string;

  /** Stakeholder IDs involved. */
  stakeholder_ids: string[];

  /** Email addresses of participants, when available from source. Used
   *  by the orchestrator to resolve stakeholder_ids after the canonical
   *  identity set is built — the primary path for historical Calendar
   *  meetings where attendees are known by email but may not yet be
   *  modeled as stakeholders at mapper time. */
  attendee_emails?: string[];

  /** For richer payload, pointers into calls / emails / etc. */
  call_id?: string;
  email_id?: string;

  /** Optional rep-authored note. */
  rep_note?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// CALLS — transcripts and metadata
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedCall {
  id: string;
  source_ref: SourceRef;

  /** Which call intelligence provider this came from. */
  provider: "gong" | "chorus" | "fireflies" | "google_meet" | "manual";

  /** Title from the source. */
  title: string;

  /** When the call occurred. */
  started_at: string; // ISO8601

  /** Duration in seconds. */
  duration_seconds: number;

  /** Direction relative to selling org. */
  direction: "outbound" | "inbound" | "internal";

  /** Participants on the call, by stakeholder ID. Populated during Pass 1.5
   *  orchestrator merge via party_emails resolution. Mappers alone may
   *  produce an empty array if no resolver was available at mapper time. */
  participant_stakeholder_ids: string[];

  /** Raw party emails from the call intelligence source. Used by the
   *  orchestrator to resolve participant_stakeholder_ids after the
   *  canonical identity set is built. Mappers MUST populate this field
   *  when email addresses are available on source parties. */
  party_emails: string[];

  /** Synthesized summary. For agent consumption — agents read this when
   *  they don't need full transcript depth. */
  summary?: string;

  /** Key extracted moments. Each is a quote tied to a speaker and timestamp. */
  key_moments: CallMoment[];

  /** Full transcript. Optional — included when needed for deep analysis,
   *  omitted when summary + key_moments suffice. */
  transcript?: TranscriptSegment[];

  /** Topics auto-tagged by the source. Names normalized across providers. */
  topics?: string[];

  /** Trackers that fired (Gong-specific concept; mapped to a generic
   *  trigger list for source neutrality). */
  triggers?: string[];
}

export interface CallMoment {
  /** Stakeholder who spoke. */
  speaker_stakeholder_id?: string;

  /** Display name fallback when speaker not resolved. */
  speaker_name?: string;

  /** What was said. Verbatim or near-verbatim. Max ~400 chars. */
  text: string;

  /** Where in the call this moment occurred. */
  timestamp_ms: number;

  /** Categorization. */
  category?: "pain" | "objection" | "commitment" | "competitor" | "stakeholder" | "next_step" | "other";
}

export interface TranscriptSegment {
  speaker_stakeholder_id?: string;
  speaker_name?: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

// ────────────────────────────────────────────────────────────────────────────
// EMAILS
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedEmail {
  id: string;
  source_ref: SourceRef;

  /** Which email provider this came from. */
  provider: "gmail" | "outlook" | "manual";

  /** Thread ID for grouping. */
  thread_id: string;

  /** Sender stakeholder ID if resolved. */
  from_stakeholder_id?: string;

  /** Sender name + email always present. */
  from_name: string;
  from_email: string;

  /** Recipients. Each links to a stakeholder when resolved. */
  to: EmailParticipant[];
  cc?: EmailParticipant[];

  /** Subject line. */
  subject: string;

  /** Short snippet for prep-input use. Full body available via source_ref
   *  if deep parsing is needed but typically not loaded into agent context. */
  snippet: string;

  /** Full body. Optional — included when the email is load-bearing for
   *  the deal (e.g., a champion private note). */
  body?: string;

  /** When the email was sent. */
  sent_at: string; // ISO8601

  /** Whether the email contains attachments (proposals, contracts, etc). */
  has_attachments: boolean;
}

export interface EmailParticipant {
  stakeholder_id?: string;
  name: string;
  email: string;
}

// ────────────────────────────────────────────────────────────────────────────
// EXTERNAL INTELLIGENCE
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedExternalSignal {
  id: string;

  /** Which external source this came from. */
  source: ExternalSource;

  /** Source-specific reference (URL, filing ID, profile ID). */
  source_ref?: SourceRef;

  /** What kind of signal. */
  kind:
    | "funding_event"
    | "earnings_disclosure"
    | "leadership_change"
    | "hiring_signal"
    | "press_mention"
    | "regulatory_filing"
    | "product_launch"
    | "partnership"
    | "person_profile"
    | "person_publication"
    | "other";

  /** Synthesized summary. Max ~200 chars. */
  summary: string;

  /** Optional verbatim quote from the source. */
  quote?: string;

  /** When the underlying event occurred (not when we observed it). */
  event_date?: string; // ISO8601

  /** When we observed / ingested this signal. */
  observed_at: string; // ISO8601

  /** Strength of this signal. */
  strength: "strong" | "moderate" | "weak";

  /** Which entities the signal is about. */
  about_account_id?: string;
  about_stakeholder_ids?: string[];
}

export type ExternalSource =
  | "linkedin"
  | "sec_edgar"
  | "crunchbase"
  | "news"
  | "company_blog"
  | "press_release"
  | "podcast"
  | "conference"
  | "other";

// ────────────────────────────────────────────────────────────────────────────
// COMMERCIAL STATE — late-stage only
// ────────────────────────────────────────────────────────────────────────────

export interface NormalizedCommercialState {
  /** Source of truth for commercial data — typically the CRM opportunity
   *  plus any quote / order documents. */
  source_ref?: SourceRef;

  /** List price. */
  list_price_annual?: number;

  /** Currency. */
  currency?: string;

  /** Current proposal on the table. */
  proposal: NormalizedProposal;

  /** What the customer has explicitly asked for. */
  customer_asks: NormalizedCustomerAsk[];

  /** Concessions made historically. */
  concessions_made: NormalizedConcession[];

  /** Approval limits configured by the selling org's deal desk. Mapper
   *  reads these from the rep's deal-desk policy or org config. */
  deal_desk_floors: DealDeskFloors;

  /** Current redline/legal status. Free text. */
  redline_status?: string;

  /** Open redline items. */
  open_redlines: string[];
}

export interface NormalizedProposal {
  price_annual: number;
  term_months: number;
  payment: "annual" | "quarterly" | "monthly" | "custom";
  discount_pct: number;

  /** Activity ID where this proposal was put forward. */
  proposed_in_activity_id?: string;

  /** Timestamp when this proposal was made. */
  proposed_at?: string; // ISO8601
}

export interface NormalizedCustomerAsk {
  category: "price" | "term" | "payment" | "scope" | "legal" | "other";
  description: string;

  /** How firmly the customer holds this ask. "hard" = stated as
   *  non-negotiable; "stated" = explicit but flexibility unclear;
   *  "soft" = preferred but not insisted on. Reflects the customer's
   *  posture, not the agent's confidence. */
  firmness: "hard" | "stated" | "soft";

  /** Agent's confidence that this ask was correctly extracted from
   *  source data. Distinct from firmness: a customer can softly state
   *  an ask the agent extracts with high confidence, or firmly state
   *  one the agent extracts with low confidence (ambiguous transcript). */
  agent_confidence: "high" | "medium" | "low";

  /** Evidence supporting this ask. */
  evidence_ids: string[];

  /** Activity / call where this ask was surfaced. */
  source_activity_id?: string;
}

export interface NormalizedConcession {
  description: string;
  conceded_at: string; // ISO8601
  conceded_by: "rep" | "deal_desk" | "manager";

  /** Agent's confidence in this concession extraction. */
  agent_confidence: "high" | "medium" | "low";

  /** Evidence supporting this concession. */
  evidence_ids: string[];

  source_activity_id?: string;
}

export interface DealDeskFloors {
  max_discount_pct: number;
  min_term_months: number;
  approved_payment_terms: Array<"annual" | "quarterly" | "monthly">;
}

// ────────────────────────────────────────────────────────────────────────────
// CONTEXT — generation metadata
// ────────────────────────────────────────────────────────────────────────────

export interface InputContext {
  /** When this input was assembled. */
  assembled_at: string; // ISO8601

  /** ID of the rep whose perspective this input represents. */
  rep_id: string;

  /** Selling organization ID. */
  selling_org_id: string;

  /** Methodology framework configured for this customer. The agent uses
   *  this to interpret MethodologyState. Always matches
   *  opportunity.methodology.methodology_type. */
  methodology_framework: "MEDDPICC" | "MEDDIC" | "BANT" | "CHALLENGER" | "SPICED" | "CUSTOM";

  /** Time horizon of source data. The agent uses this to reason about
   *  staleness — if last_activity is 60 days ago and ingestion is fresh,
   *  the deal is genuinely stalled. */
  data_freshness: {
    crm_synced_at?: string;
    calls_synced_at?: string;
    emails_synced_at?: string;
    external_intelligence_synced_at?: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SUPPORTING INTELLIGENCE — observation records produced by Pass 2
// ────────────────────────────────────────────────────────────────────────────

/**
 * SupportingIntelligence records are produced by the Pass 2 Core Intelligence
 * agent. Each record is an observation about the deal — a stakeholder
 * statement, a CRM field value, an external signal — captured with its
 * source and strength. Other parts of the system reference these records
 * by ID via evidence_ids fields (methodology pillars, customer_asks,
 * stakeholder claims, etc).
 */
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

  source_ref?: SourceRef;

  /** Deep-link target. Lets the UI jump from an evidence reference
   *  straight to the source moment (transcript timestamp, email body,
   *  CRM activity record). Enables "why did the agent say this?"
   *  to be answerable in one click. Without source_span, evidence is
   *  descriptive; with it, evidence is traceable.
   *
   *  At least one of call_id / email_id / activity_id should be present
   *  when source_channel is call / email / crm respectively. start_ms
   *  and end_ms are populated for call transcripts only. */
  source_span?: {
    call_id?: string;
    email_id?: string;
    activity_id?: string;
    start_ms?: number;
    end_ms?: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SHARED — source reference
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pointer back to the original source-system record. Lets us write back
 * later, fetch fresh detail, or render "view in Salesforce" links in the UI.
 *
 * Source-specific fields (Salesforce SObject API name, HubSpot object_type)
 * are encoded as opaque strings here — the agent doesn't parse them, but
 * mappers can populate and downstream code can use them.
 */
export interface SourceRef {
  /** Which integrated system this came from. */
  system:
    | "salesforce"
    | "hubspot"
    | "gong"
    | "chorus"
    | "fireflies"
    | "google_meet"
    | "gmail"
    | "outlook"
    | "google_calendar"
    | "outlook_calendar"
    | "linkedin"
    | "sec_edgar"
    | "crunchbase"
    | "news"
    | "internal"
    | "manual";

  /** Source-system primary ID. */
  external_id: string;

  /** Source-specific object type when relevant (e.g. "Account",
   *  "Opportunity", "Deal", "Email"). Opaque to the agent. */
  object_type?: string;

  /** Optional URL for direct access. */
  url?: string;

  /** When this record was last fetched from source. */
  fetched_at?: string; // ISO8601
}
