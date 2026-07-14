/**
 * SDR entitlement — the AI SDR is paid + sales-led, not free.
 * Reads tenants.sdr_enabled (migration 022). Gate at setup/save AND at the
 * public widget runtime (where the per-conversation cost lives).
 */
import { supabaseAdmin } from "@/lib/db/client";

export async function hasSdrAccess(tenantId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("tenants")
    .select("sdr_enabled")
    .eq("id", tenantId)
    .maybeSingle();
  return Boolean(data?.sdr_enabled);
}
