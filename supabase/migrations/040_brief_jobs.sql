-- ============================================================================
--  040 — brief_jobs: async job ledger for internal executive-brief generation
-- ============================================================================
--
--  The internal executive brief runs a multi-minute model pipeline (generate →
--  validate → one constrained repair → render). That exceeds what a synchronous
--  HTTP request can reliably hold, so generation moves OUT of the request
--  lifecycle into a background job:
--
--    1. POST /api/internal-brief inserts a 'queued' row here and returns { jobId }
--       immediately (no binary in the response).
--    2. A Vercel cron worker (app/api/cron/process-brief-jobs) claims 'queued'
--       rows (FOR UPDATE SKIP LOCKED), sets 'running', runs the pipeline, and
--       stores the result — the rendered .pptx as base64 on success, or an
--       error_code on failure — flipping status to 'succeeded' / 'failed'.
--    3. The client polls GET /api/internal-brief/status?jobId=… and, on
--       'succeeded', downloads via GET /api/internal-brief/download?jobId=….
--
--  Schema notes:
--    - status is a string-typed state machine (not a pg ENUM — text + CHECK is
--      the same constraint with easier evolution; see 007_action_queue.sql).
--    - pptx_base64 stores the rendered deck inline. Decks are tens of KB and the
--      app has no blob storage yet; this avoids introducing Supabase Storage
--      now. Migrate to a bucket + storage path if volume/size grows.
--    - error_code carries the same public failure codes the route used to
--      return (model_generation_failed | brief_failed_validation |
--      brief_render_failed | required_artifact_missing | …) — never message text.
--    - A partial UNIQUE index enforces at most ONE active (queued|running) job
--      per (tenant, user, deal), so the route's dedupe is race-safe.
--    - RLS is defense-in-depth: routes use the service-role client and scope by
--      tenant_id in-query; the cron worker uses service role (bypasses RLS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS brief_jobs (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id UUID         NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  -- Clerk id of the user who requested the brief.
  user_id        TEXT         NOT NULL,

  -- STATE machine
  status         TEXT         NOT NULL DEFAULT 'queued' CHECK (status IN (
                   'queued',
                   'running',
                   'succeeded',
                   'failed'
                 )),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,

  -- RESULT (populated by the worker on terminal status)
  filename       TEXT,        -- suggested download filename (succeeded)
  bundle_version TEXT,        -- deterministic source-bundle version (succeeded)
  model_id       TEXT,        -- model tier used (succeeded)
  pptx_base64    TEXT,        -- rendered .pptx, base64-encoded (succeeded)
  error_code     TEXT,        -- public failure code (failed) — never message text
  attempts       INT          NOT NULL DEFAULT 0
);

-- updated_at-style trigger — auto-stamp finished_at on terminal transition.
CREATE OR REPLACE FUNCTION brief_jobs_set_finished_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('succeeded', 'failed') AND NEW.finished_at IS NULL THEN
    NEW.finished_at = NOW();
  END IF;
  IF NEW.status = 'running' AND NEW.started_at IS NULL THEN
    NEW.started_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brief_jobs_set_finished_at ON brief_jobs;
CREATE TRIGGER trg_brief_jobs_set_finished_at
  BEFORE UPDATE ON brief_jobs
  FOR EACH ROW EXECUTE FUNCTION brief_jobs_set_finished_at();

-- Worker claim path: oldest queued job first.
CREATE INDEX IF NOT EXISTS idx_brief_jobs_queued
  ON brief_jobs(created_at)
  WHERE status = 'queued';

-- Client status/read path.
CREATE INDEX IF NOT EXISTS idx_brief_jobs_user_deal
  ON brief_jobs(user_id, opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brief_jobs_tenant_status
  ON brief_jobs(tenant_id, status, created_at DESC);

-- At most ONE active job per (tenant, user, deal) — race-safe dedupe.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_brief_jobs_active
  ON brief_jobs(tenant_id, user_id, opportunity_id)
  WHERE status IN ('queued', 'running');

ALTER TABLE brief_jobs ENABLE ROW LEVEL SECURITY;

-- Read: tenant members can read their tenant's jobs. Service role bypasses RLS.
CREATE POLICY brief_jobs_read ON brief_jobs
  FOR SELECT USING (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR
    tenant_id IN (
      SELECT t.id FROM tenants t
      WHERE t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- Write: same tenant scope. Insert/update land through service-role routes, so
-- this is defense-in-depth.
CREATE POLICY brief_jobs_write ON brief_jobs
  FOR INSERT WITH CHECK (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    OR
    tenant_id IN (
      SELECT t.id FROM tenants t
      WHERE t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

COMMENT ON TABLE brief_jobs IS
  'Async job ledger for internal executive-brief generation. POST enqueues; a '
  'Vercel cron worker processes; the client polls status and downloads the '
  'stored .pptx. Status machine: queued -> running -> succeeded|failed.';
