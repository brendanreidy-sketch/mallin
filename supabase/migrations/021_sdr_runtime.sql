-- SDR runtime: conversations, the audit ledger, and leads. The persistence
-- that turns the agent from a stateless responder into something that
-- remembers, can be approved, and can be followed up over time.
--
-- Additive + idempotent. All scoped by tenant_id.

-- One row per prospect chat session.
CREATE TABLE IF NOT EXISTS sdr_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',        -- active | closed
  triage text,                                  -- latest triage decision
  state jsonb,                                  -- latest QualificationState
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every prospect/agent message (the conversation transcript).
CREATE TABLE IF NOT EXISTS sdr_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  role text NOT NULL,                           -- prospect | agent
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The audit ledger — every governed action the agent took or queued.
CREATE TABLE IF NOT EXISTS sdr_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  tool text NOT NULL,
  input jsonb NOT NULL,
  mode text NOT NULL,                           -- auto | approve | never
  status text NOT NULL,                         -- executed | pending_approval | blocked | approved | denied
  result text,
  approved_by text,                             -- user id who cleared it (approve mode)
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- One row per qualified/nurtured lead (drives handoff + the nurture cron).
CREATE TABLE IF NOT EXISTS sdr_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  triage text,
  lead jsonb,                                   -- captured lead fields
  last_nurture_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdr_messages_conv_idx ON sdr_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS sdr_actions_pending_idx ON sdr_actions (tenant_id, status);
CREATE INDEX IF NOT EXISTS sdr_leads_tenant_idx ON sdr_leads (tenant_id, triage);
CREATE INDEX IF NOT EXISTS sdr_conversations_tenant_idx ON sdr_conversations (tenant_id, status);
