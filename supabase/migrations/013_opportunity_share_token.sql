-- 013_opportunity_share_token.sql
--
-- Public-share-link feature: adds a per-opportunity `share_token`
-- that, when set, exposes a sanitized read-only render of the
-- account intelligence artifact at /share/<token>.
--
-- Default NULL — no opportunity is shareable until an owner explicitly
-- sets a token. Tokens are UUIDs (unguessable). Regenerating the
-- token revokes the previous share link.
--
-- The /share/[token] route does NOT enforce tenant membership; the
-- gate is the secret token itself. Sanitization (dropping rep-only
-- substrate sections) happens in the rendering component
-- (app/share/[token]/SanitizedCockpit.tsx).

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS share_token UUID;

-- Unique partial index — only enforce uniqueness across non-null
-- tokens. Lets most rows stay NULL without violating uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_share_token
  ON opportunities(share_token)
  WHERE share_token IS NOT NULL;
