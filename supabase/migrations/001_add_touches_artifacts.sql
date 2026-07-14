-- ============================================================================
--  001 — Add tables for off-platform touches + Pass 4 / Pass 2c artifacts
-- ============================================================================
--  Existing schema already has: tenants, accounts, opportunities, stakeholders,
--  calls, emails, activities. This migration adds:
--
--    touches                  — off-platform conversation logs (rep input)
--    execution_artifacts      — Pass 4 PrepArtifact JSONB per opportunity
--    rep_behavior_artifacts   — Pass 2c output JSONB per opportunity
--    internal_participants    — seller-side users on a deal
--
--  All tables are tenant-scoped (tenant_id FK) for multi-tenant isolation.
-- ============================================================================

-- ── touches ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS touches (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id               UUID         REFERENCES accounts(id) ON DELETE SET NULL,
  opportunity_id           UUID         NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  with_stakeholder_id      UUID         REFERENCES stakeholders(id) ON DELETE SET NULL,
  occurred_at              TIMESTAMPTZ  NOT NULL,
  subject                  TEXT,
  body                     TEXT         NOT NULL CHECK (length(body) > 0 AND length(body) <= 4000),
  source_system            TEXT         NOT NULL DEFAULT 'rep_log',
  source_external_id       TEXT,
  logged_by_user_id        UUID,        -- Clerk user_id once auth is wired (Phase 2)
  logged_by_email          TEXT,
  attendee_emails          TEXT[]       DEFAULT '{}',
  crm_sync_status          TEXT         CHECK (crm_sync_status IN ('synced','failed','pending','not_configured')),
  crm_sync_meta            JSONB        DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_touches_opportunity ON touches(opportunity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_touches_tenant      ON touches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_touches_stakeholder ON touches(with_stakeholder_id) WHERE with_stakeholder_id IS NOT NULL;

-- ── execution_artifacts (Pass 4 PrepArtifact) ────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_artifacts (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id           UUID         NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  artifact                 JSONB        NOT NULL,
  prompt_version           TEXT,
  model                    TEXT,
  generated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_current               BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exec_artifacts_opp_current
  ON execution_artifacts(opportunity_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_exec_artifacts_opp_history
  ON execution_artifacts(opportunity_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_artifacts_tenant ON execution_artifacts(tenant_id);

-- ── rep_behavior_artifacts (Pass 2c) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rep_behavior_artifacts (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id           UUID         NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  artifact                 JSONB        NOT NULL,
  prompt_version           TEXT,
  model                    TEXT,
  generated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_current               BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rb_artifacts_opp_current
  ON rep_behavior_artifacts(opportunity_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_rb_artifacts_opp_history
  ON rep_behavior_artifacts(opportunity_id, generated_at DESC);

-- ── internal_participants (seller-side reps on a deal) ───────────────────────
CREATE TABLE IF NOT EXISTS internal_participants (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id           UUID         REFERENCES opportunities(id) ON DELETE CASCADE,
  account_id               UUID         REFERENCES accounts(id) ON DELETE SET NULL,
  name                     TEXT         NOT NULL,
  email                    TEXT,
  title                    TEXT,
  company                  TEXT,
  party                    TEXT         NOT NULL DEFAULT 'internal',
  committee_role           TEXT,
  external_user_id         TEXT,        -- Clerk user_id when authenticated, NULL for system-imported
  is_departed_from_deal    BOOLEAN      DEFAULT FALSE,
  source_system            TEXT,
  source_external_id       TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_internal_participants_opp ON internal_participants(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_internal_participants_tenant ON internal_participants(tenant_id);

-- ── Helper: set updated_at on row update ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touches_updated_at ON touches;
CREATE TRIGGER trg_touches_updated_at BEFORE UPDATE ON touches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_participants_updated_at ON internal_participants;
CREATE TRIGGER trg_internal_participants_updated_at BEFORE UPDATE ON internal_participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
