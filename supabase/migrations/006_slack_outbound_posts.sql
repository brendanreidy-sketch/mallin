-- ============================================================================
--  006 — slack_outbound_posts: audit of every alert Mallin posted to Slack
-- ============================================================================
--  Mallin's slack-sink fires alerts to Slack (DMs + channel posts). Up to
--  now those posts left no trace in our own substrate — the only record
--  was in Slack itself. This table changes that: every successful (and
--  every failed) post lands here. The cockpit's Slack-activity panel
--  reads from this table.
--
--  Why audit outbound:
--    1. Reps want to see "what did Mallin tell my team about my deal".
--    2. Managers want a single pane of "who got pinged when, on what".
--    3. The trust progression needs a complete record of what was
--       proposed before measuring response rates.
--    4. Forensics: when an alert misfires, we need the exact payload.
--
--  Schema notes:
--    - opportunity_id is text, not uuid: the slack-sink context carries
--      either an SF opp ID ("006...") or a substrate UUID depending on
--      the caller. We store whatever was used; the reader looks up both.
--    - severity matches the EscalationSeverity union: 'info' | 'warn' |
--      'escalate_to_manager'.
--    - surface = 'dm' or 'channel'. 'dm' implies channel_id is a Slack
--      conversation id, not a public channel.
--    - raw_alert JSONB is the full EscalationAlert at post time. Lets us
--      reconstruct exactly what was sent without parsing the formatted
--      Slack message.
--    - posted_at is when slack-sink resolved (success or failure).
-- ============================================================================

CREATE TABLE IF NOT EXISTS slack_outbound_posts (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHO this is about. opportunity_id is whatever the caller had —
  -- usually the external CRM id (SF "006..." or HubSpot deal id).
  opportunity_id      TEXT,
  tenant_id           UUID         REFERENCES tenants(id) ON DELETE CASCADE,

  -- WHAT was posted
  rule_id             TEXT         NOT NULL,
  rule_label          TEXT,
  severity            TEXT         NOT NULL,
  -- One-line summary surfaced in the cockpit ("HIGH · Champion-commitment warning")
  payload_summary     TEXT         NOT NULL,
  -- Full alert object for forensics + reconstruction.
  raw_alert           JSONB,

  -- WHERE it went
  surface             TEXT         NOT NULL CHECK (surface IN ('dm', 'channel')),
  -- The display name of the target — e.g. "#acme-deal" or "Manager DM"
  channel             TEXT,
  -- Slack's identifiers, for "Open →" deep links into Slack
  channel_id          TEXT,
  message_ts          TEXT,

  -- WHEN
  posted_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- HOW IT WENT
  ok                  BOOLEAN      NOT NULL,
  error               TEXT
);

CREATE INDEX IF NOT EXISTS idx_slack_outbound_opportunity
  ON slack_outbound_posts(opportunity_id, posted_at DESC)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slack_outbound_tenant
  ON slack_outbound_posts(tenant_id, posted_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slack_outbound_posted_at
  ON slack_outbound_posts(posted_at DESC);

-- RLS: the app reads/writes this table exclusively via the service-role client
-- (which bypasses RLS), so enabling it with no policy keeps the public anon /
-- authenticated keys from reading alert payloads. Prod had this enabled manually
-- via the Supabase "Run and enable RLS" prompt (2026-07-16); this line keeps a
-- fresh environment consistent.
ALTER TABLE slack_outbound_posts ENABLE ROW LEVEL SECURITY;
