-- ============================================================================
--  015 — rep_notes: Mallin-side persistence + sync state for rep notes
-- ============================================================================
--  Mallin is the working layer; the customer's CRM is the governed system of
--  record. Rep notes written in Mallin are synced 1:1 to the CRM via the
--  provider-neutral boundary at lib/crm.createNote(). This table holds:
--
--    1. Mallin-side cache of the note body (for fast rendering)
--    2. Sync state (status, external_activity_id, retry/failure tracking)
--    3. Mallin-only metadata that doesn't belong in the CRM:
--         - is_pattern  → flags this note as cross-deal wisdom (Mallin's
--                         brief generator will surface it on future similar
--                         deals; the CRM itself just sees a normal note)
--         - is_private  → maps to the CRM's native private-note flag when
--                         supported by the provider
--
--  Doctrine:
--    - memory:write_through_operating_layer.md
--    - memory:write_through_surface_contract.md (the 6 rules + provider-
--      neutral architectural rule + 8-box PR review checklist)
--
--  Body storage rationale (per surface-contract rule 6 — "no Mallin
--  durable content"):
--    - CRM is authoritative. The body column here is a cache, not the
--      system of record. If a rep deletes the CRM record, the Mallin row
--      becomes orphan — which is the correct behavior per the deletion
--      test in the surface contract.
--    - We keep the body in Mallin so the cockpit can render notes without
--      a CRM round-trip on every page load. Stale-cache risk is acceptable
--      for v1; later we add a refresh-on-read or webhook-driven invalidation.
--
--  Provider neutrality:
--    - No HubSpot/Salesforce/Pipedrive references in this schema.
--    - The CRM's note ID lives in external_activity_id (generic name).
--    - The CRM provider for any given note is resolved via
--      tenants.crm_provider at write time, not stored on the row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rep_notes (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Mallin-side linkage for fast queries. Cascades when the parent is deleted.
  opportunity_id           UUID         REFERENCES opportunities(id) ON DELETE CASCADE,
  account_id               UUID         REFERENCES accounts(id) ON DELETE CASCADE,

  -- Where this note was authored in the brief — for future analytics +
  -- contextual retrieval ("show me past notes from this section on
  -- similar deals"). Optional; null = global note on the deal.
  section_key              TEXT,

  -- Author. Clerk user_id is the canonical identifier; email is captured
  -- at write time for CRM author attribution (some providers want an
  -- email rather than an internal ID to set the activity owner).
  created_by_user_id       TEXT         NOT NULL,
  created_by_email         TEXT,

  -- Body — cached here for rendering. The CRM holds the authoritative
  -- copy once the note syncs. See "Body storage rationale" above.
  body                     TEXT         NOT NULL,

  -- Where the note attaches in the CRM:
  --   'deal'    → CRM note on the opportunity/deal record
  --   'account' → CRM note on the company/account record
  -- 'contact' is reserved for v2 once we surface stakeholder-attached notes.
  attach_to                TEXT         NOT NULL
                                        CHECK (attach_to IN ('deal', 'account')),

  -- Mallin-only metadata. Allowed per surface-contract rule 6 because it's
  -- non-authoritative ABOUT a CRM record, not a replacement FOR it.
  -- Deleting the CRM record correctly leaves these orphan (deletion test).
  is_pattern               BOOLEAN      NOT NULL DEFAULT FALSE,
  is_private               BOOLEAN      NOT NULL DEFAULT FALSE,

  -- CRM sync state. Provider-neutral by design:
  --   - The active provider lives in tenants.crm_provider
  --   - The CRM-side ID is just external_activity_id (no
  --     'hubspot_engagement_id' / 'salesforce_task_id' anywhere)
  --   - sync_status transitions: pending → syncing → synced
  --                              pending → syncing → failed → pending (retry)
  sync_status              TEXT         NOT NULL DEFAULT 'pending'
                                        CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  external_activity_id     TEXT,                       -- the CRM's id for the synced note
  external_object_type     TEXT,                       -- e.g. 'note' / 'engagement' — neutral label
  last_sync_at             TIMESTAMPTZ,
  failed_reason            TEXT,                       -- human-readable error from the adapter
  retry_count              INTEGER      NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Integrity: a note must attach to something that exists on the Mallin
  -- side too. attach_to='deal' requires opportunity_id; attach_to='account'
  -- requires account_id. Both can be set on a deal-scoped note (the deal
  -- naturally belongs to an account), but at least the canonical target
  -- has to be present.
  CONSTRAINT rep_notes_attach_target CHECK (
    (attach_to = 'deal'    AND opportunity_id IS NOT NULL) OR
    (attach_to = 'account' AND account_id     IS NOT NULL)
  )
);

-- Hot-path queries:
--   1. "all notes for this deal, newest first" — deal-scoped reads
CREATE INDEX IF NOT EXISTS idx_rep_notes_tenant_opp
  ON rep_notes(tenant_id, opportunity_id, created_at DESC);

--   2. "all notes on this account, newest first" — account-scoped reads
CREATE INDEX IF NOT EXISTS idx_rep_notes_tenant_account
  ON rep_notes(tenant_id, account_id, created_at DESC);

--   3. "all cross-deal patterns from this tenant" — pattern surfacing
--      Partial index: only indexes rows that are actually patterns.
CREATE INDEX IF NOT EXISTS idx_rep_notes_pattern
  ON rep_notes(tenant_id, created_at DESC)
  WHERE is_pattern = TRUE;

--   4. "notes that still need sync attention" — retry worker
--      Partial index: pending + failed only.
CREATE INDEX IF NOT EXISTS idx_rep_notes_sync_attention
  ON rep_notes(tenant_id, updated_at)
  WHERE sync_status IN ('pending', 'failed');

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE rep_notes ENABLE ROW LEVEL SECURITY;

-- Service-role is the only access path in v1 (API routes use it after
-- validating Clerk auth at the handler layer). No policies needed since
-- service-role bypasses RLS — the deny-by-default posture is sufficient.

COMMENT ON TABLE rep_notes IS
  'Mallin-side persistence + sync state for rep notes written through to the customer''s CRM. The CRM is the system of record; this table caches the body and tracks Mallin-only metadata (pattern flag, private flag, sync state). See memory:write_through_operating_layer.md and memory:write_through_surface_contract.md.';

COMMENT ON COLUMN rep_notes.body IS
  'Cached note body. The CRM holds the authoritative copy once sync_status = ''synced''. Mallin renders from this cache to avoid a CRM round-trip on every page load.';

COMMENT ON COLUMN rep_notes.external_activity_id IS
  'CRM-side ID for the synced note (HubSpot engagement id, Salesforce task id, etc.) — provider-neutral name. Resolves to the right CRM via tenants.crm_provider.';

COMMENT ON COLUMN rep_notes.is_pattern IS
  'Mallin-only flag. Surfaces this note to the brief generator on similar future deals within the same tenant. Invisible to the CRM. See memory:write_through_surface_contract.md.';

COMMENT ON COLUMN rep_notes.is_private IS
  'Maps to the CRM''s native private-note flag at sync time (when the provider supports it). Mallin does NOT invent a parallel visibility model.';
