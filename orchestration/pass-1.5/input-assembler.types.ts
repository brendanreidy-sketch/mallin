/**
 * Pass 1.5 Orchestrator — Type definitions
 *
 * Shapes for input/output of assembleCoreIntelligenceInput().
 *
 * Per spec: this file holds the orchestrator's contract surface.
 * The orchestrator does input assembly only — no LLM calls, no inference.
 */

// ────────────────────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────────────────────

/**
 * Required parameters for assembleCoreIntelligenceInput().
 */
export interface AssemblyParams {
  /** UUID of the tenant scope. All queries are tenant-isolated. */
  tenant_id: string;

  /** UUID of the opportunity being prepped. */
  opportunity_id: string;

  /**
   * Anchor time for the lookback window. Defaults to NOW() if omitted.
   * Pass an explicit value for replay scenarios (assemble input as it
   * would have appeared at a historical moment).
   */
  prep_time?: Date;
}

/**
 * Optional configuration overrides. All fields have sensible defaults.
 */
export interface AssemblyConfig {
  /**
   * Days of activity history to include from the prep_time anchor.
   * Default: 90.
   */
  lookback_days: number;

  /**
   * Maximum number of activities included in the assembled input.
   * Default: 50. When exceeded, most-recent activities win and
   * diagnostics flag activities_capped: true.
   */
  max_activities: number;

  /**
   * If true, future-scheduled meetings (scheduled_at > NOW()) for this
   * opportunity are included even if no activity references them yet.
   * Default: true.
   */
  include_future_meetings: boolean;

  /**
   * If true, account-level public_signals and external_signals are
   * included in the assembled input. Default: true.
   */
  include_account_signals: boolean;

  /**
   * If true, populate the diagnostics.data_freshness summary by
   * inspecting source_fetched_at across activity sources.
   * Default: true.
   */
  freshness_metadata: boolean;

  /**
   * Optional upper bound (ISO 8601) on activity.occurred_at. When set,
   * activities that occurred AFTER this timestamp are excluded from the
   * assembled input — i.e. assemble the substrate "as of" this moment.
   *
   * Used by temporal-replay / drift-validation experiments to regenerate
   * an artifact from only the calls/emails/meetings that existed at a past
   * cutoff. NOT part of DEFAULT_ASSEMBLY_CONFIG: when omitted, no upper
   * bound is applied and production behavior is byte-for-byte unchanged.
   */
  max_occurred_at?: string | null;
}

export const DEFAULT_ASSEMBLY_CONFIG: AssemblyConfig = {
  lookback_days: 90,
  max_activities: 50,
  include_future_meetings: true,
  include_account_signals: true,
  freshness_metadata: true,
};

// ────────────────────────────────────────────────────────────────────────────
// Output
// ────────────────────────────────────────────────────────────────────────────

/**
 * Result of assembleCoreIntelligenceInput().
 *
 * `input` is the canonical ExecutionAgentInput consumed by Pass 2.
 * `diagnostics` is the orchestrator's audit trail — not passed to Pass 2,
 * but logged for observability and may be persisted to the events table.
 */
export interface AssemblyResult {
  input: CoreIntelligenceInput;
  diagnostics: AssemblyDiagnostics;
}

/**
 * Subset of the full ExecutionAgentInput that this initial implementation
 * produces. Stakeholders, calls/emails/meetings hydration, signals, and
 * freshness metadata land in subsequent implementation passes.
 *
 * For now: opportunity, account, activities. Sufficient to validate the
 * core merge logic against fixtures.
 */
export interface CoreIntelligenceInput {
  opportunity: AssembledOpportunity;
  account: AssembledAccount;
  activities: AssembledActivity[];
  commercial_state?: AssembledCommercialState;
  stakeholders: AssembledStakeholder[];

  /** Internal team members (BDR, AE, SE, CSM, etc.) who participated
   *  in deal activities. Not part of customer-side qualification —
   *  Pass 2 ignores this field. Preserved for future passes that
   *  surface internal motion (Pass 4 talk track, handoff prep,
   *  capacity analytics, etc.). All `party === "internal"` records
   *  from the merge step land here; everyone else lands in
   *  `stakeholders`. */
  internal_participants: AssembledStakeholder[];
  calls: AssembledCall[];
  emails: AssembledEmail[];
  meetings: AssembledMeeting[];
}

/**
 * Opportunity row + methodology pillars + commercial state (when present).
 * Mirrors a slim subset of NormalizedOpportunity from the contract.
 */
