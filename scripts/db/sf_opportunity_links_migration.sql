-- ===========================================================================
--  sf_opportunity_links — substrate ↔ Salesforce link audit table
-- ===========================================================================
--
--  Purpose:
--    Persist "this substrate deal corresponds to this Salesforce
--    opportunity" with an audit trail. This is the trust bridge for
--    every future SF write. Confirming a link is the human gate.
--
--  Design decisions (Brendan-reviewed 2026-05-08):
--    1. ADDITIVE ONLY — no changes to opportunities or any existing table.
--       Easy to drop if we change our mind.
--    2. SOFT DELETE — unlinked_at preserves audit trail. We never
--       hard-delete a confirmed link; we mark it inactive.
--    3. PARTIAL UNIQUE — at most one ACTIVE link per substrate deal at
--       any time. Multiple inactive (unlinked) rows allowed → full
--       history of confirm / unlink / re-confirm cycles.
--    4. ONE TIMESTAMP — confirmed_at IS the row creation time. Per
--       Brendan: "if they mean the same thing, simplify."
--
--  Foreign key:
--    opportunity_id → opportunities.id with ON DELETE CASCADE so a
--    substrate deal deletion takes its links with it (audit row stays
--    via the unlinked_at lifecycle, not via FK preservation).
--
--  Auth:
--    confirmed_by is text and nullable. /sf/diff is unauthenticated in
--    local dev (matches /prep pattern). When Clerk auth lands on this
--    surface, store the email or user id. Until then, null is honest.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS sf_opportunity_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  sf_opp_id       text        NOT NULL,
  sf_instance_url text        NOT NULL,
  confirmed_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_by    text,                        -- nullable: no auth on /sf/diff yet
  unlinked_at     timestamptz,                 -- soft delete; null = active
  notes           text                         -- free-text rep note
);

-- One active link per substrate deal. Multiple unlinked rows allowed
-- (full confirm/unlink history). Partial unique index, not a constraint
-- — Postgres requires the index form for WHERE clauses.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sf_opp_links_active
  ON sf_opportunity_links (opportunity_id)
  WHERE unlinked_at IS NULL;

-- Reverse lookup: SF opp id → substrate deal(s) ever linked.
CREATE INDEX IF NOT EXISTS idx_sf_opp_links_sf_id
  ON sf_opportunity_links (sf_opp_id);

-- Audit-friendly: who confirmed which deals (when filled in).
CREATE INDEX IF NOT EXISTS idx_sf_opp_links_confirmed_by
  ON sf_opportunity_links (confirmed_by)
  WHERE confirmed_by IS NOT NULL;

-- Comments — surfaced in psql \d, useful for future onboarding.
COMMENT ON TABLE sf_opportunity_links IS
  'Substrate ↔ Salesforce opportunity link audit. Created on rep confirmation. Soft-deleted via unlinked_at (history preserved). At most one active link per substrate deal.';
COMMENT ON COLUMN sf_opportunity_links.opportunity_id IS
  'FK to opportunities.id (substrate deal).';
COMMENT ON COLUMN sf_opportunity_links.sf_opp_id IS
  '15- or 18-character Salesforce Opportunity Id.';
COMMENT ON COLUMN sf_opportunity_links.sf_instance_url IS
  'SF instance URL captured at confirmation time (orgs can move).';
COMMENT ON COLUMN sf_opportunity_links.confirmed_at IS
  'When the link was created. Also the row creation time (no separate created_at).';
COMMENT ON COLUMN sf_opportunity_links.confirmed_by IS
  'Email or user id of the rep who confirmed. Nullable until /sf/diff is auth-gated.';
COMMENT ON COLUMN sf_opportunity_links.unlinked_at IS
  'Soft delete timestamp. NULL means link is active. Set when rep unlinks.';
COMMENT ON COLUMN sf_opportunity_links.notes IS
  'Free-text rep note captured at confirmation (e.g. "auto-matched, low confidence, verified manually").';
