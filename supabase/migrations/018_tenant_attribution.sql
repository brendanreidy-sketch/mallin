-- Passive signup attribution — captured with ZERO added friction (no new
-- signup fields). owner_email + email_domain come from Clerk on workspace
-- creation (a corporate domain is free firmographics + a team-formation
-- signal: 2 signups from the same domain = a B2B/pilot lead). utm_* + referrer
-- come from a first-touch cookie set on /start.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS email_domain TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT;

CREATE INDEX IF NOT EXISTS tenants_email_domain_idx ON tenants (email_domain);