export interface AssembledOpportunity {
  id: string;
  name: string;
  stage_label: string;
  stage_position: number | null;
  total_stages: number | null;
  amount: number | null;
  currency: string | null;
  close_date: string | null;
  owner_id: string;
  methodology_type: string;
  methodology_surface_mode: string;
  last_activity_at: string | null;
  deal_posture: string | null;
  methodology: AssembledMethodologyState;
}

/**
 * Account row. Mirrors a slim subset of NormalizedAccount.
 */
export interface AssembledAccount {
  id: string;
  name: string;
  industry: string | null;
  size_descriptor: string | null;
  headquarters: string | null;
  website: string | null;
  strategic_priority: string | null;
  owner_id: string | null;
}

/**
 * Activity row with anchor type tagged so Pass 2 (and diagnostics) can
 * distinguish opportunity-anchored vs account-anchored activities.
 */
export interface AssembledActivity {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  type: ActivityType;
  occurred_at: string;
  subject: string;
  summary: string | null;
  rep_note: string | null;
  call_id: string | null;
  email_id: string | null;
  meeting_id: string | null;
  attendee_emails: string[];
  source_system: string;
  source_external_id: string;
  anchor_type: ActivityAnchorType;
}

export type ActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'task'
  | 'stage_change';

export type ActivityAnchorType = 'opportunity_anchored' | 'account_anchored';

// ────────────────────────────────────────────────────────────────────────────
// Diagnostics
// ────────────────────────────────────────────────────────────────────────────

