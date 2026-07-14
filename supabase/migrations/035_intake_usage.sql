-- Intake task ledger — the unit the free meter counts.
--
-- The free tier is "3 free tasks, workspace-wide," where a TASK is any of the
-- three intake actions:
--   research  — "Call coming up" (pre-call research brief, no transcript)
--   call      — "Paste a call"   (new deal from a transcript)
--   follow_up — "Follow-up"      (append a call to an existing deal)
--
-- Until now the meter counted `deal_transcripts` rows, which only exist for
-- call/follow_up — so research was silently free + unlimited. That let a free
-- user run unlimited paid research and never reach the wall. This ledger records
-- ONE row per successful intake action of any kind, so the meter counts all
-- three against the same allowance and the 4th action of any mix walls.
--
-- Why a dedicated table (not a marker row in deal_transcripts): deal_transcripts
-- is the raw-transcript archive read by the deck-copy agent ("latest transcript
-- per opportunity"). A placeholder research row there would corrupt deck copy.
-- Metering is a separate concern, so it gets its own append-only ledger.
--
-- Scope + privacy: per (tenant, user), RLS by tenant — mirrors live_coach_turns
-- / coach_asks / cockpit_actions.

create table if not exists intake_usage (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  /** Clerk user ID of the rep who ran the action (nullable — best-effort). */
  user_id         text,
  kind            text not null check (kind in ('research', 'call', 'follow_up')),
  /** The deal the action produced/updated. Nullable — metering only needs the
   *  count; the link is for analytics. No FK so a later opportunity delete
   *  never rewrites billing history. */
  opportunity_id  uuid,
  created_at      timestamptz not null default now()
);

-- The meter's read: count(*) per tenant.
create index if not exists intake_usage_tenant_idx
  on intake_usage (tenant_id, created_at);

-- Preserve existing CALL history so no current user's count resets when the
-- meter switches off deal_transcripts. Past research can't be identified
-- retroactively (its Pass-0 artifact table is shared with paste-a-call), so
-- historical research stays free — which matches how it actually behaved. Going
-- forward, every action is logged here.
insert into intake_usage (tenant_id, user_id, kind, opportunity_id, created_at)
  select tenant_id, null, 'call', opportunity_id, created_at
  from deal_transcripts;

alter table intake_usage enable row level security;

create policy intake_usage_read on intake_usage
  for select using (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

create policy intake_usage_write on intake_usage
  for insert with check (
    tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
    or
    tenant_id in (
      select t.id from tenants t
      where t.slug = current_setting('request.jwt.claims', true)::json->>'org_id'
    )
  );

comment on table intake_usage is
  'Append-only ledger of intake actions (research | call | follow_up). One row '
  'per successful action = the unit the free-tier meter counts. Companion to '
  'deal_transcripts (which stays the raw-transcript archive).';
