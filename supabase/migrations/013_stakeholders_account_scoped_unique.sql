-- Stakeholder identity is account-scoped, not tenant-scoped.
--
-- Diagnosis: the original unique constraint
--   (tenant_id, source_system, source_external_id)
-- allowed cross-account mutation. When two accounts in the same tenant
-- generated the same source_external_id (e.g. "sth_cfo" derived from the
-- name "CFO" on participant extraction), the second upsert silently
-- UPDATED the existing row, including its account_id. Historical
-- artifacts that referenced the original record kept the stakeholder_id
-- but the record now pointed at a different account.
--
-- Pennrose × Flow Properties test (May 17 2026) surfaced this: stakeholder
-- 272c6fdc-b987-43da-87e5-459dc35697dd was created May 15 17:02:46 as
-- Flow's CFO, then mutated May 17 23:05 to Pennrose's CFO. Flow's
-- artifact at 6d05bdbc still references it as a Flow stakeholder; the
-- record now claims to belong to Pennrose. Validator Check 3 was
-- correct at validation time; the bug is temporal mutation.
--
-- Fix: account_id participates in the uniqueness key. Two accounts in
-- the same tenant can both have a stakeholder with
-- source_external_id="sth_cfo" — they are distinct records.
--
-- The companion code change (scripts/intelligence/ingest-transcript.ts)
-- updates the onConflict clause to include account_id.
--
-- Same-account name fragmentation (sth_cristi vs sth_cristi_resciniti as
-- two records for one person) is OUT OF SCOPE for this migration —
-- separate problem requiring fuzzy matching, not just constraint tightening.

DO $$ BEGIN
  -- Drop the old tenant-scoped constraint if present
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stakeholders'
      AND constraint_name = 'stakeholders_tenant_source_external_unique'
  ) THEN
    ALTER TABLE stakeholders
      DROP CONSTRAINT stakeholders_tenant_source_external_unique;
  END IF;

  -- Add the new account-scoped constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stakeholders'
      AND constraint_name = 'stakeholders_tenant_account_source_external_unique'
  ) THEN
    ALTER TABLE stakeholders
      ADD CONSTRAINT stakeholders_tenant_account_source_external_unique
      UNIQUE (tenant_id, account_id, source_system, source_external_id);
  END IF;
END $$;

-- internal_participants has the same shape and the same bug. Apply the
-- same fix.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'internal_participants'
      AND constraint_name = 'internal_participants_tenant_source_external_unique'
  ) THEN
    ALTER TABLE internal_participants
      DROP CONSTRAINT internal_participants_tenant_source_external_unique;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'internal_participants'
      AND constraint_name = 'internal_participants_tenant_account_source_external_unique'
  ) THEN
    ALTER TABLE internal_participants
      ADD CONSTRAINT internal_participants_tenant_account_source_external_unique
      UNIQUE (tenant_id, account_id, source_system, source_external_id);
  END IF;
END $$;
