-- 032_tenant_retention.sql
-- Per-tenant raw-transcript retention window.
--
-- NULL = keep for the life of the account (the DEFAULT — this preserves the
-- compounding memory that makes the product valuable). A positive integer =
-- auto-purge raw transcripts older than N days, honored by the retention-purge
-- cron (lib/compliance/retention.ts). Derived artifacts are retained regardless.

alter table tenants add column if not exists retention_days integer;

comment on column tenants.retention_days is
  'Raw-transcript retention window in days. NULL = keep for life of account (default). See lib/compliance/retention.ts + /api/cron/retention-purge.';
