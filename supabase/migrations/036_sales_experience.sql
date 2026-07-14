-- Rep sales experience (tenure) capture.
--
-- Captured on the /try teaser gate alongside the email ("How long have you
-- been in sales?"), stored on the lead, and carried to the tenant on
-- signup-import — so coaching can later flex explanatory depth by experience
-- (a first-week BDR needs the "why"; a 15-year AE wants it terse). See
-- rep_experience_persona_adaptation.md.
--
-- Stored as a band string (e.g. 'new', '1-3', '3-7', '7-15', '15+'), nullable
-- (optional field, and legacy rows/direct signups have none). This migration
-- only CAPTURES; the coach/brief prompts don't read it yet.

alter table try_leads
  add column if not exists sales_experience text;

alter table tenants
  add column if not exists sales_experience text;

comment on column tenants.sales_experience is
  'Rep sales-tenure band (new|1-3|3-7|7-15|15+), self-reported on /try. A soft '
  'coaching-depth signal, not a gate. Tenant-level for solo self-serve; '
  'per-rep storage for teams is a later refinement.';
