/**
 * Pass 1.5 Orchestrator — Input Assembler
 *
 * Reads from Supabase, produces the input that Pass 2 (Core Intelligence)
 * consumes. Pure data assembly — no LLM calls, no inference.
 *
 * Implementation status:
 *   ✅ Opportunity + account resolution
 *   ✅ Methodology pillars
 *   ✅ Commercial state (conditional inclusion)
 *   ✅ Stakeholders (deal-level + account-level merge)
 *   ✅ Activity merge (opportunity-anchored UNION account-anchored)
 *   ✅ Payload hydration (added in v0.5 — calls, emails, meetings, attendees)
 *
 * Subsequent implementation passes will add:
 *   - Future-meeting inclusion (config.include_future_meetings honoring)
 *   - Account-level signals (public_signals, external_signals)
 *   - Data freshness metadata
 */

import { supabaseAdmin } from '@/lib/db/client';
import {
  type AssemblyParams,
  type AssemblyConfig,
  type AssemblyResult,
  type CoreIntelligenceInput,
  type AssembledOpportunity,
  type AssembledAccount,
  type AssembledActivity,
  type AssembledMethodologyState,
  type AssembledMethodologyPillar,
  type AssembledCommercialState,
  type AssembledCustomerAsk,
  type AssembledConcession,
  type AssembledStakeholder,
  type StakeholderSource,
  type AssembledCall,
  type AssembledEmail,
  type AssembledMeeting,
  type AssembledMeetingAttendee,
  type ActivityAnchorType,
  type ActivityType,
  DEFAULT_ASSEMBLY_CONFIG,
  OpportunityNotFoundError,
} from './input-assembler.types';

// ────────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ────────────────────────────────────────────────────────────────────────────

