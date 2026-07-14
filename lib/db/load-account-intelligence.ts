/**
 * Loads the current Account Intelligence (Pass 0) artifact for an
 * opportunity. Returns null if none exists.
 *
 * Server-side only — uses the service-role client.
 */

import { supabaseAdmin } from "./client";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

export async function loadAccountIntelligenceByOpp(
  opportunityId: string,
): Promise<AccountIntelligenceArtifact | null> {
  const { data, error } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("artifact")
    .eq("opportunity_id", opportunityId)
    .eq("is_current", true)
    .maybeSingle();
  if (error || !data) return null;
  return data.artifact as AccountIntelligenceArtifact;
}

/**
 * Looks up an opportunity by id and returns whether it exists (for
 * use when there's no Pass 4 artifact but we still want to render
 * something useful at /prep).
 */
export async function loadOpportunityShellByDealId(dealId: string): Promise<{
  id: string;
  name: string | null;
  tenant_id: string;
  account_id: string;
  account_name: string | null;
} | null> {
  const { data: opp, error } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, tenant_id, account_id")
    .eq("id", dealId)
    .maybeSingle();
  if (error || !opp) return null;
  const { data: acct } = await supabaseAdmin
    .from("accounts")
    .select("name")
    .eq("id", opp.account_id)
    .maybeSingle();
  return {
    id: opp.id,
    name: opp.name,
    tenant_id: opp.tenant_id,
    account_id: opp.account_id,
    account_name: acct?.name ?? null,
  };
}
