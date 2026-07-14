-- Outbound prospecting — the review-queue substrate. One row per sourced
-- prospect from a sourcing run. The full Prospect (company, contact, trigger,
-- draft) lives in `prospect` jsonb so the schema stays stable as the agent's
-- shape evolves (stable_cognition_layer). Status drives the approve/skip queue
-- and the autonomy-gated send disposition; sending itself is STUBBED until a
-- warmed domain is wired.
--
-- NOT auto-applied to prod on this project (migrations_not_auto_applied) —
-- apply this manually against the prod DB before the surface goes live.

CREATE TABLE IF NOT EXISTS outbound_prospects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  run_id     uuid NOT NULL,
  prospect   jsonb NOT NULL,
  -- pending | approved | skipped | queued_send | held | sent
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_prospects_tenant_created
  ON outbound_prospects (tenant_id, created_at DESC);
