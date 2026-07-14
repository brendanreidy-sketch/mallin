-- Add UNIQUE constraints to support upserts via source_external_id
-- (matches the convention already in place on accounts, opportunities, calls,
-- emails, activities)

-- stakeholders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stakeholders'
      AND constraint_name = 'stakeholders_tenant_source_external_unique'
  ) THEN
    ALTER TABLE stakeholders
      ADD CONSTRAINT stakeholders_tenant_source_external_unique
      UNIQUE (tenant_id, source_system, source_external_id);
  END IF;
END $$;

-- internal_participants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'internal_participants'
      AND constraint_name = 'internal_participants_tenant_source_external_unique'
  ) THEN
    ALTER TABLE internal_participants
      ADD CONSTRAINT internal_participants_tenant_source_external_unique
      UNIQUE (tenant_id, source_system, source_external_id);
  END IF;
END $$;

-- touches
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'touches'
      AND constraint_name = 'touches_tenant_source_external_unique'
  ) THEN
    ALTER TABLE touches
      ADD CONSTRAINT touches_tenant_source_external_unique
      UNIQUE (tenant_id, source_system, source_external_id);
  END IF;
END $$;
