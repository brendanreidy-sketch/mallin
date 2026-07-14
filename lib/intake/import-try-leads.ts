/**
 * Signup-import — turn a saved /try brief into a real cockpit deal.
 *
 * When someone builds a free brief on /try, gives their email at the
 * exit-intent box, and later signs up with that same email, this claims the
 * saved brief(s) and materializes each as a research deal (account +
 * opportunity + the already-generated Account-Intelligence artifact) in their
 * new workspace — so "Save it" is real: the brief is waiting in their cockpit.
 *
 * Called once from ensurePersonalWorkspace on new-tenant creation. Fully
 * best-effort — signup must NEVER break on it. Idempotent via
 * try_leads.imported_at (migration 029).
 */

import { supabaseAdmin } from "@/lib/db/client";
import { createResearchDeal } from "./create-deal-from-transcript";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

interface TryLeadRow {
  id: string;
  company: string | null;
  account_name: string | null;
  artifact: AccountIntelligenceArtifact | null;
  sales_experience: string | null;
}

// Cap so a visitor who ran the free try many times doesn't flood a new
// workspace (and blow past the free-deal limit). Most recent first.
const MAX_IMPORT = 3;

export async function importTryLeadsForEmail(
  email: string,
  tenantId: string,
  ownerId: string,
): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from("try_leads")
      .select("id, company, account_name, artifact, sales_experience")
      .ilike("email", email)
      .is("imported_at", null)
      .not("artifact", "is", null)
      .order("created_at", { ascending: false })
      .limit(MAX_IMPORT);
    if (error || !data?.length) return 0;

    // Carry the rep's self-reported sales tenure onto the tenant (most recent
    // lead wins). Best-effort, and only if not already set — coaching reads it
    // later to tune depth. See rep_experience_persona_adaptation.md.
    const tenure = (data as TryLeadRow[]).find((r) => r.sales_experience)?.sales_experience;
    if (tenure) {
      await supabaseAdmin
        .from("tenants")
        .update({ sales_experience: tenure })
        .eq("id", tenantId)
        .is("sales_experience", null);
    }

    let imported = 0;
    for (const row of data as TryLeadRow[]) {
      try {
        await importOne(tenantId, ownerId, row);
        await supabaseAdmin
          .from("try_leads")
          .update({ imported_at: new Date().toISOString() })
          .eq("id", row.id);
        imported++;
      } catch (e) {
        console.warn(`[import-try-leads] lead ${row.id} skipped: ${(e as Error).message}`);
      }
    }
    return imported;
  } catch (e) {
    console.warn(`[import-try-leads] lookup failed: ${(e as Error).message}`);
    return 0;
  }
}

async function importOne(tenantId: string, ownerId: string, row: TryLeadRow): Promise<void> {
  const artifact = row.artifact;
  const company = artifact?.account?.name || row.account_name || row.company || "Saved brief";
  // productContext is required by the type but unused by createResearchDeal
  // (it only builds the account+opp shell); the artifact is inserted below.
  const shell = await createResearchDeal({ tenantId, ownerId, company, productContext: "" });

  if (artifact?.account?.name) {
    await supabaseAdmin.from("accounts").update({ name: artifact.account.name }).eq("id", shell.accountId);
    await supabaseAdmin.from("opportunities").update({ name: artifact.account.name }).eq("id", shell.opportunityId);
  }

  // Insert the already-generated artifact as the current one (no re-research).
  await supabaseAdmin
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("account_id", shell.accountId)
    .eq("is_current", true);
  await supabaseAdmin.from("account_intelligence_artifacts").insert({
    tenant_id: tenantId,
    account_id: shell.accountId,
    opportunity_id: shell.opportunityId,
    artifact: artifact as unknown as Record<string, unknown>,
    primary_source: "web_search",
    is_current: true,
    generated_at: artifact?.metadata?.generated_at ?? new Date().toISOString(),
  });
}
