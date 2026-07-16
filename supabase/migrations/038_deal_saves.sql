-- Deal saves — the in-flight recovery ledger.
--
-- deal_outcomes (017) records the ENDING of a deal + attribution. This table
-- records the MIDDLE: a deal that Mallin flagged as at-risk, acted on (under
-- rep approval), and pulled back from the brink — the "saved pipeline" the
-- finance team can audit as a tangible, dollar-denominated outcome TODAY,
-- with no sample size required, because each row is one deal, rep-confirmed.
--
-- One row per SAVE EPISODE (a deal can go at-risk, be saved, then go at-risk
-- again later — that's two episodes). An episode is born when Mallin acts on
-- an at_risk / stalled signal, and RESOLVES when the deal recovers or is lost.
--
-- The credibility engine is `counterfactual`: a save only counts as credited
-- pipeline when the rep affirms they'd have MISSED it without Mallin. That one
-- human judgment is what lets a firm rely on the number without statistics —
-- and the honesty of the ledger is measured by how often reps decline credit
-- (counterfactual = 'would_have_caught'). A save is also, by construction, a
-- labeled training example of a loss prevented — see getCrossDealOutcomeLessons
-- + the rep-behavior contract. The ledger and the moat are the same event.
--
-- Governance: Mallin proposes + acts under approval (approved_by_user_id); the
-- rep confirms the counterfactual (confirmed_by_user_id). Mirrors the
-- AI-proposes / human-governs seam in cockpit_actions (034).
--
-- Scope + privacy: tenant-scoped, RLS by tenant — a line-for-line mirror of
-- cockpit_actions / live_coach_turns. The ledger rollup reads company-scoped
-- (this workspace + siblings) the same way outcome memory does.

create table if not exists deal_saves (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  opportunity_id        uuid not null references opportunities(id) on delete cascade,

  -- ── The trigger (from the execution artifact that flagged the deal) ──────
  /** The at-risk signature that opened the episode. */
  risk_signal           text not null check (
    risk_signal in ('stalled', 'no_next_step', 'champion_dark', 'procurement_stuck', 'single_threaded', 'ghosted')
  ),
  /** The human "why", reused verbatim from the rep-focus at-risk driver. */
  risk_driver           text,
  flagged_at            timestamptz not null,
  /** Deal value snapshotted AT FLAG — never at close, so a save can't be
   *  credited for growth that happened for unrelated reasons. */
  amount_at_flag        numeric,
  currency              text not null default 'USD',

  -- ── The action Mallin took (under rep approval) ─────────────────────────
  action_taken          text not null check (
    action_taken in ('reengage_email', 'multithread', 'exec_escalation', 'reframe_value', 'revive_next_step')
  ),
  /** The brief / execution artifact that carried the move. No FK: artifacts
   *  version + demote, so this is a soft pointer for the receipt, not a join. */
  action_artifact_id    uuid,
  acted_at              timestamptz not null default now(),
  /** Clerk user ID of the rep who greenlit the governed action. */
  approved_by_user_id   text,

  -- ── The outcome (resolves the episode) ──────────────────────────────────
  outcome               text not null default 'still_open' check (
    outcome in ('still_open', 'recovered', 'lost')
  ),
  outcome_at            timestamptz,

  -- ── The rep-confirmed counterfactual (the credibility engine) ───────────
  /** Asked at the MOMENT OF RECOVERY, not at close. 'would_have_caught' is a
   *  first-class, encouraged answer — declined credit is what makes the
   *  ledger auditable. Null until the rep answers. */
  counterfactual        text check (
    counterfactual is null or counterfactual in ('would_have_missed', 'would_have_caught', 'unsure')
  ),
  /** Clerk user ID of the rep who confirmed the counterfactual. */
  confirmed_by_user_id  text,
  confirmed_at          timestamptz,

  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- At most one OPEN episode per opportunity (mirrors the is_current pattern on
-- artifacts). A new at-risk episode may only open once the prior one resolved.
create unique index if not exists deal_saves_one_open_per_opp
  on deal_saves (opportunity_id) where outcome = 'still_open';

-- Rollup read: credited pipeline + no-credit rate per (company) workspace.
create index if not exists deal_saves_ledger_idx
  on deal_saves (tenant_id, outcome, counterfactual);

-- Hydration read: a deal's save history, most recent first.
create index if not exists deal_saves_opp_idx
  on deal_saves (tenant_id, opportunity_id, created_at desc);

alter table deal_saves enable row level security;

-- Read: tenant members read all saves for that tenant (a manager reads across
-- the team). Service role bypasses RLS. Mirrors cockpit_actions.
create policy deal_saves_read on deal_saves
  for select using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- Write: same scope. API routes insert via the service role key, so this is
-- defense-in-depth.
create policy deal_saves_write on deal_saves
  for insert with check (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

create policy deal_saves_update on deal_saves
  for update using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

comment on table deal_saves is
  'In-flight save ledger: deals Mallin flagged at-risk, acted on under rep '
  'approval, and recovered. Rep-confirmed counterfactual = credited pipeline. '
  'The tangible, no-sample-size ROI surface + a labeled loss-prevented '
  'training example. See deal_outcomes (close-time attribution) + '
  'getCrossDealOutcomeLessons (the moat it feeds).';
