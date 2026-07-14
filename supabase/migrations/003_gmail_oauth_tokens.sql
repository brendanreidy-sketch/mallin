-- ============================================================================
--  003 — Gmail OAuth token storage
-- ============================================================================
--  Per-user (not per-tenant) Gmail OAuth tokens. Each rep connects their own
--  Google account; the drafts go into their own Drafts folder.
--
--  Refresh tokens are long-lived (do not expire unless the user revokes);
--  access tokens are short-lived (1 hour). The token helper at
--  lib/auth/gmail-oauth.ts reads from this table and refreshes when the
--  stored access_token is within 60s of expiry.
--
--  Encryption: Supabase encrypts at rest by default. For an additional layer
--  (pgcrypto column-level encryption), see TODO at end of file — out of scope
--  for Phase B but worth doing before broad rollout.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gmail_oauth_tokens (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  TEXT         NOT NULL UNIQUE, -- Clerk user_id of the rep
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_email             TEXT         NOT NULL,        -- the connected gmail address
  access_token             TEXT         NOT NULL,
  refresh_token            TEXT         NOT NULL,
  expires_at               TIMESTAMPTZ  NOT NULL,
  scope                    TEXT         NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_oauth_tenant ON gmail_oauth_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gmail_oauth_expires ON gmail_oauth_tokens(expires_at);

-- updated_at trigger
CREATE OR REPLACE FUNCTION gmail_oauth_tokens_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gmail_oauth_tokens_updated_at ON gmail_oauth_tokens;
CREATE TRIGGER trg_gmail_oauth_tokens_updated_at
  BEFORE UPDATE ON gmail_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION gmail_oauth_tokens_updated_at();

-- RLS: a user can only see their own tokens. Service role bypasses.
ALTER TABLE gmail_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_oauth_tokens_self ON gmail_oauth_tokens;
CREATE POLICY gmail_oauth_tokens_self
  ON gmail_oauth_tokens
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ============================================================================
-- TODO (pre-rollout, not Phase B):
--   * Column-level encryption for access_token + refresh_token via pgcrypto
--     (so service role compromise doesn't expose tokens). The token helper
--     would encrypt on write, decrypt on read.
--   * Periodic refresh-token sanity check (Google sometimes revokes after
--     7d if app is unverified).
-- ============================================================================
