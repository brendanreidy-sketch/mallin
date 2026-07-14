-- 009_cockpit_events.sql
--
-- Lightweight behavioral instrumentation for the demo cockpit.
--
-- We're not building an analytics platform — we're answering one
-- specific question: where does operational trust form when an
-- operator sees Mallin for the first time? The premise is that
-- trust forms in evidence + timing + attribution + specificity,
-- NOT in the recommendation surface itself. This table captures
-- the four interactions that test that premise:
--
--   1. time-to-first-scroll (do they pause on the focus block, or
--      scroll past immediately?)
--   2. time spent above the fold (how long does the PDF block hold
--      attention before they scroll?)
--   3. evidence expand/collapse (do they open "Pattern observed
--      across the corpus →"?)
--   4. hover dwell on evidence attribution lines (do they linger on
--      "Marcus Hale · Champion · call 5 · yesterday" — the trust-
--      forming row?)
--
-- Scope: events only fire for tenants where is_demo=true. Real
-- tenants are not instrumented. Reviewed manually via SQL after
-- design-partner sessions, NOT exposed as a dashboard.

CREATE TABLE IF NOT EXISTS cockpit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       text NOT NULL,           -- Clerk user_id
  session_id    text NOT NULL,           -- random per-page-load id (groups events from one visit)
  event_type    text NOT NULL,           -- 'first_scroll', 'pdf_visible', 'pdf_hidden', 'pattern_toggle', 'attribution_hover'
  event_data    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ms_since_load integer,                 -- milliseconds since page load (for ordering/timing analysis)
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

-- Most queries will be: events for one tenant ordered by time within
-- a session. Index supports that pattern + the demo cohort filter.
CREATE INDEX IF NOT EXISTS idx_cockpit_events_tenant_session
  ON cockpit_events (tenant_id, session_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_cockpit_events_type_occurred
  ON cockpit_events (event_type, occurred_at DESC);

COMMENT ON TABLE cockpit_events IS
  'Behavioral instrumentation for demo cockpit sessions. Captures the four interactions that test whether trust forms in evidence (vs in the recommendation). Demo tenants only. Reviewed manually via SQL after each design-partner session; NOT exposed as a dashboard surface — analytics-as-feature is explicitly NOT the goal.';
