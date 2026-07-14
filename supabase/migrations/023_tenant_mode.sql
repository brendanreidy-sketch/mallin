-- 023_tenant_mode.sql
-- Solo vs team workspace mode.
--
-- Defaults to 'team' so every EXISTING tenant (design partners, demo) keeps
-- every cockpit surface — zero regression. New self-serve personal workspaces
-- are created with mode='solo' (see lib/auth/ensure-personal-workspace.ts),
-- which hides team-only surfaces from the cockpit: manager escalation, the
-- manager note, and Slack activity. Read via lib/auth/tenant-context.ts
-- isTenantSolo().

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'team'
    CHECK (mode IN ('solo', 'team'));
