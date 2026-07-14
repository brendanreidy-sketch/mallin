-- ============================================================================
--  004 — HubSpot OAuth token storage
-- ============================================================================
--  Per-tenant (not per-user) HubSpot tokens. Unlike Gmail, where every rep
--  connects their own mailbox, HubSpot is typically one connection per
--  organization (the admin / RevOps lead connects once, and the whole team
--  uses the same access token to read/write the shared CRM).
--
--  Refresh tokens are long-lived (do not expire unless the user revokes);
--  access tokens are short-lived (~30 min for HubSpot OAuth). The token
--  helper at lib/auth/hubspot-oauth.ts reads from this table and refreshes
--  when the stored access_token is within 60s of expiry.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hubspot_oauth_tokens (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  hub_id                   TEXT         NOT NULL,         -- HubSpot portal ID (from /oauth/v1/access-tokens/<token>)
  hub_domain               TEXT,                          -- the HubSpot subdomain (e.g. "acme")
  connected_by_user_id     TEXT         NOT NULL,         -- Clerk user_id of who initiated the connect
  access_token             TEXT         NOT NULL,
  refresh_token            TEXT         NOT NULL,
  expires_at               TIMESTAMPTZ  NOT NULL,
  scope                    TEXT         NOT NULL,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubspot_oauth_expires ON hubspot_oauth_tokens(expires_at);

CREATE OR REPLACE FUNCTION hubspot_oauth_tokens_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hubspot_oauth_tokens_updated_at ON hubspot_oauth_tokens;
CREATE TRIGGER trg_hubspot_oauth_tokens_updated_at
  BEFORE UPDATE ON hubspot_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION hubspot_oauth_tokens_updated_at();

-- RLS: tenant-scoped. A user only sees their own tenant's HubSpot tokens.
-- Service role bypasses (this is what the adapter uses).
ALTER TABLE hubspot_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hubspot_oauth_tokens_tenant ON hubspot_oauth_tokens;
CREATE POLICY hubspot_oauth_tokens_tenant
  ON hubspot_oauth_tokens
  FOR ALL
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE slug = auth.jwt()->>'org_id'
    )
  );

-- ============================================================================
-- TODO (pre-rollout, not Pass 1):
--   * Column-level encryption for access_token + refresh_token via pgcrypto.
--   * Webhook subscription so we know if HubSpot revokes the token
--     (currently we discover this on the next failed refresh).
-- ============================================================================
