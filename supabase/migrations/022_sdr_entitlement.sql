-- SDR entitlement: the AI SDR is a paid, sales-led capability — NOT free.
-- Gate is a per-tenant flag you flip when a deal closes. Enforced at both the
-- setup/save path and (critically) the public widget runtime, where the
-- per-conversation LLM cost lives.
--
-- Additive + idempotent. Defaults false so nothing is entitled until you say so.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sdr_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.sdr_enabled IS 'AI SDR entitlement. false = gated (request-access wall + runtime refuses). Flip true on a closed SDR deal.';
