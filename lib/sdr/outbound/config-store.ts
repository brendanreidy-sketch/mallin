/**
 * Per-tenant OUTBOUND config persistence — what makes the prospecting engine
 * multi-tenant.
 *
 * Reuses the same `agent_configs` table (migration 020) the inbound SDR uses,
 * keyed by (tenant_id, capability) — this is capability `'outbound'`. Every
 * customer runs the engine on THEIR own offering + ICP, resolved from their own
 * row, instead of a hard-coded constant. `MALLIN_OUTBOUND` stays only as the
 * dogfood fallback for the internal CLI; the product resolves per tenant.
 *
 * Mirrors lib/sdr/config-store.ts (loadSdrConfig / saveSdrConfig) — same table,
 * same access pattern, different capability key. DDL lives in the migration;
 * this is data access only.
 */
import { supabaseAdmin } from "@/lib/db/client";
import type { OutboundConfig } from "./config";
import { deriveLookalikeConfig, type LookalikeResult } from "./lookalike-agent";
import { DEFAULT_AUTONOMY, type AutonomyLevel, type AutonomyState } from "./autonomy";
import { DEFAULT_SENIORITY, seniorityForRole, type TargetSeniority } from "./seniority";

const CAPABILITY = "outbound";

/**
 * The stored shape: the engine's OutboundConfig plus optional derivation
 * provenance, so a derived ICP is auditable (which seed, what the agent read).
 */
export interface StoredOutboundConfig extends OutboundConfig {
  /** How this config was created — derived from a seed, or hand-authored. */
  source?: "derived" | "manual";
  /** If derived: the seed company + the agent's grounded read, kept for review. */
  derived_from_seed?: string;
  seed_profile?: string;
  rationale?: string;
  /** How far the engine may run on its own + the kill-switch. Defaulted if unset. */
  autonomy?: AutonomyState;
}

/** Load a tenant's outbound config, or null if they haven't set one up yet. */
export async function loadOutboundConfig(
  tenantId: string,
): Promise<StoredOutboundConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_configs")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("capability", CAPABILITY)
    .maybeSingle();
  if (error) throw new Error(`loadOutboundConfig failed: ${error.message}`);
  return (data?.config as StoredOutboundConfig | undefined) ?? null;
}

/** Upsert a tenant's outbound config. */
export async function saveOutboundConfig(
  tenantId: string,
  config: StoredOutboundConfig,
): Promise<void> {
  const { error } = await supabaseAdmin.from("agent_configs").upsert(
    {
      tenant_id: tenantId,
      capability: CAPABILITY,
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,capability" },
  );
  if (error) throw new Error(`saveOutboundConfig failed: ${error.message}`);
}

/**
 * The onboarding path: a customer points at ONE seed company they'd want more
 * of + what they sell → the agent derives their ICP → we persist it as their
 * outbound config. This is how a tenant goes from nothing to prospecting, and
 * it's the create path the setup surface calls. Returns the full derivation
 * (seed profile + rationale) so the UI can show the customer what it inferred
 * and let them confirm/edit before the first run.
 */
export async function deriveAndSaveOutboundConfig(
  tenantId: string,
  input: { seedCompany: string; seedWebsite?: string; offering: string; companyName: string },
): Promise<LookalikeResult> {
  const result = await deriveLookalikeConfig(input);
  const stored: StoredOutboundConfig = {
    ...result.config,
    source: "derived",
    derived_from_seed: input.seedCompany,
    seed_profile: result.seedProfile,
    rationale: result.rationale,
  };
  await saveOutboundConfig(tenantId, stored);
  return result;
}

// ── Autonomy (system-settings controls) ──────────────────────────────────────

/** The tenant's autonomy state — the safe default when unset. */
export async function getAutonomy(tenantId: string): Promise<AutonomyState> {
  const cfg = await loadOutboundConfig(tenantId);
  return cfg?.autonomy ?? DEFAULT_AUTONOMY;
}

/** Set the autonomy level (draft-only / approve-before-send / full-auto). */
export async function setAutonomyLevel(
  tenantId: string,
  level: AutonomyLevel,
): Promise<void> {
  const cfg = await loadOutboundConfig(tenantId);
  if (!cfg) throw new Error("setAutonomyLevel: tenant has no outbound config yet");
  await saveOutboundConfig(tenantId, {
    ...cfg,
    autonomy: { ...(cfg.autonomy ?? DEFAULT_AUTONOMY), level },
  });
}

/** Flip the global kill-switch — pause/resume ALL outbound. The load-bearing control. */
export async function setPaused(tenantId: string, paused: boolean): Promise<void> {
  const cfg = await loadOutboundConfig(tenantId);
  if (!cfg) throw new Error("setPaused: tenant has no outbound config yet");
  await saveOutboundConfig(tenantId, {
    ...cfg,
    autonomy: { ...(cfg.autonomy ?? DEFAULT_AUTONOMY), paused },
  });
}

// ── Target seniority (who to reach) ──────────────────────────────────────────

/** The tenant's target-seniority band — the AE band when unset. */
export async function getTargetSeniority(tenantId: string): Promise<TargetSeniority> {
  const cfg = await loadOutboundConfig(tenantId);
  return cfg?.target_seniority ?? DEFAULT_SENIORITY;
}

/** Set the seniority band from a role preset (AE = senior; SDR = + manager). */
export async function setTargetSeniority(
  tenantId: string,
  preset: "ae" | "sdr",
): Promise<void> {
  const cfg = await loadOutboundConfig(tenantId);
  if (!cfg) throw new Error("setTargetSeniority: tenant has no outbound config yet");
  await saveOutboundConfig(tenantId, { ...cfg, target_seniority: seniorityForRole(preset) });
}
