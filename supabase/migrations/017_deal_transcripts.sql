-- 017_deal_transcripts.sql
--
-- Persist the raw call transcript per deal. Today the intake agent extracts a
-- transcript, produces the AccountIntelligenceArtifact, and DISCARDS the raw
-- text. The deck-copy step (lib/deck/deck-copy-agent.ts) needs that text to
-- write deal-specific slide copy — so we store it here, keyed by opportunity,
-- and generate the deck narrative lazily on first deck request (cached into the
-- artifact's meeting.sections afterward).
--
-- raw_text can be large (100K+ chars); TEXT is fine. Nullable opportunity/account
-- so a transcript can be saved before those rows resolve. One deal can have
-- multiple transcripts over time (latest wins for deck copy).

CREATE TABLE IF NOT EXISTS deal_transcripts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  opportunity_id  uuid,
  account_id      uuid,
  source          text,            -- origin (file name, "intake", etc.)
  raw_text        text NOT NULL,
  char_count      integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Lookup is always "latest transcript for this opportunity".
CREATE INDEX IF NOT EXISTS idx_deal_transcripts_opp
  ON deal_transcripts (opportunity_id, created_at DESC);

COMMENT ON TABLE deal_transcripts IS
  'Raw call transcripts per deal. Source for the deck-copy step (lib/deck/deck-copy-agent.ts); previously discarded after intake. Latest row per opportunity_id is used.';
