-- ===========================================================================
--  slack_interactions — durable record of every Slack button click
-- ===========================================================================
--
--  Purpose:
--    Stage 1 of the trust progression (Suggest mode). Every time a rep
--    clicks "Looks right" or "Looks wrong" on a Slack alert, a row lands
--    here. This is the data that earns the right to graduate a field
--    from Stage 1 to Stage 2 (Apply).
--
--    The graduation question — "for field X, what's the confirm rate
--    over the last N suggestions?" — is answered by aggregating this
--    table. Threshold per ui_trust_progression.md: ≥85% confirm rate
--    over N=50 for a given field.
--
--  Why a separate table from sf_writes_audit:
--    - Stage 1 clicks DO NOT write to Salesforce. They're attestations,
--      not writes. Mixing them with sf_writes_audit (which has FKs to
--      links + opportunities) would force null FKs on attestation rows.
--    - The semantics differ: sf_writes_audit answers "what did we send
--      to SF?". slack_interactions answers "what did the rep agree to?".
--    - When Stage 2 arrives, a confirmed click triggers an SF write —
--      the sf_writes_audit row will reference the slack_interactions.id
--      that authorized it (separate FK migration to come).
--
--  Design decisions:
--    1. ADDITIVE — no changes to existing tables.
--    2. NEVER DELETED — permanent log. Same discipline as sf_writes_audit.
--    3. Nullable deal_id / sf_field / suggested_value — verification-gap
--       alerts (the current set) flag MISSING information; they don't
--       suggest a field-write. When alerts evolve to carry a proposed
--       value (Stage 2 path), these populate.
--    4. raw_payload JSONB — full Slack payload snapshot for forensics.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slack_interaction_status') THEN
    CREATE TYPE slack_interaction_status AS ENUM (
      'confirmed_pending_apply',
      'dismissed_with_correction',
      'unknown_action'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS slack_interactions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO clicked
  slack_user_id       text        NOT NULL,
  slack_user_name     text,

  -- WHAT they clicked
  action_id           text        NOT NULL,
  status              slack_interaction_status NOT NULL,

  -- WHICH alert was being acted on
  rule_id             text        NOT NULL,
  alert_severity      text        NOT NULL,
  deal_name           text,
  deal_id             text,
  sf_field            text,
  suggested_value     text,
  triggered_at_call   int,

  -- WHEN
  message_ts          text        NOT NULL,
  channel_id          text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- RAW snapshot of the entire Slack payload (forensics)
  raw_payload         jsonb       NOT NULL
);

-- Confirm-rate query (the trust-progression unlock):
--   "For SF field X, how often did reps confirm vs dismiss?"
CREATE INDEX IF NOT EXISTS idx_slack_interactions_field_status
  ON slack_interactions (sf_field, status)
  WHERE sf_field IS NOT NULL;

-- Per-rule confirm rate (when sf_field is null but rule_id is always set):
CREATE INDEX IF NOT EXISTS idx_slack_interactions_rule_status
  ON slack_interactions (rule_id, status);

-- "What did this rep do recently?" (per-rep timeline)
CREATE INDEX IF NOT EXISTS idx_slack_interactions_user_recent
  ON slack_interactions (slack_user_id, created_at DESC);

-- "Did this exact alert message get confirmed?" (idempotency check)
CREATE INDEX IF NOT EXISTS idx_slack_interactions_message_ts
  ON slack_interactions (message_ts);

-- Recent interactions across the system
CREATE INDEX IF NOT EXISTS idx_slack_interactions_recent
  ON slack_interactions (created_at DESC);

COMMENT ON TABLE slack_interactions IS
  'Stage 1 trust progression ledger. One row per Slack button click. Drives the >=85%-over-N=50 graduation threshold to Stage 2 (Apply).';
COMMENT ON COLUMN slack_interactions.action_id IS
  'Slack action_id from the button: "acres_alert_confirm" | "acres_alert_dismiss" | future actions.';
COMMENT ON COLUMN slack_interactions.status IS
  'Normalized outcome — same shape regardless of which action_id triggered it. Drives confirm-rate aggregations.';
COMMENT ON COLUMN slack_interactions.sf_field IS
  'Salesforce field this alert is about. NULL for alerts that flag missing info without proposing a write target.';
COMMENT ON COLUMN slack_interactions.suggested_value IS
  'Proposed field value (Stage 2 alerts). NULL for verification-gap alerts (Stage 1) that flag what is missing without proposing a fill.';
COMMENT ON COLUMN slack_interactions.message_ts IS
  'Slack message timestamp — links this row back to the original alert message and enables idempotent re-click handling.';
COMMENT ON COLUMN slack_interactions.raw_payload IS
  'Complete Slack interaction payload, redacted of bot tokens. Forensics + reproducibility.';
