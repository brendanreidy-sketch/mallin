-- Deal outcomes — closes the action→outcome loop so ROI can be REALIZED, not
-- projected. One row per deal at close, with the two attribution flags that
-- make the ROI defensible: did the risk Mallin flagged actually materialize,
-- and did the rep run the move Mallin recommended.
CREATE TABLE IF NOT EXISTS deal_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  opportunity_id uuid NOT NULL UNIQUE,
  outcome text NOT NULL CHECK (outcome IN ('won', 'lost', 'no_decision')),
  closed_at date,
  amount numeric,
  currency text DEFAULT 'USD',
  -- Attribution (nullable = "not sure / didn't say").
  risk_materialized boolean, -- did the risk Mallin flagged actually happen?
  move_taken boolean,        -- did the rep run the recommended move?
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_outcomes_tenant_idx ON deal_outcomes (tenant_id);

COMMENT ON TABLE deal_outcomes IS 'Deal endings + Mallin attribution. The loop-closure data realized ROI is computed from (win rate, cycle time, deals saved, $ influenced).';
