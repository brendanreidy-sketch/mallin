-- ============================================================================
--  026 — Tenant contact name (first + last), captured at free signup
-- ============================================================================
--  Free signup collects the user's name via Clerk; ensurePersonalWorkspace()
--  stores it here, alongside owner_email (migration 018), so the contact's
--  name + email live together on the same tenant row as structured fields
--  (not just concatenated into the display `name`).
--
--  Optional / last-write-wins. Never required — signup must not break if these
--  are absent, so the write is a separate best-effort update.
-- ============================================================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;
