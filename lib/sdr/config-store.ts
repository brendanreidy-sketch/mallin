/**
 * Per-tenant SDR config persistence.
 *
 * Reads/writes the `sdr` capability row in agent_configs (migration 020). The
 * config column is the full SdrTenantConfig JSON; this module is the only place
 * that knows the capability key, so other capabilities plug in alongside.
 *
 * Uses supabaseAdmin (PostgREST) — same pattern as the rest of the app's CRUD.
 * DDL lives in the migration; this is data access only.
 */
import { supabaseAdmin } from "@/lib/db/client";
import type { SdrTenantConfig } from "./types";

const CAPABILITY = "sdr";

/** A blank-but-valid starter so the setup screen renders on first visit. */
export function defaultSdrConfig(companyName = ""): SdrTenantConfig {
  return {
    company_name: companyName,
    offering: "",
    governance: {
      icp: "",
      qualification_criteria: [],
      disqualifiers: [],
      work_now_bar: "",
      nurture_band: "",
    },
    implementation: {
      work_now: { type: "book_meeting", detail: "" },
      nurture: { type: "send_resource", detail: "" },
    },
    resources: [],
    knowledge: [],
    voice: "",
  };
}

/** Load a tenant's SDR config, or null if they haven't configured one yet. */
export async function loadSdrConfig(
  tenantId: string,
): Promise<SdrTenantConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_configs")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("capability", CAPABILITY)
    .maybeSingle();
  if (error) {
    throw new Error(`loadSdrConfig failed: ${error.message}`);
  }
  return (data?.config as SdrTenantConfig | undefined) ?? null;
}

/** Upsert a tenant's SDR config. */
export async function saveSdrConfig(
  tenantId: string,
  config: SdrTenantConfig,
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
  if (error) {
    throw new Error(`saveSdrConfig failed: ${error.message}`);
  }
}
