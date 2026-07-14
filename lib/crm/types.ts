/**
 * ============================================================================
 *  Neutral CRM types — the canonical objects the core thinks in
 * ============================================================================
 *
 *  Pass 2/3/4, the cockpit, and the verification framework reason about
 *  these types. They MUST NOT import provider-specific types (SF
 *  Opportunity, HubSpot Deal, etc.). Provider translation happens in
 *  lib/crm/sf-provider.ts and lib/crm/hubspot-provider.ts.
 *
 *  Design principles enforced here:
 *
 *  1. IDs are not overloaded. `id` is Mallin's canonical UUID. The
 *     pointer to the underlying CRM record lives in `ref: ProviderRef`.
 *     Future-proof if a record migrates between CRMs.
 *
 *  2. Activity types are first-class. Meeting / Email / Call / Task / Note
 *     all extend Activity so coaching logic in Pass 4 can reason about
 *     "what kind of touch happened" without leaking provider details.
 *
 *  3. Provider asymmetry is named, not hidden. `ProviderCapabilities`
 *     declares what each CRM can do. Code that needs threading or
 *     custom fields checks the capability flag and degrades gracefully
 *     when missing — rather than throwing on the unknown CRM.
 *
 *  4. Policy fields are anticipated, not implemented. `routing_policy`
 *     etc. are JSONB columns we leave room for; this file just exports
 *     the type shapes when they exist.
 * ============================================================================
 */

// ─── Pointer to a record in a specific CRM ─────────────────────────────────
export type ProviderName =
  | "salesforce"
  | "hubspot"
  | "dynamics"      // future
  | "pipedrive"     // future
  | "attio";        // future

export interface ProviderRef {
  provider: ProviderName;
  /** The CRM-side ID (e.g. SF "006...", HubSpot deal "1234567890") */
  external_id: string;
  /** Optional secondary scope — e.g. HubSpot hub_id when tenant has many */
  scope?: string;
}

// ─── MEDDPICC — present on Deal as a partial; CRMs name fields differently ──
export interface Meddpicc {
  metrics: string;
  economic_buyer: string;
  decision_criteria: string;
  decision_process: string;
  paper_process: string;
  identify_pain: string;
  champion: string;
  competition: string;
}

// ─── Core neutral objects ──────────────────────────────────────────────────
export interface Deal {
  /** Mallin's canonical UUID. Stable across CRM migrations. */
  id: string;
  ref: ProviderRef;
  name: string;
  amount?: number;
  currency?: string;
  stage: string;
  close_date?: string;
  forecast_category?: string;
  meddpicc: Partial<Meddpicc>;
  /** Email of the owning rep (resolved via provider's owner lookup) */
  owner_email?: string;
  /** Free-form per-tenant custom properties not in the standard shape */
  custom_properties?: Record<string, string | number | null>;
  created_at?: string;
  updated_at?: string;
}

export interface Contact {
  id: string;
  ref: ProviderRef;
  name: string;
  email?: string;
  title?: string;
  /** Reference to associated Company.id when known */
  company_id?: string;
}

export interface Company {
  id: string;
  ref: ProviderRef;
  name: string;
  domain?: string;
  industry?: string;
  employee_count?: number;
}

// ─── Activity hierarchy ────────────────────────────────────────────────────
export type ActivityType = "call" | "meeting" | "email" | "note" | "task";

export interface ActivityBase {
  id: string;
  ref: ProviderRef;
  type: ActivityType;
  /** ISO timestamp of when the activity occurred (not when it was logged) */
  occurred_at: string;
  /** Reference back to the deal this activity is associated with, if any */
  deal_id?: string;
  /** Reference to the rep or attendee who logged it */
  logged_by_email?: string;
  subject?: string;
}

export interface Call extends ActivityBase {
  type: "call";
  duration_seconds?: number;
  recording_url?: string;
  transcript_id?: string;
  participants?: { email?: string; name?: string }[];
}

export interface Meeting extends ActivityBase {
  type: "meeting";
  duration_minutes?: number;
  attendees?: { email?: string; name?: string }[];
  meeting_url?: string;
}

export interface Email extends ActivityBase {
  type: "email";
  direction: "incoming" | "outgoing" | "unknown";
  from_email?: string;
  from_name?: string;
  to_emails?: string[];
  cc_emails?: string[];
  snippet?: string;
  thread_id?: string;
}

export interface Task extends ActivityBase {
  type: "task";
  status?: "open" | "in_progress" | "completed";
  priority?: "low" | "medium" | "high";
  due_at?: string;
  assignee_email?: string;
  body?: string;
}

export interface Note extends ActivityBase {
  type: "note";
  /** Sanitized HTML; CRMs all accept a limited subset (p, strong, em, ul, li, a, br) */
  body_html: string;
}

export type Activity = Call | Meeting | Email | Task | Note;

// ─── Payloads for write operations ─────────────────────────────────────────
export interface NotePayload {
  body_html: string;
  /** ISO timestamp; defaults to now() on the provider side if not set */
  occurred_at?: string;
}

export interface TaskPayload {
  subject: string;
  body?: string;
  priority?: "low" | "medium" | "high";
  due_at?: string;
  /** Email of the rep to assign; provider translates to its own owner ID */
  assignee_email?: string;
  /** Status defaults to "open" if not provided */
  status?: "open" | "in_progress" | "completed";
}

/** A fresh inbound lead (no deal yet) — created by the AI SDR on hand-off. */
export interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  /** Why they qualified + the captured context — goes in the CRM description. */
  description?: string;
}

// ─── Provider capability flags ─────────────────────────────────────────────
/**
 * What each CRM provider supports. The neutral interface returns these so
 * code that needs threading / custom fields / etc. can check and degrade.
 *
 * Example: `if (caps.supports_threading) { create email engagement reply }
 *          else { create standalone note with subject "Re: ..." }`
 */
export interface ProviderCapabilities {
  /** Can attach plain notes to deal records */
  supports_notes: boolean;
  /** Can create tasks assigned to specific owners */
  supports_tasks: boolean;
  /** Can write to non-standard fields (MEDDPICC etc.) */
  supports_custom_fields: boolean;
  /** Email/note engagements have native threading (vs flat) */
  supports_threading: boolean;
  /** Provider has first-class MEDDPICC fields out of the box (rare) */
  supports_meddpicc_native: boolean;
  /** Can list emails associated to a deal */
  supports_email_engagements: boolean;
}

// ─── Future-leaving room for policy ────────────────────────────────────────
/**
 * Per-tenant routing policy. Schema fields exist on `tenants` table
 * (migration 005) but aren't read by the engine yet. This type
 * documents the eventual shape so it doesn't accumulate ad-hoc keys.
 */
export interface TenantRoutingPolicy {
  /** Which sinks are active for this tenant. Defaults to ['slack']. */
  enabled_sinks?: string[];
  /** Per-severity overrides for which sinks fire. */
  severity_thresholds?: {
    warn?: string[];
    escalate_to_manager?: string[];
  };
  /** When to escalate to manager (vs handle solo). */
  manager_escalation_rules?: {
    /** Calls into the deal before manager loop-in is offered */
    min_calls?: number;
    /** Severity types that auto-loop in the manager */
    auto_escalate_on?: ("warn" | "escalate_to_manager")[];
  };
  /** Rules of engagement — domain-specific policy. */
  roe_rules?: Record<string, unknown>;
}
