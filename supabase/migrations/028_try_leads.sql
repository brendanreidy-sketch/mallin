-- 028_try_leads.sql
--
-- Lead capture from the anonymous /try flow. Today someone can build a free
-- brief and leave with zero footprint. This stores the email they give at the
-- exit-intent "save your brief" box, along with the INTENT they already handed
-- us (the account they're researching, what they sell, who's in the room) and
-- the generated brief itself — so (a) the founder gets a qualified lead with
-- ICP context, and (b) the brief can be imported when they later sign up with
-- the same email.
--
-- No FK to tenants: the lead exists BEFORE any account/tenant. Best-effort
-- writes from /api/try-brief/save; nullable so a partial capture still lands.

CREATE TABLE IF NOT EXISTS try_leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  name             text,
  company          text,            -- the account they're researching
  product_context  text,            -- what they sell
  stakeholders     text,            -- who's in the room
  account_name     text,            -- resolved account name from the brief
  artifact         jsonb,           -- the generated brief, for signup-import
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_try_leads_email ON try_leads (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_try_leads_time  ON try_leads (created_at DESC);
