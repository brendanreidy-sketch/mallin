-- ============================================================================
--  013 — pilot_signups: inbound pilot-program signups from mallin.io
-- ============================================================================
--  Until now, the only "intake funnel" for Mallin was a mailto: link from
--  the landing page. That has two problems: (1) no record of who landed
--  where in our own substrate, and (2) no structured fields to triage
--  against ("just missed a quarter" vs "scaling fast" vs "memory loss"
--  are the three buying triggers we want to qualify on).
--
--  This table captures every pilot-page submission. Brendan also receives
--  a copy by email (via the Resend HTTP endpoint in lib/email/resend.ts)
--  so the signup workflow doesn't depend on him watching this table.
--
--  Schema notes:
--    - No tenant_id: pilot signups are PRE-tenant. They become tenants
--      only after Brendan accepts them into the cohort.
--    - email is unique-cased (LOWER(email)) so a re-submission updates
--      the existing row rather than creating duplicates. The API route
--      treats a 23505 unique-violation as success (don't leak which
--      emails are in the DB).
--    - current_stack TEXT[] captures the integration checkboxes the
--      prospect ticked — Salesforce, HubSpot, Outreach, Gong, etc.
--      Helps us prioritize integrations against actual demand.
--    - trigger maps to the three recurring buying triggers from the
--      landing page ("missed_quarter" | "scaling" | "memory_loss" |
--      "other"). NULL = not provided.
--    - status is the lifecycle state we manage as the deal moves —
--      'new' (untouched) → 'contacted' → 'in_pilot' → 'closed_won' |
--      'closed_lost'. Updated by hand for now; will be agentic later.
--    - ip_hash is a SHA-256 of x-forwarded-for, truncated to 16 hex
--      chars. NOT the raw IP — we don't want PII we don't need. Used
--      only to detect "same source spam" patterns.
--    - source / utm_* let us track which surface a signup came from
--      once we run more than one page.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pilot_signups (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact
  name            TEXT         NOT NULL,
  email           TEXT         NOT NULL,
  company         TEXT         NOT NULL,
  role            TEXT,
  team_size       TEXT,
  current_stack   TEXT[],

  -- Context
  trigger         TEXT,
  notes           TEXT,

  -- Source / instrumentation
  source          TEXT         NOT NULL DEFAULT 'pilot_page',
  utm_source      TEXT,
  utm_campaign    TEXT,
  utm_medium      TEXT,
  user_agent      TEXT,
  ip_hash         TEXT,

  -- Lifecycle
  status          TEXT         NOT NULL DEFAULT 'new',
  contacted_at    TIMESTAMPTZ,
  pilot_started_at TIMESTAMPTZ,

  -- Timestamps
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Lookups
CREATE INDEX IF NOT EXISTS idx_pilot_signups_status     ON pilot_signups(status);
CREATE INDEX IF NOT EXISTS idx_pilot_signups_created_at ON pilot_signups(created_at DESC);

-- Case-insensitive email uniqueness — re-submissions silently update
-- (handled at the API layer; the DB just enforces dedupe).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pilot_signups_email_unique
  ON pilot_signups(LOWER(email));

COMMENT ON TABLE pilot_signups IS
  'Inbound pilot-program signups from the public mallin.io/pilot page.';
