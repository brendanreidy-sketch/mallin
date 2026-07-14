-- Cockpit governed-action capture
--
-- One row per governed gesture a rep makes in the cockpit — the
-- "AI proposes, human governs" seam made durable. Three gestures ship
-- with this table (all optional, all rep-initiated):
--
--   strategy_confirmed   — rep dismissed the "How you win this" alert by
--                          confirming they actually discussed that play
--                          with the prospect (the × = "we talked about it",
--                          NOT "I clicked an AI button"). Team-tier: this is
--                          the signal a manager sees to know the strategy was
--                          carried into the room. See manager_visibility_b2b.
--   risk_acknowledged    — rep acknowledged a "What could go wrong" item —
--                          "I have a plan for this", not "seen".
--   stakeholder_flagged  — rep flagged a stakeholder the brief named as the
--                          wrong person (reason: wrong_person | wrong_role |
--                          no_longer_here | not_involved). This is the
--                          correction half of the stakeholder loop: AI
--                          best-guesses, the rep (ground truth) corrects, and
--                          the correction becomes both a fix and a lesson.
--                          See stakeholder_correction_loop.md.
--
-- target_ref identifies WHAT was acted on within the deal (a stakeholder_id
-- for a flag; a stable block key like 'how_you_win' or a risk index for the
-- confirm/ack). reason is the enum for stakeholder flags. detail carries the
-- small human context we want to read back without a join (stakeholder name,
-- the risk text) — NOT a citation surface, just display sugar.
--
-- Downstream consumers (deferred, gated — this migration only CAPTURES):
--   • manager visibility view (team tier) reads strategy_confirmed /
--     risk_acknowledged
--   • account-substrate write + tuning corpus reads stakeholder_flagged
--
-- Scope + privacy: per (tenant, opportunity, user), RLS by tenant — a
-- line-for-line mirror of live_coach_turns / coach_asks.

create table if not exists cockpit_actions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  /** Clerk user ID of the rep who made the gesture. */
  user_id         text not null,
  action_type     text not null check (
    action_type in ('strategy_confirmed', 'risk_acknowledged', 'stakeholder_flagged')
  ),
  /** What within the deal was acted on: a stakeholder_id for a flag, or a
   *  stable block key ('how_you_win', 'risk:0') for a confirm/ack. */
  target_ref      text,
  /** Stakeholder-flag reason enum. Null for confirm/ack gestures. */
  reason          text check (
    reason is null or reason in ('wrong_person', 'wrong_role', 'no_longer_here', 'not_involved')
  ),
  /** Small display context read back without a join (stakeholder name, risk
   *  text). Not a citation surface. */
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- Hydration read: all of a rep's gestures for a deal (so confirms / acks /
-- flags survive reload), most recent first.
create index if not exists cockpit_actions_lookup_idx
  on cockpit_actions (tenant_id, opportunity_id, user_id, created_at desc);

alter table cockpit_actions enable row level security;

-- Read: tenant members read all gestures for that tenant (a manager, in the
-- team tier, reads across the team's reps). Service role bypasses RLS.
create policy cockpit_actions_read on cockpit_actions
  for select using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- Write: same scope. API route inserts via the service role key, so this is
-- defense-in-depth.
create policy cockpit_actions_write on cockpit_actions
  for insert with check (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

comment on table cockpit_actions is
  'Per-gesture capture of governed cockpit actions (strategy confirm, risk '
  'acknowledge, stakeholder flag). Append-only. The durable AI-proposes / '
  'human-governs seam. See manager_visibility_b2b.md + stakeholder_correction_loop.md.';
