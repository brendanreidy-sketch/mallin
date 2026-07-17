-- Follow-up draft cache — keyed to the brief version that produced it.
--
-- The follow-up email is an LLM generation (with a validator retry loop). It
-- used to regenerate on every /prep view. This caches it per execution_artifact
-- (the brief version): generated ONCE per brief, then read on every subsequent
-- view. A new brief (new transcript → rebuildBrief → new artifact id) is a cache
-- miss, so the draft refreshes exactly when the underlying brief does — event-
-- driven, not on a timer. See app/prep + lib/agents/followup-draft-cache.ts.
--
-- Degrades safely: if this table is absent (migration not yet applied), the
-- cache read/write throws and the caller falls back to generating inline.

create table if not exists followup_drafts (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  opportunity_id         uuid not null references opportunities(id) on delete cascade,
  /** The brief version this draft was generated from. One draft per brief. */
  execution_artifact_id  uuid not null references execution_artifacts(id) on delete cascade,
  /** The DraftFollowup object (to / subject / bodyText / bodyHtml / …). */
  draft                  jsonb not null,
  model                  text,
  generated_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  unique (execution_artifact_id)
);

create index if not exists followup_drafts_opp_idx
  on followup_drafts (tenant_id, opportunity_id);

alter table followup_drafts enable row level security;

-- Read/write scoped to the tenant. Service role bypasses RLS (the /prep server
-- render reads + writes via the service client). Mirrors cockpit_actions.
create policy followup_drafts_read on followup_drafts
  for select using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

create policy followup_drafts_write on followup_drafts
  for insert with check (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

comment on table followup_drafts is
  'Per-brief-version cache of the follow-up email draft. Generated once per '
  'execution_artifact, refreshed only when a new brief is produced. Kills the '
  'per-view LLM regeneration on /prep.';
