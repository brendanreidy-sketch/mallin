-- 033_ae_profile.sql
-- The AE's own intro profile — what goes on the "Meet your rep" slide of a
-- customer-facing deck. Name already lives on the tenant row (first_name /
-- last_name, migration 026); this adds the LinkedIn-derived title + bio + URL,
-- plus an explicit CONFIRMED flag.
--
-- Governance: ae_profile_confirmed gates whether the intro slide renders. The
-- enrichment agent may PROPOSE a title/bio/LinkedIn match, but nothing lands on
-- a deck the customer sees until the AE has confirmed it's them (AI proposes,
-- human governs). A wrong LinkedIn match on your own intro slide is the one
-- place a guess is genuinely embarrassing, so the deck reads these only when
-- confirmed is true.
--
-- All optional / last-write-wins — never required, signup must not break.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ae_title             TEXT,
  ADD COLUMN IF NOT EXISTS ae_linkedin_url      TEXT,
  ADD COLUMN IF NOT EXISTS ae_bio               TEXT,
  ADD COLUMN IF NOT EXISTS ae_profile_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
