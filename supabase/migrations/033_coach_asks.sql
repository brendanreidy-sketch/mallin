-- Coach ask persistence
--
-- Every question a rep asks the cockpit AskBar (the "what should I do
-- about X?" coach that streams from /api/coach) is recorded here — one
-- row per ask. Until now these were fire-and-forget to Claude and left
-- no trace; the in-call LiveCoach persisted its turns (live_coach_turns)
-- but the post-brief AskBar did not, so the single richest signal —
-- "what do reps actually ask the brief?" — was being thrown away.
--
-- What this unlocks (the same two signals as live_coach_turns, for the
-- other ask surface):
--   1. Question taxonomy — what reps ask, per tenant, becomes substrate
--      for tuning the brief, the prompt, and future passes. This is the
--      "gather what's being asked so the system can improve" corpus.
--   2. Rep dependency — ask volume per deal per week is a return-usage
--      signal (see behavioral_dependency_signal.md).
--
-- We store the QUESTION and where it came from — NOT the streamed answer.
-- The question is the signal; keeping answers out keeps the table narrow
-- and avoids warehousing model output. (Add answer capture later only if
-- answer-quality evaluation needs it.)
--
-- Scope: per (tenant, opportunity, user). Privacy: RLS scoped by tenant,
-- exactly mirroring live_coach_turns — a user only reads asks from their
-- own tenant; founder-admin reads bypass via the service role key.

create table if not exists coach_asks (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  /** Clerk user ID of the rep who asked. */
  user_id         text not null,
  /** The rep's question, verbatim (capped at 4000 chars by the route). */
  question        text not null,
  /** Where the ask was launched from, when it came via a cockpit "💡"
   *  handoff button: 'email' | 'crm_update' | 'critical_risk'. Null for a
   *  free-form ask typed straight into the bar. */
  context_surface text,
  /** Optional human label carried with the surface (e.g. a stakeholder
   *  name for a crm_update handoff). Null when absent. */
  context_label   text,
  created_at      timestamptz not null default now()
);

-- Read pattern A (per-deal, per-user thread, chronological).
create index if not exists coach_asks_lookup_idx
  on coach_asks (tenant_id, opportunity_id, user_id, created_at);

-- Read pattern B (the improvement corpus: everything a tenant asked,
-- most recent first, across all deals).
create index if not exists coach_asks_corpus_idx
  on coach_asks (tenant_id, created_at desc);

alter table coach_asks enable row level security;

-- Read: tenant members can read all asks for that tenant. Service role
-- bypasses RLS. Mirrors live_coach_turns_read.
create policy coach_asks_read on coach_asks
  for select using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

-- Write: same scope as read. The API route inserts via the service role
-- key, so this write policy is defense-in-depth.
create policy coach_asks_write on coach_asks
  for insert with check (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

comment on table coach_asks is
  'Per-ask persistence of the cockpit AskBar coach. Append-only, question '
  'only (no answer). Question-taxonomy + rep-dependency substrate for the '
  'other ask surface. Companion to live_coach_turns.';
