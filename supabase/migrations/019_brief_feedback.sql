-- Brief feedback — the one direct read on whether the output earns trust
-- ("rep trusts Mallin more than their own memory" = the PMF bar). One-tap
-- 👍/👎 + optional reason, captured per deal. Multiple rows allowed (a rep can
-- react to successive versions).
CREATE TABLE IF NOT EXISTS brief_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  reason text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brief_feedback_opp_idx ON brief_feedback (opportunity_id);
CREATE INDEX IF NOT EXISTS brief_feedback_tenant_idx ON brief_feedback (tenant_id);
