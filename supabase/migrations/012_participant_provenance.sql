-- Participant provenance — discovery layer for stakeholders + internal_participants
--
-- Companion to the org-topology fix that taught Pass 1.5 + ingest-transcript
-- to extract participants from call substrate. Once participants emerge
-- dynamically from conversations (rather than CRM-defined ahead of time),
-- we need to track HOW each one was discovered so the system can:
--
--   1. Distinguish CRM-imported actors from transcript-extracted ones
--   2. Show debug provenance when a participant looks wrong
--   3. Build trust UI ("Adam Newman — first seen on call_05, introduced by Kevin
--      as 'our controller'")
--   4. Resolve future identity conflicts (same name, different transcripts) by
--      reasoning over confidence + first_seen_at
--
-- Naming note: `discovery_*` prefix to avoid clashing with the existing
-- `source_system` / `source_external_id` columns, which describe the
-- *origin system* of the CRM sync (e.g. 'salesforce', 'hubspot', 'manual').
-- `discovery_source` describes *how Mallin learned about this person* —
-- separate concern, kept separately.

-- ── stakeholders (buyer-side) ────────────────────────────────────────
alter table stakeholders
  add column if not exists discovery_source       text,
  add column if not exists discovery_confidence   text,
  add column if not exists discovery_reasoning    text,
  add column if not exists first_seen_at          timestamptz,
  add column if not exists first_seen_call_id     uuid references calls(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'stakeholders' and constraint_name = 'stakeholders_discovery_source_check'
  ) then
    alter table stakeholders
      add constraint stakeholders_discovery_source_check
      check (discovery_source is null or discovery_source in ('crm', 'transcript', 'manual', 'calendar', 'email'));
  end if;
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'stakeholders' and constraint_name = 'stakeholders_discovery_confidence_check'
  ) then
    alter table stakeholders
      add constraint stakeholders_discovery_confidence_check
      check (discovery_confidence is null or discovery_confidence in ('high', 'medium', 'low'));
  end if;
end$$;

-- ── internal_participants (rep-side) ─────────────────────────────────
alter table internal_participants
  add column if not exists discovery_source       text,
  add column if not exists discovery_confidence   text,
  add column if not exists discovery_reasoning    text,
  add column if not exists first_seen_at          timestamptz,
  add column if not exists first_seen_call_id     uuid references calls(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'internal_participants' and constraint_name = 'internal_participants_discovery_source_check'
  ) then
    alter table internal_participants
      add constraint internal_participants_discovery_source_check
      check (discovery_source is null or discovery_source in ('crm', 'transcript', 'manual', 'calendar', 'email'));
  end if;
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'internal_participants' and constraint_name = 'internal_participants_discovery_confidence_check'
  ) then
    alter table internal_participants
      add constraint internal_participants_discovery_confidence_check
      check (discovery_confidence is null or discovery_confidence in ('high', 'medium', 'low'));
  end if;
end$$;
