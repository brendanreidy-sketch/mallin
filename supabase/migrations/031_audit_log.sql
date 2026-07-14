-- 031_audit_log.sql
-- Append-only audit trail for governed / privileged actions.
--
-- Records who did what, when — starting with the compliance actions
-- (tenant export + delete) and extendable to every governed CRM write.
-- This is both a security control (questionnaires ask for it) and the
-- ledger implied by the approval/provenance model.
--
-- tenant_id is intentionally NOT a foreign key with ON DELETE CASCADE:
-- an audit record must SURVIVE the deletion of the tenant it describes
-- (you need proof that a "delete my data" request was honored).

create table if not exists audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid,                                   -- null for non-tenant actions
  actor_email   text,                                   -- who (Clerk email) or 'system'
  actor_user_id text,                                   -- Clerk user id, if any
  action        text NOT NULL,                          -- 'tenant.export', 'tenant.delete', ...
  entity        text,                                   -- 'tenant:<id>', 'opportunity:<id>'
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,     -- before/after, counts, request info
  created_at    timestamptz NOT NULL DEFAULT now()
);

create index if not exists audit_log_tenant_idx on audit_log (tenant_id, created_at desc);
create index if not exists audit_log_action_idx on audit_log (action, created_at desc);
