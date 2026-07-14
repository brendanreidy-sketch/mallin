-- Per-tenant agent configuration — where a customer DECLARES what they use
-- Mallin for. Mallin's value is use-case-dependent (an inbound-SDR profile and
-- a deal-cockpit profile do different "homework"), so config is keyed by
-- (tenant, capability) rather than a single settings blob — multiple capability
-- profiles can coexist per tenant without a retrofit. Today the only capability
-- is 'sdr' (governed inbound triage). See lib/sdr/config-store.ts.
--
-- Additive + idempotent. config is JSONB holding the capability's full config
-- object (e.g. SdrTenantConfig); the app owns its shape.
CREATE TABLE IF NOT EXISTS agent_configs (
  tenant_id uuid NOT NULL,
  capability text NOT NULL,                 -- 'sdr' today; room for more
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, capability)
);
