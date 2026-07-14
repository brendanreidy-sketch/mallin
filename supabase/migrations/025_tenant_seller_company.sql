-- The AE's own company, captured at intake (the "Your company" field). Fills
-- the firmographics gap that 018's passive owner_email/email_domain leaves for
-- AEs who sign up on personal email (gmail/yahoo), and feeds the brief's
-- competitive read. Optional, last-write-wins.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS seller_company TEXT;
