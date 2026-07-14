-- ===========================================================================
--  sf_writes_audit — permanent record of every Salesforce write attempt
-- ===========================================================================
--
--  Purpose:
--    The agentic loop's accountability layer. Every time we PATCH or
--    CREATE in Salesforce — whether successful or failed — this table
--    gets a row. Combined with sf_opportunity_links, this answers:
--      - Who confirmed the substrate↔SF mapping?
--      - When did we write to SF, and what?
--      - Did the write succeed? If not, why?
--      - What was the exact field-level payload?
--      - Was this a dry-run or an actual write?
--
--  Design decisions:
--    1. ADDITIVE — no changes to existing tables.
--    2. NEVER DELETED — even soft-deletes don't apply. This is the
--       permanent log. If you want to redact, do it column-by-column
--       (set body_redacted=true) but keep the row.
--    3. FK to sf_opportunity_links.id — every write must reference a
--       confirmed link. This is enforced at the route layer too.
--    4. Field-level breakdown — body is JSONB, but we also denormalize
--       attempted_field_count + succeeded_field_count for fast queries.
--    5. dry_run flag — distinguishes preview-only renders from actual
--       SF API calls. Both rows are kept; only dry_run=false counts as
--       a real write.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS sf_writes_audit (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The link this write was performed under. NOT NULL — every write
  -- must come from a confirmed match.
  link_id             uuid        NOT NULL REFERENCES sf_opportunity_links(id),
  -- FK to opportunities(id). NO ON DELETE clause = NO ACTION (default)
  -- — the audit ledger is permanent. If a deal is deleted, the FK
  -- forces an explicit decision (move audit rows or refuse the delete)
  -- rather than silently losing the trace.
  opportunity_id      uuid        NOT NULL REFERENCES opportunities(id),
  sf_opp_id           text        NOT NULL,
  sf_instance_url     text        NOT NULL,
  -- Groups related writes triggered by a single action. v1 is one-call
  -- → one-write so this can be NULL; required as soon as the apply
  -- route batches (one call → field updates + Task create + note).
  -- Free-form text by design — callers can put a Gong call id, a
  -- substrate event id, a uuid, whatever maps to their grouping unit.
  correlation_id      text,
  -- The actual REST request that was sent (or would have been sent).
  rest_url            text        NOT NULL,
  rest_method         text        NOT NULL CHECK (rest_method IN ('PATCH', 'POST', 'GET')),
  body                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Field-level outcome. Each entry: {field, status: 'ok'|'rejected'|'sf_error', error?}.
  -- Allows partial-success tracking when SF accepts some fields and rejects others.
  field_outcomes      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  attempted_field_count int       NOT NULL DEFAULT 0,
  succeeded_field_count int       NOT NULL DEFAULT 0,
  -- Top-level outcome.
  status              text        NOT NULL CHECK (status IN ('dry_run', 'success', 'partial', 'failed', 'rejected_pre_flight')),
  status_detail       text,                          -- e.g. "no_active_link", "readonly_field_blocked"
  -- Was this a dry-run preview, or an actual SF API call?
  dry_run             boolean     NOT NULL,
  -- HTTP status from SF (null on dry-run or pre-flight reject).
  sf_response_status  int,
  sf_response_body    jsonb,                         -- raw SF response, redacted of access tokens
  -- Provenance.
  triggered_by        text,                          -- email/user id; null until auth wired
  triggered_by_route  text,                          -- e.g. "/api/sf/apply-updates"
  call_source         text,                          -- e.g. "stackadapt_intro_call_2026-03-06" — when the AI surfaced it
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Common queries:
--   1. "What writes happened for this deal?" → opportunity_id index
--   2. "What writes happened today?" → created_at index
--   3. "What writes failed?" → status index
CREATE INDEX IF NOT EXISTS idx_sf_writes_audit_opportunity
  ON sf_writes_audit (opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sf_writes_audit_link
  ON sf_writes_audit (link_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sf_writes_audit_status
  ON sf_writes_audit (status)
  WHERE status IN ('failed', 'partial', 'rejected_pre_flight');

CREATE INDEX IF NOT EXISTS idx_sf_writes_audit_recent
  ON sf_writes_audit (created_at DESC);

-- Group all rows from a single action (call → multiple writes).
CREATE INDEX IF NOT EXISTS idx_sf_writes_audit_correlation
  ON sf_writes_audit (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE sf_writes_audit IS
  'Permanent log of every SF write attempt (real or dry-run). Joined to sf_opportunity_links for full audit chain: who confirmed the match, who triggered the write, what was sent, what succeeded.';
COMMENT ON COLUMN sf_writes_audit.link_id IS
  'FK to sf_opportunity_links — every write must be against a confirmed link.';
COMMENT ON COLUMN sf_writes_audit.body IS
  'The PATCH body that was sent (or would have been sent on dry-run). JSONB for query flexibility.';
COMMENT ON COLUMN sf_writes_audit.field_outcomes IS
  'Per-field result. Schema: [{field: string, status: "ok"|"rejected"|"sf_error", error?: string}]';
COMMENT ON COLUMN sf_writes_audit.dry_run IS
  'True for preview renders; false for real SF API calls. Only dry_run=false counts as an actual write.';
COMMENT ON COLUMN sf_writes_audit.status IS
  'dry_run | success | partial | failed | rejected_pre_flight. Pre-flight rejection happens before any SF call (e.g., link missing, readonly field detected).';
COMMENT ON COLUMN sf_writes_audit.correlation_id IS
  'Groups related writes from a single triggering action. Free-form text. Recommended: derive from the source event id (e.g., Gong call id). Multiple rows sharing a correlation_id represent one logical action.';
COMMENT ON COLUMN sf_writes_audit.call_source IS
  'Identifier of the call/source that surfaced this update (e.g., Gong call id, transcript filename). Provenance trail for the agentic loop.';
