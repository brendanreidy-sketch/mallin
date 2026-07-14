-- Billing + free-tier meter: "free for your first 3 deals" → Mallin Pro.
--
-- SAFETY: every column is nullable or has a safe default, and the one
-- backfill marks all EXISTING tenants 'enterprise' (unlimited) — so no
-- current tenant (design partners, demo, the user's own) is ever gated.
-- Only NEW self-serve workspaces are created plan='free', deal_limit=3
-- (see lib/auth/ensure-personal-workspace.ts).
--
-- The intake gate is authoritative on deal_limit (NULL = unlimited);
-- `plan` drives billing state + UI. Demo tenants are exempt via is_demo.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS deal_limit INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Backfill: existing tenants predate the free tier — keep them unlimited.
UPDATE tenants SET plan = 'enterprise' WHERE plan = 'free';

COMMENT ON COLUMN tenants.plan IS 'free | pro | enterprise. Drives billing state + UI; gate is authoritative on deal_limit.';
COMMENT ON COLUMN tenants.deal_limit IS 'Free-tier cap on opportunities. NULL = unlimited. Self-serve free starts at 3; set NULL on Pro upgrade.';
COMMENT ON COLUMN tenants.stripe_customer_id IS 'Stripe Customer id for this tenant (set on first checkout/portal).';
COMMENT ON COLUMN tenants.stripe_subscription_id IS 'Active Mallin Pro subscription id; NULL when not subscribed.';
