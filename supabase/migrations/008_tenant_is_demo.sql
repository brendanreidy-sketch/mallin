-- 008_tenant_is_demo.sql
--
-- Adds an `is_demo` flag to tenants. When true, the cockpit at /prep
-- still reads normally but every action that would touch an external
-- system (Gmail, CRM, Slack) short-circuits as a no-op + surfaces a
-- simulation-mode banner.
--
-- This is the type-level guard for the demo-tenant feature: the
-- intercept logic in the API routes and action-queue executors keys
-- off this column rather than off ad-hoc env vars or feature flags,
-- so a row in the wrong state can never accidentally write to a
-- customer's CRM.
--
-- Default false so existing tenants keep operating in full-write mode.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Index supports the cheap "is this row a demo tenant?" lookup that
-- runs on every authenticated request through getCurrentTenant().
CREATE INDEX IF NOT EXISTS idx_tenants_is_demo
  ON tenants (is_demo)
  WHERE is_demo = true;

COMMENT ON COLUMN tenants.is_demo IS
  'When true, tenant is a sandbox/demo account. All external-write actions (Gmail send, CRM update, Slack DM, action-queue executors) short-circuit to no-op and the /prep cockpit shows the simulation-mode banner. Set manually via SQL when provisioning a demo Clerk user.';