export interface AssemblyDiagnostics {
  prep_time: string;
  lookback_window_start: string;
  total_activities_found: number;
  total_activities_included: number;
  activities_capped: boolean;
  account_level_activities_included: number;
  opportunity_level_activities_included: number;
  hydration: {
    calls_requested: number;
    calls_returned: number;
    emails_requested: number;
    emails_returned: number;
    meetings_requested: number;
    meetings_returned: number;
    meeting_attendees_returned: number;
    missing_payload_ids: { calls: string[]; emails: string[]; meetings: string[]; };
  };
  warnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the requested opportunity_id doesn't exist in the tenant
 * scope. Caller should treat as a hard failure — don't construct partial
 * input.
 */
export class OpportunityNotFoundError extends Error {
  constructor(tenant_id: string, opportunity_id: string) {
    super(
      `Opportunity ${opportunity_id} not found in tenant ${tenant_id}`
    );
    this.name = 'OpportunityNotFoundError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Methodology (added in Pass 1.5 v0.2 — pillars query)
// ────────────────────────────────────────────────────────────────────────────

export interface AssembledMethodologyState {
  type: string;
  surface_mode: string;
  pillars: AssembledMethodologyPillar[];
}

export interface AssembledMethodologyPillar {
  pillar_key: string;
  label: string;
  display_order: number;
  status: 'confirmed' | 'partial' | 'unknown' | 'not_applicable';
  value_text: string | null;
  value_array: string[] | null;
  evidence_ids: string[];
  consumed_intelligence_version: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Commercial state (added in Pass 1.5 v0.3 — late-stage deals only)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Commercial state for late-stage opportunities. Optional on CoreIntelligenceInput
 * because early-stage deals have no commercial_state row.
 *
 * Mirrors a slim subset of NormalizedCommercialState. Children
 * (customer_asks, concessions, open_redlines) are flattened into the
 * parent shape for Pass 2 consumption.
 */
export interface AssembledCommercialState {
  // Top-level pricing
  list_price_annual: number | null;
  currency: string | null;

  // Current proposal (flattened from NormalizedProposal in schema)
  proposal_price_annual: number | null;
  proposal_term_months: number | null;
  proposal_payment: 'annual' | 'quarterly' | 'monthly' | 'custom' | null;
  proposal_discount_pct: number | null;
  proposal_proposed_at: string | null;

  // Deal-desk floors (rep can't go below these without escalation)
  deal_desk_max_discount_pct: number;
  deal_desk_min_term_months: number;
  deal_desk_approved_payment_terms: string[];

  // Status
  redline_status: string | null;

  // Children
  customer_asks: AssembledCustomerAsk[];
  concessions: AssembledConcession[];
  open_redlines: string[];
}

export interface AssembledCustomerAsk {
  category: 'price' | 'term' | 'payment' | 'scope' | 'legal' | 'other';
  description: string;
  firmness: 'hard' | 'stated' | 'soft';
  agent_confidence: 'high' | 'medium' | 'low';
}

export interface AssembledConcession {
  description: string;
  conceded_at: string;
  conceded_by: 'rep' | 'deal_desk' | 'manager';
  agent_confidence: 'high' | 'medium' | 'low';
}

// ────────────────────────────────────────────────────────────────────────────
// Stakeholders (added in Pass 1.5 v0.4 — deal-level + account-level merge)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Stakeholder with both identity-level and deal-level context.
 *
 * source = 'on_deal'       — explicitly on deal_stakeholders for this opp;
 *                            deal-level fields (disposition, engagement,
 *                            influence) are populated.
 * source = 'account_only'  — exists on the account but NOT on this deal;
 *                            deal-level fields are null. Pass 2 may decide
 *                            to surface as a "potentially relevant"
 *                            stakeholder. Orchestrator does NOT auto-promote.
 */
export interface AssembledStakeholder {
  // Identity
  id: string;
  account_id: string | null;
  name: string;
  email: string | null;
  title: string | null;
  company: string;
  party: 'internal' | 'external';
  committee_role:
    | 'champion'
    | 'economic_buyer'
    | 'user'
    | 'technical_buyer'
    | 'decision_maker'
    | 'influencer'
    | 'skeptic'
    | 'blocker'
    | 'unknown'
    | null;

  // Tenure signals
  tenure_at_current_firm_months: number | null;
  tenure_signal_category:
    | 'new'
    | 'established'
    | 'veteran'
    | 'long_tenured'
    | null;

  // LinkedIn
  linkedin_url: string | null;
  linkedin_data_freshness: 'fresh' | 'stale' | 'unknown' | null;

  // Conversational confirmation (set by Patch #9 trigger)
  last_conversational_confirmation_at: string | null;

  // Firm-level departure
  is_departed: boolean;

  // Per-deal context (populated only when source='on_deal')
  deal_disposition:
    | 'champion'
    | 'supporter'
    | 'neutral'
    | 'skeptic'
    | 'blocker'
    | 'unknown'
    | null;
  deal_engagement_level: 'active' | 'passive' | 'silent' | 'absent' | null;
  deal_influence_level: 'high' | 'medium' | 'low' | null;
  is_departed_from_deal: boolean | null;

  // Source tag — whether the row was found on the deal or just on the account
  source: StakeholderSource;

  // Discovery provenance — HOW Mallin learned this person exists.
  // Distinct from `source` (which is on-deal vs account-only) and from
  // `source_system` (the upstream CRM record's origin). Populated for
  // any participant that came in via transcript extraction; null for
  // legacy CRM-imported rows.
  discovery_source:
    | 'crm'
    | 'transcript'
    | 'manual'
    | 'calendar'
    | 'email'
    | null;
  discovery_confidence: 'high' | 'medium' | 'low' | null;
  discovery_reasoning: string | null;
  first_seen_at: string | null;
  first_seen_call_id: string | null;
}

export type StakeholderSource = 'on_deal' | 'account_only';

// ────────────────────────────────────────────────────────────────────────────
// Payload hydration (added in Pass 1.5 v0.5)
//
// IMPORTANT: All four types use loosely-typed JSONB fields (transcript,
// key_moments, to_recipients, cc_recipients) as `unknown`. Pass 2 reads
// these as opaque blobs — it doesn't query into them at the DB level.
// Application code that needs structured access should narrow at the
// consumption point.
// ────────────────────────────────────────────────────────────────────────────

export interface AssembledCall {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  provider: 'gong' | 'chorus' | 'fireflies' | 'google_meet' | 'manual';
  title: string;
  started_at: string;
  duration_seconds: number;
  direction: 'outbound' | 'inbound' | 'internal';
  party_emails: string[];
  summary: string | null;
  // JSONB blob — opaque to orchestrator, consumed by Pass 2
  key_moments: unknown[];
  // JSONB blob — large payload risk (full transcript). Pass 2 reads as opaque.
  transcript: unknown | null;
  topics: string[];
  triggers: string[];
}

export interface AssembledEmail {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  provider: 'gmail' | 'outlook' | 'manual';
  thread_id: string;
  from_stakeholder_id: string | null;
  from_name: string;
  from_email: string;
  // JSONB array — opaque shape per EmailParticipant in contract
  to_recipients: unknown;
  cc_recipients: unknown;
  subject: string;
  snippet: string;
  // Large payload risk (full email body). Pass 2 reads as opaque.
  body: string | null;
  sent_at: string;
  has_attachments: boolean;
}

export interface AssembledMeeting {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  medium: 'video' | 'phone' | 'in_person' | 'other';
  direction: 'outbound' | 'inbound';
  internal_owner_id: string;
  attendees: AssembledMeetingAttendee[];
}

export interface AssembledMeetingAttendee {
  stakeholder_id: string | null;
  name: string;
  email: string | null;
  response_status: 'accepted' | 'declined' | 'tentative' | 'no_response';
  party: 'internal' | 'external' | 'unknown';
  is_organizer: boolean;
}
