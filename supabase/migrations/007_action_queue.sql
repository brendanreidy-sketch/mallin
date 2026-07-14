-- ============================================================================
--  007 — action_queue: the cockpit's governed action ledger
-- ============================================================================
--
--  The queue turns the cockpit from "insight surfaces" into "coordinated
--  operational execution." Reps can:
--    - approve CRM updates one at a time or in bulk
--    - send queued emails together
--    - acknowledge risks with a logged action
--    - escalate to manager
--    - defer items for later
--
--  Equally important: this table IS the audit ledger of every action
--  Mallin and reps take through the cockpit. Every executed row carries
--  enough provenance to answer:
--
--    Who approved this? When? From which surface did it originate?
--    Which executor ran it? What external object did it produce?
--    Where do I open that external object?
--
--  Those questions become load-bearing when managers review actions,
--  trust tiers increase (Stage 2/3 auto-execute), or customers ask
--  "why did Mallin do this?". Building the ledger now — first-class,
--  queryable, indexed — is much cheaper than retrofitting later.
--
--  Schema notes:
--    - opportunity_id is text (substrate UUID OR external CRM id),
--      mirroring slack_outbound_posts. Cockpit queries pass both
--      candidate ids.
--    - user_id is the queue-item creator's Clerk id. approved_by_user_id
--      is who approved (may differ from creator in multi-user flows).
--    - payload is the typed action payload (different shape per
--      action_type). The TS type lives in lib/action-queue/types.ts.
--    - status is a string-typed state machine (not pg ENUM — adding
--      values to an ENUM requires special handling; text + CHECK gives
--      us the same constraint with easier evolution).
--    - executor/external_object_* fields surface execution provenance
--      as first-class queryable columns. NULL until status='executed'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS action_queue (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Scope (substrate UUID or external CRM id). The cockpit query side
  -- passes both candidate IDs and matches on either.
  opportunity_id           TEXT,

  -- Provenance — who created the queue item (the rep who clicked
  -- "Queue" on a cockpit surface).
  user_id                  TEXT         NOT NULL,

  -- WHAT the action is
  action_type              TEXT         NOT NULL CHECK (action_type IN (
                             'crm_update',
                             'email_send',
                             'email_draft',
                             'risk_ack',
                             'manager_escalate',
                             'deferral'
                           )),
  payload                  JSONB        NOT NULL,
  -- One-line "why" the rep sees in the queue panel. Captured at queue
  -- time from the surface that originated the action.
  rationale                TEXT,

  -- WHERE it came from (origin)
  source_surface           TEXT         CHECK (source_surface IN (
                             'crm_suggestion',
                             'email_composer',
                             'risk_card',
                             'manual',
                             'mallin_proactive'
                           )),
  source_item_id           TEXT,        -- e.g. CrmSuggestion.id, risk.id, etc.

  -- STATE machine
  status                   TEXT         NOT NULL DEFAULT 'queued' CHECK (status IN (
                             'queued',
                             'approved_pending',
                             'executed',
                             'failed',
                             'dismissed',
                             'deferred'
                           )),
  queued_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  approved_at              TIMESTAMPTZ,
  -- Who approved (may differ from creator). Manager approval lands here.
  approved_by_user_id      TEXT,
  executed_at              TIMESTAMPTZ,
  deferred_until           TIMESTAMPTZ,

  -- EXECUTION provenance — first-class so the ledger is queryable
  -- without parsing result JSON.
  executor                 TEXT,        -- code-path identifier
  external_object_id       TEXT,        -- e.g. Gmail messageId, SF Opp Id, Slack message_ts
  external_object_type     TEXT,        -- e.g. 'gmail.message', 'salesforce.opportunity'
  external_object_url      TEXT,        -- deep link for "Open in <system>"

  -- Raw executor return + error for forensics
  result                   JSONB,
  error                    TEXT
);

-- updated_at trigger — useful when status transitions
CREATE OR REPLACE FUNCTION action_queue_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  -- Touch executed_at automatically when status flips to 'executed' if
  -- the executor forgot to set it (defense in depth).
  IF NEW.status = 'executed' AND NEW.executed_at IS NULL THEN
    NEW.executed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_action_queue_set_updated_at ON action_queue;
CREATE TRIGGER trg_action_queue_set_updated_at
  BEFORE UPDATE ON action_queue
  FOR EACH ROW EXECUTE FUNCTION action_queue_set_updated_at();

-- Indexes for the cockpit's primary read paths.
CREATE INDEX IF NOT EXISTS idx_action_queue_user_deal_status
  ON action_queue(user_id, opportunity_id, status, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_queue_tenant_status
  ON action_queue(tenant_id, status, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_queue_executed
  ON action_queue(executed_at DESC)
  WHERE executed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_queue_source
  ON action_queue(source_surface, source_item_id)
  WHERE source_item_id IS NOT NULL;

-- Cross-system lookup ("which Mallin action produced this Gmail message?").
CREATE INDEX IF NOT EXISTS idx_action_queue_external_object
  ON action_queue(external_object_type, external_object_id)
  WHERE external_object_id IS NOT NULL;
