-- 010_account_intelligence.sql
--
-- Pass 0 / Account Intelligence artifacts.
--
-- The stable-cognition contract for account-level intelligence:
-- account facts + recent events + stakeholder enrichment + competitive
-- context + pre-call brief. Source-agnostic by design — the same
-- schema accommodates manual research today + automated sources later
-- (Crunchbase, Apollo, Contify, etc.).
--
-- One row per (tenant, account) is_current=true at a time. New
-- artifacts mark the previous current as not-current (same pattern
-- as execution_artifacts).
--
-- See memory: stable_cognition_layer.md for the architectural principle.

CREATE TABLE IF NOT EXISTS account_intelligence_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  /** Optional FK to a specific opportunity — same account may have
   *  multiple opps, but intelligence is account-shaped, not deal-shaped.
   *  When opp is set, the pre_call_brief inside the artifact JSON
   *  is tuned to that specific opp. */
  opportunity_id  uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  artifact        jsonb NOT NULL,
  /** Which source(s) populated this artifact. Stored alongside the
   *  in-JSON metadata.sources_used for queryability without parsing. */
  primary_source  text NOT NULL CHECK (
    primary_source IN ('manual', 'crunchbase', 'apollo', 'people_data_labs',
                        'contify', 'newsapi', 'web_search', 'company_website',
                        'customer_input', 'mixed')
  ),
  is_current      boolean NOT NULL DEFAULT true,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Most reads will be: most-recent artifact for a given (tenant, account).
CREATE INDEX IF NOT EXISTS idx_aia_tenant_account_current
  ON account_intelligence_artifacts (tenant_id, account_id, is_current);

-- Opportunity-scoped reads (e.g. when rendering /prep for a specific deal).
CREATE INDEX IF NOT EXISTS idx_aia_opp_current
  ON account_intelligence_artifacts (opportunity_id, is_current)
  WHERE opportunity_id IS NOT NULL;

-- Ensure only one current artifact per (tenant, account) — prevents
-- accidental dupes during seed-script re-runs.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_aia_current_per_account
  ON account_intelligence_artifacts (tenant_id, account_id)
  WHERE is_current = true;

COMMENT ON TABLE account_intelligence_artifacts IS
  'Pass 0 / Account Intelligence artifacts — account-level enrichment (company facts, recent events, stakeholder backgrounds, competitive context, pre-call brief). Stable cognition contract, source-agnostic. Manual today, automated sources later. is_current=true is the one rendered in /prep; older ones are kept for diff / audit.';
