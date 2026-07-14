-- Live Coach turn persistence
--
-- Each turn in the in-call coach chat (one row per user message OR
-- per assistant reply) lives here. Loaded on prep page mount so the
-- conversation survives reloads + survives across sessions.
--
-- Two behavioral signals fall out of this:
--   1. Rep dependency — turn count per deal per week is the
--      session-frequency metric named in behavioral_dependency_signal.md
--   2. Question taxonomy — what reps actually ask Mallin during
--      calls becomes substrate for tuning the brief, the prompt,
--      and future Pass passes
--
-- Scope: per (tenant, opportunity, user). One continuous thread per
-- deal per user in v0; "session" grouping is a derived concept
-- (gap > 30 min = new logical session) — done in code, not schema.
--
-- Privacy: RLS scoped by tenant. A user can only read turns from
-- their own tenant. Founder-level admin reads bypass via the
-- service role key (used by scripts/intelligence/show-live-coach.ts).

create table if not exists live_coach_turns (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  /** Clerk user ID of the rep whose conversation this is. */
  user_id         text not null,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  /** Whether this turn was the result of a successful API call.
   *  Failed assistant turns (e.g. ANTHROPIC_API_KEY missing, model
   *  errored) are not persisted — we only record what the rep
   *  actually saw. User turns are always persisted (they typed it). */
  created_at      timestamptz not null default now()
);

-- Read pattern: load all turns for a (tenant, opportunity, user) in
-- chronological order. Indexed for that.
create index if not exists live_coach_turns_lookup_idx
  on live_coach_turns (tenant_id, opportunity_id, user_id, created_at);

-- Admin lookup pattern (founder admin queries via service role key,
-- not bound by RLS): list all turns for an opportunity across users
-- to see the full conversation arc. Reuses the same index since
-- (tenant, opp, user, ts) is a prefix of the natural ordering.

alter table live_coach_turns enable row level security;

-- Read: tenant members can read all turns for that tenant. Service
-- role bypasses RLS.
create policy live_coach_turns_read on live_coach_turns
  for select using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    -- Fallback: match through Clerk organization claim when explicit
    -- tenant_id claim is absent (different auth paths in the codebase
    -- use slightly different claim shapes).
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- Write: same scope as read. Insert path comes from API route
-- handlers, which use the service role key, so this RLS write policy
-- is defense-in-depth.
create policy live_coach_turns_write on live_coach_turns
  for insert with check (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

comment on table live_coach_turns is
  'Per-turn persistence of Live Coach conversations. Append-only. '
  'Provides session-frequency metric + question-taxonomy substrate. '
  'See memory: behavioral_dependency_signal.md.';
