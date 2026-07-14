-- 024_anon_brief_log.sql
-- Rate-limit ledger for the public, no-auth "try one call" surface (/try →
-- /api/try-brief). One row per anonymous brief attempt. The route enforces a
-- per-IP daily cap and a global daily cap off this table, so an open,
-- unauthenticated LLM + web-search pipeline can't be abused into a cost hole.
-- Nothing here is user data — just an IP + timestamp for throttling.

CREATE TABLE IF NOT EXISTS anon_brief_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS anon_brief_log_ip_time ON anon_brief_log (ip, created_at);
CREATE INDEX IF NOT EXISTS anon_brief_log_time    ON anon_brief_log (created_at);
