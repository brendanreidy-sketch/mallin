-- 029_try_leads_imported.sql
--
-- Marks a captured /try lead as imported into a signed-up workspace, so the
-- signup-import runs once and never double-creates the deal on a later
-- provisioning pass. Nullable; a null imported_at means "not yet claimed."

ALTER TABLE try_leads
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;