export async function assembleCoreIntelligenceInput(
  params: AssemblyParams,
  config: Partial<AssemblyConfig> = {}
): Promise<AssemblyResult> {
  const cfg: AssemblyConfig = { ...DEFAULT_ASSEMBLY_CONFIG, ...config };
  const prepTime = params.prep_time ?? new Date();
  const windowStart = new Date(
    prepTime.getTime() - cfg.lookback_days * 24 * 60 * 60 * 1000
  );
  const warnings: string[] = [];

  const { opportunity, account } = await resolveOpportunityAndAccount(
    params.tenant_id,
    params.opportunity_id
  );

  const methodology = await fetchMethodologyPillars(
    params.tenant_id,
    params.opportunity_id,
    opportunity.methodology_type,
    opportunity.methodology_surface_mode
  );
  opportunity.methodology = methodology;

  const commercialState = await fetchCommercialState(
    params.tenant_id,
    params.opportunity_id
  );

  const stakeholders = await mergeStakeholders(
    params.tenant_id,
    params.opportunity_id,
    account.id
  );

  // ── Temporal-replay leak guard (Design Rule #2) ───────────────────
  // ONLY runs when max_occurred_at is set (drift-validation / replay).
  // The activities cutoff makes calls/emails time-honest, but two paths
  // bypass it and leak the deal's FUTURE into a past slice:
  //   (1) opportunity.{stage_label, stage_position, deal_posture,
  //       last_activity_at} carry FINAL CRM state (e.g. "Closed-Won");
  //   (2) stakeholder.{last_conversational_confirmation_at, first_seen_at}
  //       carry confirmation/discovery timestamps AFTER the cutoff.
  // Left intact, both endpoints of an A/B converge on the ending — which
  // SUPPRESSES real drift AND MANUFACTURES false canonical-axis flips.
  // NO-OP in production: when max_occurred_at is unset these never run,
  // so live behavior is byte-for-byte unchanged.
  if (cfg.max_occurred_at) {
    neutralizeOpportunityForReplay(opportunity, cfg.max_occurred_at, warnings);
    neutralizeStakeholdersForReplay(stakeholders, cfg.max_occurred_at, warnings);
  }

  const activitiesResult = await mergeActivities(
    params.tenant_id,
    params.opportunity_id,
    account.id,
    windowStart,
    cfg.max_activities,
    cfg.max_occurred_at ?? null
  );

  const hydration = await hydrateActivityPayloads(
    params.tenant_id,
    activitiesResult.activities
  );

  if (activitiesResult.capped) {
    warnings.push(
      `Activity volume exceeded cap (${cfg.max_activities}); only most-recent included`
    );
  }
  if (activitiesResult.activities.length === 0) {
    warnings.push(
      `No activities found in lookback window (${cfg.lookback_days} days from prep_time)`
    );
  }
  if (methodology.pillars.length === 0) {
    warnings.push('No methodology pillars defined for opportunity');
  }
  // Partition: customer-side stakeholders for qualification reasoning
  // (Pass 2 input), and internal participants preserved for future passes.
  // Filter at the substrate boundary so Pass 2 never has to re-reason
  // about whether someone belongs in the qualification surface.
  //
  // BACKLOG: this is a coarse 'internal vs external' partition. Real
  // tenant ROE (BDR-deal-team-through-stage-N, SE-as-deal-team, etc.)
  // belongs in Pass 4 as a policy layer over internal_participants,
  // not in this filter. See BACKLOG.md - 'Rules of Engagement (ROE)'.
  const externalStakeholders = stakeholders.filter((s) => s.party !== 'internal');
  const internalFromStakeholders = stakeholders.filter((s) => s.party === 'internal');
  // Internal participants also live in a dedicated `internal_participants`
  // table (separate from `stakeholders`). Merge both sources so Pass 2 sees
  // the full rep-side team — needed for the model to ground references to
  // "the VP" / "Brendan" / "deal desk" / "Gianna" against real org context.
  const internalFromTable = await fetchInternalParticipants(
    params.tenant_id,
    params.opportunity_id,
    account.id
  );
  const internalParticipants = mergeInternalParticipants(
    internalFromStakeholders,
    internalFromTable
  );

  if (externalStakeholders.length === 0) {
    warnings.push('No external stakeholders found on deal or account');
  }

  const totalMissing =
    hydration.missing_payload_ids.calls.length +
    hydration.missing_payload_ids.emails.length +
    hydration.missing_payload_ids.meetings.length;
  if (totalMissing > 0) {
    warnings.push(
      `${totalMissing} payload references could not be hydrated (see diagnostics)`
    );
  }

  const input: CoreIntelligenceInput = {
    opportunity,
    account,
    activities: activitiesResult.activities,
    stakeholders: externalStakeholders,
    internal_participants: internalParticipants,
    calls: hydration.calls,
    emails: hydration.emails,
    meetings: hydration.meetings,
  };

  if (commercialState) {
    input.commercial_state = commercialState;
  }

  return {
    input,
    diagnostics: {
      prep_time: prepTime.toISOString(),
      lookback_window_start: windowStart.toISOString(),
      total_activities_found: activitiesResult.totalFound,
      total_activities_included: activitiesResult.activities.length,
      activities_capped: activitiesResult.capped,
      account_level_activities_included: activitiesResult.activities.filter(
        (a) => a.anchor_type === 'account_anchored'
      ).length,
      opportunity_level_activities_included: activitiesResult.activities.filter(
        (a) => a.anchor_type === 'opportunity_anchored'
      ).length,
      hydration: {
        calls_requested: hydration.callsRequested,
        calls_returned: hydration.calls.length,
        emails_requested: hydration.emailsRequested,
        emails_returned: hydration.emails.length,
        meetings_requested: hydration.meetingsRequested,
        meetings_returned: hydration.meetings.length,
        meeting_attendees_returned: hydration.attendeesReturned,
        missing_payload_ids: hydration.missing_payload_ids,
      },
      warnings,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Temporal-replay leak guard helpers (Design Rule #2) — replay-only.
//
// ISO-8601 strings compare lexicographically iff same format; the cutoff is
// produced via Date.toISOString() and stored dates are ISO, so `> cutoffIso`
// is a correct "strictly after the slice" test. A date-only value
// ("2025-07-30") that is a prefix of the cutoff ("2025-07-30T17:00:01Z")
// sorts BEFORE it → correctly treated as on-or-before the cutoff (kept).
// ────────────────────────────────────────────────────────────────────────────

/** Strip opportunity fields that encode FINAL CRM state. Mutates in place.
 *  stage_label → "" (no fabricated stage; the model infers from calls),
 *  stage_position/deal_posture → null (both are valid "early-stage" values
 *  the assembler already emits; Pass 2 re-mints deal_posture from substrate,
 *  and Pass 3 overwrites input.opportunity.deal_posture before Pass 4 sees it),
 *  last_activity_at → the slice cutoff (honest "last activity as of T"). */
function neutralizeOpportunityForReplay(
  opp: AssembledOpportunity,
  cutoffIso: string,
  warnings: string[]
): void {
  if (opp.stage_label || opp.deal_posture) {
    warnings.push(
      `[replay] neutralized opportunity final-state (stage_label="${opp.stage_label}", deal_posture="${opp.deal_posture ?? 'null'}") — would leak the deal's ending into an as-of slice`
    );
  }
  opp.stage_label = '';
  opp.stage_position = null;
  opp.deal_posture = null;
  opp.last_activity_at = cutoffIso;
}

/** Null any stakeholder confirmation / first-seen timestamp that falls
 *  strictly AFTER the cutoff (the stakeholder hadn't been confirmed / wasn't
 *  yet discovered at slice time). Mutates in place. Boolean departure flags
 *  (is_departed / is_departed_from_deal) are NOT time-resolvable here and are
 *  left as a known residual — out of scope per the tight-scope directive. */
function neutralizeStakeholdersForReplay(
  stakeholders: AssembledStakeholder[],
  cutoffIso: string,
  warnings: string[]
): void {
  let touched = 0;
  for (const s of stakeholders) {
    if (
      s.last_conversational_confirmation_at &&
      s.last_conversational_confirmation_at > cutoffIso
    ) {
      s.last_conversational_confirmation_at = null;
      touched++;
    }
    if (s.first_seen_at && s.first_seen_at > cutoffIso) {
      s.first_seen_at = null;
      s.first_seen_call_id = null;
      touched++;
    }
  }
  if (touched > 0) {
    warnings.push(
      `[replay] nulled ${touched} future-dated stakeholder confirmation/first-seen field(s) after ${cutoffIso}`
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1: resolve opportunity + account
// ────────────────────────────────────────────────────────────────────────────

async function resolveOpportunityAndAccount(
  tenant_id: string,
  opportunity_id: string
): Promise<{ opportunity: AssembledOpportunity; account: AssembledAccount }> {
  const { data, error } = await supabaseAdmin
    .from('opportunities')
    .select(
      `
      id, name, stage_label, stage_position, total_stages,
      amount, currency, close_date, owner_id,
      methodology_type, methodology_surface_mode,
      last_activity_at, deal_posture,
      account:accounts!inner (
        id, name, industry, size_descriptor,
        headquarters, website, strategic_priority, owner_id
      )
    `
    )
    .eq('id', opportunity_id)
    .eq('tenant_id', tenant_id)
    .single();

  if (error || !data) {
    throw new OpportunityNotFoundError(tenant_id, opportunity_id);
  }

  const accountRaw = Array.isArray(data.account) ? data.account[0] : data.account;
  if (!accountRaw) {
    throw new OpportunityNotFoundError(tenant_id, opportunity_id);
  }

  const opportunity: AssembledOpportunity = {
    id: data.id,
    name: data.name,
    stage_label: data.stage_label,
    stage_position: data.stage_position,
    total_stages: data.total_stages,
    amount: data.amount,
    currency: data.currency,
    close_date: data.close_date,
    owner_id: data.owner_id,
    methodology_type: data.methodology_type,
    methodology_surface_mode: data.methodology_surface_mode,
    last_activity_at: data.last_activity_at,
    deal_posture: data.deal_posture,
    methodology: {
      type: data.methodology_type,
      surface_mode: data.methodology_surface_mode,
      pillars: [],
    },
  };

  const account: AssembledAccount = {
    id: accountRaw.id,
    name: accountRaw.name,
    industry: accountRaw.industry,
    size_descriptor: accountRaw.size_descriptor,
    headquarters: accountRaw.headquarters,
    website: accountRaw.website,
    strategic_priority: accountRaw.strategic_priority,
    owner_id: accountRaw.owner_id,
  };

  return { opportunity, account };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: methodology pillars
// ────────────────────────────────────────────────────────────────────────────

async function fetchMethodologyPillars(
  tenant_id: string,
  opportunity_id: string,
  methodology_type: string,
  surface_mode: string
): Promise<AssembledMethodologyState> {
  const { data, error } = await supabaseAdmin
    .from('methodology_pillars')
    .select(
      `
      pillar_key, label, display_order, status,
      value_text, value_array, evidence_ids,
      consumed_intelligence_version
    `
    )
    .eq('tenant_id', tenant_id)
    .eq('opportunity_id', opportunity_id)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch methodology pillars: ${error.message}`);
  }

  const pillars: AssembledMethodologyPillar[] = (data ?? []).map((row) => ({
    pillar_key: row.pillar_key,
    label: row.label,
    display_order: row.display_order,
    status: row.status as AssembledMethodologyPillar['status'],
    value_text: row.value_text,
    value_array: row.value_array,
    evidence_ids: row.evidence_ids ?? [],
    consumed_intelligence_version: row.consumed_intelligence_version,
  }));

  return { type: methodology_type, surface_mode, pillars };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: commercial state (conditional)
// ────────────────────────────────────────────────────────────────────────────

async function fetchCommercialState(
  tenant_id: string,
  opportunity_id: string
): Promise<AssembledCommercialState | null> {
  const { data: stateRow, error: stateError } = await supabaseAdmin
    .from('commercial_state')
    .select(
      `
      id,
      list_price_annual, currency,
      proposal_price_annual, proposal_term_months, proposal_payment,
      proposal_discount_pct, proposal_proposed_at,
      deal_desk_max_discount_pct, deal_desk_min_term_months,
      deal_desk_approved_payment_terms,
      redline_status
    `
    )
    .eq('tenant_id', tenant_id)
    .eq('opportunity_id', opportunity_id)
    .maybeSingle();

  if (stateError) {
    throw new Error(`Failed to fetch commercial_state: ${stateError.message}`);
  }
  if (!stateRow) {
    return null;
  }

  const { data: asksRows, error: asksError } = await supabaseAdmin
    .from('commercial_state_customer_asks')
    .select('category, description, firmness, agent_confidence')
    .eq('tenant_id', tenant_id)
    .eq('commercial_state_id', stateRow.id);

  if (asksError) {
    throw new Error(`Failed to fetch customer_asks: ${asksError.message}`);
  }

  const { data: concessionsRows, error: concessionsError } = await supabaseAdmin
    .from('commercial_state_concessions')
    .select('description, conceded_at, conceded_by, agent_confidence')
    .eq('tenant_id', tenant_id)
    .eq('commercial_state_id', stateRow.id)
    .order('conceded_at', { ascending: false });

  if (concessionsError) {
    throw new Error(`Failed to fetch concessions: ${concessionsError.message}`);
  }

  const { data: redlinesRows, error: redlinesError } = await supabaseAdmin
    .from('commercial_state_open_redlines')
    .select('description')
    .eq('tenant_id', tenant_id)
    .eq('commercial_state_id', stateRow.id)
    .is('resolved_at', null);

  if (redlinesError) {
    throw new Error(`Failed to fetch open_redlines: ${redlinesError.message}`);
  }

  const customer_asks: AssembledCustomerAsk[] = (asksRows ?? []).map((r) => ({
    category: r.category as AssembledCustomerAsk['category'],
    description: r.description,
    firmness: r.firmness as AssembledCustomerAsk['firmness'],
    agent_confidence: r.agent_confidence as AssembledCustomerAsk['agent_confidence'],
  }));

  const concessions: AssembledConcession[] = (concessionsRows ?? []).map((r) => ({
    description: r.description,
    conceded_at: r.conceded_at,
    conceded_by: r.conceded_by as AssembledConcession['conceded_by'],
    agent_confidence: r.agent_confidence as AssembledConcession['agent_confidence'],
  }));

  const open_redlines: string[] = (redlinesRows ?? []).map((r) => r.description);

  return {
    list_price_annual: stateRow.list_price_annual,
    currency: stateRow.currency,
    proposal_price_annual: stateRow.proposal_price_annual,
    proposal_term_months: stateRow.proposal_term_months,
    proposal_payment: stateRow.proposal_payment as AssembledCommercialState['proposal_payment'],
    proposal_discount_pct: stateRow.proposal_discount_pct,
    proposal_proposed_at: stateRow.proposal_proposed_at,
    deal_desk_max_discount_pct: stateRow.deal_desk_max_discount_pct,
    deal_desk_min_term_months: stateRow.deal_desk_min_term_months,
    deal_desk_approved_payment_terms: stateRow.deal_desk_approved_payment_terms ?? [],
    redline_status: stateRow.redline_status,
    customer_asks,
    concessions,
    open_redlines,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: merge stakeholders
// ────────────────────────────────────────────────────────────────────────────

async function mergeStakeholders(
  tenant_id: string,
  opportunity_id: string,
  account_id: string
): Promise<AssembledStakeholder[]> {
  const { data: onDealRows, error: onDealError } = await supabaseAdmin
    .from('deal_stakeholders')
    .select(
      `
      disposition, engagement_level, influence_level, is_departed_from_deal,
      stakeholder:stakeholders!inner (
        id, account_id, name, email, title, company, party,
        committee_role,
        tenure_at_current_firm_months, tenure_signal_category,
        linkedin_url, linkedin_data_freshness,
        last_conversational_confirmation_at,
        is_departed,
        discovery_source, discovery_confidence, discovery_reasoning,
        first_seen_at, first_seen_call_id
      )
    `
    )
    .eq('tenant_id', tenant_id)
    .eq('opportunity_id', opportunity_id);

  if (onDealError) {
    throw new Error(`Failed to fetch on-deal stakeholders: ${onDealError.message}`);
  }

  const onDealIds = new Set<string>();
  for (const row of onDealRows ?? []) {
    const sthRaw = Array.isArray(row.stakeholder) ? row.stakeholder[0] : row.stakeholder;
    if (sthRaw?.id) onDealIds.add(sthRaw.id);
  }

  const { data: accountRows, error: accountError } = await supabaseAdmin
    .from('stakeholders')
    .select(
      `
      id, account_id, name, email, title, company, party,
      committee_role,
      tenure_at_current_firm_months, tenure_signal_category,
      linkedin_url, linkedin_data_freshness,
      last_conversational_confirmation_at,
      is_departed,
      discovery_source, discovery_confidence, discovery_reasoning,
      first_seen_at, first_seen_call_id
    `
    )
    .eq('tenant_id', tenant_id)
    .eq('account_id', account_id);

  if (accountError) {
    throw new Error(`Failed to fetch account-level stakeholders: ${accountError.message}`);
  }

  const result: AssembledStakeholder[] = [];
  const seen = new Set<string>();

  for (const row of onDealRows ?? []) {
    const sthRaw = Array.isArray(row.stakeholder) ? row.stakeholder[0] : row.stakeholder;
    if (!sthRaw || seen.has(sthRaw.id)) continue;
    seen.add(sthRaw.id);
    result.push(toAssembledStakeholder(sthRaw, 'on_deal', {
      disposition: row.disposition,
      engagement_level: row.engagement_level,
      influence_level: row.influence_level,
      is_departed_from_deal: row.is_departed_from_deal,
    }));
  }

  for (const sthRaw of accountRows ?? []) {
    if (seen.has(sthRaw.id)) continue;
    if (onDealIds.has(sthRaw.id)) continue;
    seen.add(sthRaw.id);
    result.push(toAssembledStakeholder(sthRaw, 'account_only', null));
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4b: fetch internal participants (rep-side team)
// ────────────────────────────────────────────────────────────────────────────
//
// Internal participants live in a dedicated `internal_participants` table —
// separate from `stakeholders` — because they belong to the rep's company,
// not to the buyer account. Pass 2 needs them so the model can ground
// references to "the VP" / "deal desk" / specific rep names against real
// org context. Without this, Pass 4 invents org structure or treats internal
// people as ambiguous.

async function fetchInternalParticipants(
  tenant_id: string,
  opportunity_id: string,
  account_id: string
): Promise<AssembledStakeholder[]> {
  const { data, error } = await supabaseAdmin
    .from('internal_participants')
    .select(
      `
      id, account_id, name, email, title, company, party,
      committee_role, is_departed_from_deal,
      discovery_source, discovery_confidence, discovery_reasoning,
      first_seen_at, first_seen_call_id
    `
    )
    .eq('tenant_id', tenant_id)
    .or(`opportunity_id.eq.${opportunity_id},account_id.eq.${account_id}`);

  if (error) {
    throw new Error(`Failed to fetch internal participants: ${error.message}`);
  }

  const rows = data ?? [];
  return rows.map((r): AssembledStakeholder => ({
    id: r.id,
    account_id: r.account_id,
    name: r.name,
    email: r.email,
    title: r.title,
    company: r.company ?? '(rep org)',
    party: 'internal',
    committee_role: r.committee_role as AssembledStakeholder['committee_role'],
    tenure_at_current_firm_months: null,
    tenure_signal_category: null,
    linkedin_url: null,
    linkedin_data_freshness: null,
    last_conversational_confirmation_at: null,
    is_departed: false,
    deal_disposition: null,
    deal_engagement_level: null,
    deal_influence_level: null,
    is_departed_from_deal: r.is_departed_from_deal ?? null,
    source: 'account_only',
    discovery_source: (r.discovery_source as AssembledStakeholder['discovery_source']) ?? null,
    discovery_confidence: (r.discovery_confidence as AssembledStakeholder['discovery_confidence']) ?? null,
    discovery_reasoning: r.discovery_reasoning ?? null,
    first_seen_at: r.first_seen_at ?? null,
    first_seen_call_id: r.first_seen_call_id ?? null,
  }));
}

function mergeInternalParticipants(
  fromStakeholders: AssembledStakeholder[],
  fromTable: AssembledStakeholder[]
): AssembledStakeholder[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const out: AssembledStakeholder[] = [];
  for (const p of [...fromStakeholders, ...fromTable]) {
    if (seenIds.has(p.id)) continue;
    const nameKey = p.name.toLowerCase().trim();
    if (seenNames.has(nameKey)) continue;
    seenIds.add(p.id);
    seenNames.add(nameKey);
    out.push(p);
  }
  return out;
}

function toAssembledStakeholder(
  sthRaw: {
    id: string;
    account_id: string | null;
    name: string;
    email: string | null;
    title: string | null;
    company: string;
    party: string;
    committee_role: string | null;
    tenure_at_current_firm_months: number | null;
    tenure_signal_category: string | null;
    linkedin_url: string | null;
    linkedin_data_freshness: string | null;
    last_conversational_confirmation_at: string | null;
    is_departed: boolean;
    discovery_source?: string | null;
    discovery_confidence?: string | null;
    discovery_reasoning?: string | null;
    first_seen_at?: string | null;
    first_seen_call_id?: string | null;
  },
  source: StakeholderSource,
  dealContext: {
    disposition: string | null;
    engagement_level: string | null;
    influence_level: string | null;
    is_departed_from_deal: boolean | null;
  } | null
): AssembledStakeholder {
  return {
    id: sthRaw.id,
    account_id: sthRaw.account_id,
    name: sthRaw.name,
    email: sthRaw.email,
    title: sthRaw.title,
    company: sthRaw.company,
    party: sthRaw.party as AssembledStakeholder['party'],
    committee_role: sthRaw.committee_role as AssembledStakeholder['committee_role'],
    tenure_at_current_firm_months: sthRaw.tenure_at_current_firm_months,
    tenure_signal_category: sthRaw.tenure_signal_category as AssembledStakeholder['tenure_signal_category'],
    linkedin_url: sthRaw.linkedin_url,
    linkedin_data_freshness: sthRaw.linkedin_data_freshness as AssembledStakeholder['linkedin_data_freshness'],
    last_conversational_confirmation_at: sthRaw.last_conversational_confirmation_at,
    is_departed: sthRaw.is_departed,
    deal_disposition: (dealContext?.disposition as AssembledStakeholder['deal_disposition']) ?? null,
    deal_engagement_level: (dealContext?.engagement_level as AssembledStakeholder['deal_engagement_level']) ?? null,
    deal_influence_level: (dealContext?.influence_level as AssembledStakeholder['deal_influence_level']) ?? null,
    is_departed_from_deal: dealContext?.is_departed_from_deal ?? null,
    source,
    discovery_source: (sthRaw.discovery_source as AssembledStakeholder['discovery_source']) ?? null,
    discovery_confidence: (sthRaw.discovery_confidence as AssembledStakeholder['discovery_confidence']) ?? null,
    discovery_reasoning: sthRaw.discovery_reasoning ?? null,
    first_seen_at: sthRaw.first_seen_at ?? null,
    first_seen_call_id: sthRaw.first_seen_call_id ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 5: merge activities
// ────────────────────────────────────────────────────────────────────────────

interface ActivityMergeResult {
  activities: AssembledActivity[];
  totalFound: number;
  capped: boolean;
}

async function mergeActivities(
  tenant_id: string,
  opportunity_id: string,
  account_id: string,
  windowStart: Date,
  maxActivities: number,
  maxOccurredAt: string | null = null
): Promise<ActivityMergeResult> {
  const windowStartIso = windowStart.toISOString();
  // Upper bound for temporal-replay cutoff. When unset, use a far-future
  // sentinel so the .lte(...) is a no-op and production behavior is unchanged.
  const windowEndIso = maxOccurredAt ?? '9999-12-31T23:59:59Z';

  const { data: oppAnchored, error: oppError } = await supabaseAdmin
    .from('activities')
    .select(
      `
      id, account_id, opportunity_id, type, occurred_at,
      subject, summary, rep_note,
      call_id, email_id, meeting_id, attendee_emails,
      source_system, source_external_id
    `
    )
    .eq('tenant_id', tenant_id)
    .eq('opportunity_id', opportunity_id)
    .gte('occurred_at', windowStartIso)
    .lte('occurred_at', windowEndIso);

  if (oppError) {
    throw new Error(`Failed to fetch opportunity-anchored activities: ${oppError.message}`);
  }

  const { data: acctAnchored, error: acctError } = await supabaseAdmin
    .from('activities')
    .select(
      `
      id, account_id, opportunity_id, type, occurred_at,
      subject, summary, rep_note,
      call_id, email_id, meeting_id, attendee_emails,
      source_system, source_external_id
    `
    )
    .eq('tenant_id', tenant_id)
    .eq('account_id', account_id)
    .is('opportunity_id', null)
    .gte('occurred_at', windowStartIso)
    .lte('occurred_at', windowEndIso);

  if (acctError) {
    throw new Error(`Failed to fetch account-anchored activities: ${acctError.message}`);
  }

  const tagged: AssembledActivity[] = [];
  const seen = new Set<string>();

  for (const row of oppAnchored ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    tagged.push(toAssembledActivity(row, 'opportunity_anchored'));
  }
  for (const row of acctAnchored ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    tagged.push(toAssembledActivity(row, 'account_anchored'));
  }

  tagged.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const totalFound = tagged.length;
  const capped = totalFound > maxActivities;
  const activities = capped ? tagged.slice(0, maxActivities) : tagged;

  return { activities, totalFound, capped };
}

function toAssembledActivity(
  row: {
    id: string;
    account_id: string;
    opportunity_id: string | null;
    type: string;
    occurred_at: string;
    subject: string;
    summary: string | null;
    rep_note: string | null;
    call_id: string | null;
    email_id: string | null;
    meeting_id: string | null;
    attendee_emails: string[] | null;
    source_system: string;
    source_external_id: string;
  },
  anchor_type: ActivityAnchorType
): AssembledActivity {
  return {
    id: row.id,
    account_id: row.account_id,
    opportunity_id: row.opportunity_id,
    type: row.type as ActivityType,
    occurred_at: row.occurred_at,
    subject: row.subject,
    summary: row.summary,
    rep_note: row.rep_note,
    call_id: row.call_id,
    email_id: row.email_id,
    meeting_id: row.meeting_id,
    attendee_emails: row.attendee_emails ?? [],
    source_system: row.source_system,
    source_external_id: row.source_external_id,
    anchor_type,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 6: hydrate activity-referenced payloads
// ────────────────────────────────────────────────────────────────────────────

interface HydrationResult {
  calls: AssembledCall[];
  emails: AssembledEmail[];
  meetings: AssembledMeeting[];
  callsRequested: number;
  emailsRequested: number;
  meetingsRequested: number;
  attendeesReturned: number;
  missing_payload_ids: { calls: string[]; emails: string[]; meetings: string[] };
}

/**
 * Walks the assembled activities, collects all non-null call_id / email_id
 * / meeting_id values, batch-fetches each set in parallel, then attaches a
 * separately-fetched attendees list to each meeting.
 *
 * Uses select('*') for performance simplicity. Be aware: AssembledCall.transcript
 * and AssembledEmail.body can be large. If payload size becomes an issue,
 * narrow these selects to drop transcripts/bodies for prep scenarios where
 * they aren't needed.
 *
 * Missing payload IDs (referenced by an activity but not found in DB) surface
 * in diagnostics structured by type. We do NOT throw — Pass 2 should be able
 * to function with a partial set if a payload is missing for any reason
 * (sync race, deleted source row, etc).
 */
async function hydrateActivityPayloads(
  tenant_id: string,
  activities: AssembledActivity[]
): Promise<HydrationResult> {
  const callIds = new Set<string>();
  const emailIds = new Set<string>();
  const meetingIds = new Set<string>();

  for (const a of activities) {
    if (a.call_id) callIds.add(a.call_id);
    if (a.email_id) emailIds.add(a.email_id);
    if (a.meeting_id) meetingIds.add(a.meeting_id);
  }

  const callIdsArr = [...callIds];
  const emailIdsArr = [...emailIds];
  const meetingIdsArr = [...meetingIds];

  const [callsResult, emailsResult, meetingsResult] = await Promise.all([
    callIdsArr.length > 0
      ? supabaseAdmin.from('calls').select('*').eq('tenant_id', tenant_id).in('id', callIdsArr)
      : Promise.resolve({ data: [], error: null }),
    emailIdsArr.length > 0
      ? supabaseAdmin.from('emails').select('*').eq('tenant_id', tenant_id).in('id', emailIdsArr)
      : Promise.resolve({ data: [], error: null }),
    meetingIdsArr.length > 0
      ? supabaseAdmin.from('meetings').select('*').eq('tenant_id', tenant_id).in('id', meetingIdsArr)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (callsResult.error) {
    throw new Error(`Failed to hydrate calls: ${callsResult.error.message}`);
  }
  if (emailsResult.error) {
    throw new Error(`Failed to hydrate emails: ${emailsResult.error.message}`);
  }
  if (meetingsResult.error) {
    throw new Error(`Failed to hydrate meetings: ${meetingsResult.error.message}`);
  }

  // Defensive cast at array level (per Brendan's typing-risk note)
  const callsRaw = (callsResult.data ?? []) as Record<string, unknown>[];
  const emailsRaw = (emailsResult.data ?? []) as Record<string, unknown>[];
  const meetingsRaw = (meetingsResult.data ?? []) as Record<string, unknown>[];

  // Attendees — separate query per spec (no embedded relations)
  let attendeesRaw: Array<{
    meeting_id: string;
    stakeholder_id: string | null;
    name: string;
    email: string | null;
    response_status: string;
    party: string;
    is_organizer: boolean;
  }> = [];

  if (meetingsRaw.length > 0) {
    const meetingPkIds = meetingsRaw.map((m) => m.id as string);
    const { data: attData, error: attError } = await supabaseAdmin
      .from('meeting_attendees')
      .select('meeting_id, stakeholder_id, name, email, response_status, party, is_organizer')
      .eq('tenant_id', tenant_id)
      .in('meeting_id', meetingPkIds);

    if (attError) {
      throw new Error(`Failed to hydrate meeting_attendees: ${attError.message}`);
    }
    attendeesRaw = (attData ?? []) as typeof attendeesRaw;
  }

  // Group attendees by meeting_id
  const attendeesByMeeting = new Map<string, AssembledMeetingAttendee[]>();
  for (const attRow of attendeesRaw) {
    const list = attendeesByMeeting.get(attRow.meeting_id) ?? [];
    list.push(toAssembledMeetingAttendee(attRow));
    attendeesByMeeting.set(attRow.meeting_id, list);
  }

  // Map raw rows to assembled types
  const calls: AssembledCall[] = callsRaw.map(toAssembledCall);
  const emails: AssembledEmail[] = emailsRaw.map(toAssembledEmail);
  const meetings: AssembledMeeting[] = meetingsRaw.map((r) =>
    toAssembledMeeting(r, attendeesByMeeting.get(r.id as string) ?? [])
  );

  // Surface missing payload IDs (referenced but not returned), structured by type
  const returnedCallIds = new Set(calls.map((c) => c.id));
  const returnedEmailIds = new Set(emails.map((e) => e.id));
  const returnedMeetingIds = new Set(meetings.map((m) => m.id));

  const missing_payload_ids = {
    calls: callIdsArr.filter((id) => !returnedCallIds.has(id)),
    emails: emailIdsArr.filter((id) => !returnedEmailIds.has(id)),
    meetings: meetingIdsArr.filter((id) => !returnedMeetingIds.has(id)),
  };

  return {
    calls,
    emails,
    meetings,
    callsRequested: callIdsArr.length,
    emailsRequested: emailIdsArr.length,
    meetingsRequested: meetingIdsArr.length,
    attendeesReturned: attendeesRaw.length,
    missing_payload_ids,
  };
}

function toAssembledCall(r: Record<string, unknown>): AssembledCall {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    opportunity_id: (r.opportunity_id as string | null) ?? null,
    provider: r.provider as AssembledCall['provider'],
    title: r.title as string,
    started_at: r.started_at as string,
    duration_seconds: r.duration_seconds as number,
    direction: r.direction as AssembledCall['direction'],
    party_emails: (r.party_emails as string[] | null) ?? [],
    summary: (r.summary as string | null) ?? null,
    key_moments: (r.key_moments as unknown[] | null) ?? [],
    transcript: (r.transcript as unknown) ?? null,
    topics: (r.topics as string[] | null) ?? [],
    triggers: (r.triggers as string[] | null) ?? [],
  };
}

function toAssembledEmail(r: Record<string, unknown>): AssembledEmail {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    opportunity_id: (r.opportunity_id as string | null) ?? null,
    provider: r.provider as AssembledEmail['provider'],
    thread_id: r.thread_id as string,
    from_stakeholder_id: (r.from_stakeholder_id as string | null) ?? null,
    from_name: r.from_name as string,
    from_email: r.from_email as string,
    to_recipients: r.to_recipients,
    cc_recipients: r.cc_recipients ?? [],
    subject: r.subject as string,
    snippet: r.snippet as string,
    body: (r.body as string | null) ?? null,
    sent_at: r.sent_at as string,
    has_attachments: (r.has_attachments as boolean | null) ?? false,
  };
}

function toAssembledMeeting(
  r: Record<string, unknown>,
  attendees: AssembledMeetingAttendee[]
): AssembledMeeting {
  return {
    id: r.id as string,
    account_id: r.account_id as string,
    opportunity_id: (r.opportunity_id as string | null) ?? null,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    scheduled_at: r.scheduled_at as string,
    duration_minutes: r.duration_minutes as number,
    medium: r.medium as AssembledMeeting['medium'],
    direction: r.direction as AssembledMeeting['direction'],
    internal_owner_id: r.internal_owner_id as string,
    attendees,
  };
}

function toAssembledMeetingAttendee(r: {
  stakeholder_id: string | null;
  name: string;
  email: string | null;
  response_status: string;
  party: string;
  is_organizer: boolean;
}): AssembledMeetingAttendee {
  return {
    stakeholder_id: r.stakeholder_id,
    name: r.name,
    email: r.email,
    response_status: r.response_status as AssembledMeetingAttendee['response_status'],
    party: r.party as AssembledMeetingAttendee['party'],
    is_organizer: r.is_organizer,
  };
}
