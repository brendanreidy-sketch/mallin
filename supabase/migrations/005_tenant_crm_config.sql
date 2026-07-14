-- ============================================================================
--  005 — Tenant CRM config + sink routing
-- ============================================================================
--  Backs the lib/crm/router.ts dispatch + sendToAllSinks tenant filtering.
--
--  crm_provider: which CRM the core treats as the system of record for
--  this tenant. Read by every public lib/crm function on every call.
--
--  enabled_sinks: which alert sinks this tenant has turned on. Read by
--  sendToAllSinks (lib/sf-diff/alert-sinks.ts) to filter the global sink
--  list down to what the tenant actually wants. Empty array = no sinks
--  (Mallin still runs verification + cockpit, just doesn't post out).
--
--  The policy fields (routing_policy, severity_thresholds,
--  manager_escalation_rules, roe_rules) are deliberately created now
--  with JSONB default '{}' so the schema doesn't need re-migration when
--  policy logic lands. They are NOT read by any code today — the
--  TenantRoutingPolicy type in lib/crm/types.ts documents the eventual
--  shape.
--
--  Defaults preserve current behavior:
--    - existing tenants → crm_provider = 'salesforce' (status quo)
--    - enabled_sinks defaults to {'slack'} so warnings keep flowing to
--      Slack as they do today.
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS crm_provider TEXT
    CHECK (crm_provider IN ('salesforce', 'hubspot')),
  ADD COLUMN IF NOT EXISTS enabled_sinks TEXT[] DEFAULT ARRAY['slack']::TEXT[],
  ADD COLUMN IF NOT EXISTS routing_policy JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS severity_thresholds JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manager_escalation_rules JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS roe_rules JSONB DEFAULT '{}'::jsonb;

-- Backfill existing tenants to 'salesforce' (the current production
-- behavior). New tenants must explicitly choose during onboarding.
UPDATE tenants SET crm_provider = 'salesforce' WHERE crm_provider IS NULL;

-- After backfill, make crm_provider NOT NULL so the router can rely on it.
ALTER TABLE tenants
  ALTER COLUMN crm_provider SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_crm_provider ON tenants(crm_provider);
