/**
 * ============================================================================
 *  Action queue — types
 * ============================================================================
 *
 *  Discriminated union over action_type. Each variant has a typed
 *  payload. The DB stores payload as JSONB; readers cast back to the
 *  variant indicated by action_type.
 *
 *  Adding a new action:
 *    1. Add a string literal to ActionType
 *    2. Add a payload interface
 *    3. Add a discriminator branch in QueuedAction
 *    4. Add an executor function in lib/action-queue/executors.ts
 *    5. Update the action_type CHECK constraint in migration (or add new migration)
 * ============================================================================
 */

export type ActionType =
  | "crm_update"
  /** @deprecated RETIRED 2026-07-18 (drafts-only). Read-only legacy type kept
   *  so historical rows still deserialize + display. No producer creates it and
   *  it has no executor — it can never send. Use "email_draft" instead. */
  | "email_send"
  | "email_draft"
  | "risk_ack"
  | "manager_escalate"
  | "deferral";

export type ActionStatus =
  | "queued"
  | "approved_pending"
  | "executed"
  | "failed"
  | "dismissed"
  | "deferred";

export type SourceSurface =
  | "crm_suggestion"
  | "email_composer"
  | "risk_card"
  | "manual"
  | "mallin_proactive";

// ─── Per-type payloads ─────────────────────────────────────────────────────
export interface CrmUpdatePayload {
  type: "crm_update";
  /** Neutral field name (e.g. "meddpicc.champion"). */
  field: string;
  field_label: string;
  value: string;
  /** External CRM id (SF Opp Id or HubSpot deal id). */
  deal_ref: string;
}

/**
 * @deprecated RETIRED 2026-07-18 (drafts-only). Legacy read-only payload shape
 * for historical `email_send` rows. Nothing creates or executes this anymore;
 * Mallín never sends. Kept only so old queue rows can be read/displayed.
 */
export interface EmailSendPayload {
  type: "email_send";
  to: string;
  subject: string;
  body_text: string;
  body_html: string;
  thread_id?: string;
  cc?: string;
  bcc?: string;
}

export interface EmailDraftPayload {
  type: "email_draft";
  to: string;
  subject: string;
  body_text: string;
  body_html: string;
  thread_id?: string;
}

export interface RiskAckPayload {
  type: "risk_ack";
  risk_id: string;
  risk_title: string;
  /** Free-form "what I did about this" the rep types in. */
  action_taken: string;
}

export interface ManagerEscalatePayload {
  type: "manager_escalate";
  manager_email?: string;
  manager_slack_id?: string;
  reason: string;
}

export interface DeferralPayload {
  type: "deferral";
  /** Reference to the original queue item being deferred. */
  defer_action_id: string;
  defer_until: string; // ISO timestamp
  reason?: string;
}

export type ActionPayload =
  | CrmUpdatePayload
  | EmailSendPayload
  | EmailDraftPayload
  | RiskAckPayload
  | ManagerEscalatePayload
  | DeferralPayload;

// ─── Queue row ─────────────────────────────────────────────────────────────
export interface QueuedAction {
  id: string;
  tenant_id: string;
  opportunity_id: string | null;
  user_id: string;

  action_type: ActionType;
  payload: ActionPayload;
  rationale: string | null;

  source_surface: SourceSurface | null;
  source_item_id: string | null;

  status: ActionStatus;
  queued_at: string;
  approved_at: string | null;
  approved_by_user_id: string | null;
  executed_at: string | null;
  deferred_until: string | null;

  // Execution provenance — set only when status='executed' or 'failed'.
  executor: string | null;
  external_object_id: string | null;
  external_object_type: string | null;
  external_object_url: string | null;

  result: Record<string, unknown> | null;
  error: string | null;
}

// ─── Inputs for the helper API ─────────────────────────────────────────────
export interface EnqueueInput {
  tenant_id: string;
  user_id: string;
  opportunity_id?: string;
  payload: ActionPayload;
  rationale?: string;
  source_surface?: SourceSurface;
  source_item_id?: string;
}

export interface ExecutionResult {
  ok: boolean;
  executor: string;
  external_object_id?: string;
  external_object_type?: string;
  external_object_url?: string;
  result?: Record<string, unknown>;
  error?: string;
}
