-- ============================================================================
--  027 — brief_views: the design-partner dependency signal
-- ============================================================================
--  Records when a rep opens a deal's brief, so we can answer the retention
--  question that matters most: do reps come back to Mallín before their next
--  call, week over week (behavioral dependency — the #1 thing that separates a
--  tool from infrastructure, and the #1 thing a seed investor wants to see).
--
--  Distinct from cockpit_events (009), which is demo-only first-impression
--  instrumentation. This is narrow, deletable, and for REAL design partners.
--  Write-throttled to one row per (tenant, user, opportunity) per ~5 min so the
--  prep page's auto-refresh doesn't inflate it. Filter tenants.is_demo at query
--  time to get the real cohort. Reviewed via SQL, not a dashboard.
-- ============================================================================
CREATE TABLE IF NOT EXISTS brief_views (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id uuid,
  user_id        text NOT NULL,           -- Clerk user_id
  viewed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_views_tenant_user_time
  ON brief_views (tenant_id, user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_brief_views_opp_time
  ON brief_views (opportunity_id, viewed_at DESC);
