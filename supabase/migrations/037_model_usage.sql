-- Per-model-call cost telemetry, attributed per tenant.
--
-- Populated best-effort by logUsage() (lib/billing/log-usage.ts) via the async
-- usage-context (lib/billing/usage-context.ts). Fail-open: a write hiccup never
-- blocks or breaks a brief. Purpose: answer "what did tenant X cost this month"
-- for pricing + fair-use-cap tuning without scraping Vercel logs.
--
-- No FK on opportunity_id — cost history must survive a deal delete.

create table if not exists model_usage (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  /** The deal the model call was working on. Nullable — attribution only needs
   *  the tenant; the deal link is for drill-down. */
  opportunity_id     uuid,
  /** Pipeline stage: 'substrate' | 'core-intelligence' | 'execution' |
   *  'call-extraction' | … */
  stage              text not null,
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cache_write_tokens integer not null default 0,
  /** Estimated USD for this call, from the same rate table logUsage() logs. */
  est_usd            numeric(10, 5) not null default 0,
  created_at         timestamptz not null default now()
);

-- Indexed for the per-tenant rolling-window rollup ("cost this month").
create index if not exists model_usage_tenant_idx
  on model_usage (tenant_id, created_at);

-- Internal telemetry only: service role writes and reads it. RLS on with no
-- policy = deny-all for anon/authenticated; the service-role client bypasses
-- RLS. No tenant-facing surface yet, so no read policy (mirrors how intake_usage
-- is written server-side).
alter table model_usage enable row level security;

comment on table model_usage is
  'Per-model-call cost telemetry attributed per tenant; best-effort, fail-open. Drives pricing + fair-use decisions.';
