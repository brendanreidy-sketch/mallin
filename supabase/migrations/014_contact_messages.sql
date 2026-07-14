-- ============================================================================
--  014 — contact_messages: inbound contact-form messages from mallin.io
-- ============================================================================
--  Companion table to pilot_signups (013). Whereas pilot_signups is the
--  structured intake for prospects ready to start a pilot, this table
--  captures lighter-touch inbound: questions, partnership inquiries,
--  general "interested but not ready to commit" outreach.
--
--  Same patterns as 013:
--    - Public-write via /api/contact (service role bypasses RLS)
--    - Unique-cased email index for dedupe (re-submissions silently
--      treated as success at the API layer)
--    - ip_hash, not raw IP (PII minimization)
--    - lifecycle status: 'new' | 'responded' | 'closed'
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact + content
  name            TEXT         NOT NULL,
  email           TEXT         NOT NULL,
  message         TEXT         NOT NULL,

  -- Source / instrumentation
  source          TEXT         NOT NULL DEFAULT 'contact_page',
  utm_source      TEXT,
  utm_campaign    TEXT,
  utm_medium      TEXT,
  user_agent      TEXT,
  ip_hash         TEXT,

  -- Lifecycle
  status          TEXT         NOT NULL DEFAULT 'new',
  responded_at    TIMESTAMPTZ,

  -- Timestamps
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status     ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at DESC);

COMMENT ON TABLE contact_messages IS
  'Inbound contact-form messages from the public mallin.io/contact page.';
