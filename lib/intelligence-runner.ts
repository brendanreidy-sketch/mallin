/**
 * Intelligence runner — refactored to use the proper architecture.
 *
 * Writes:
 *   - accounts.strategic_priority      (the macro frame)
 *   - public_signals (one row per finding) (discrete observations)
 *
 * NO LONGER WRITES TO TOUCHES. The previous implementation logged
 * findings as touches with source_system="intelligence_web_sweep" as
 * a shortcut. That conflated rep-logged communications with external
 * research. The contracts + DB had dedicated slots scaffolded
 * (account.strategic_priority, public_signals, external_signals,
 * intelligence_records); we just hadn't wired them.
 *
 * This refactor uses them properly:
 *   - Pass 1.5 (loadDealFromDB) loads strategic_priority +
 *     public_signals[] into substrate.account
 *   - Pass 4 reads them as first-class account-level fields
 *
 * Returns structured result so callers can show progress / log.
 * Errors are logged but not thrown — auto-fire callers shouldn't fail
 * their own work because intel sweep flaked.
 */

import { supabaseAdmin } from "@/lib/db/client";
import {
  runIntelligenceSweep,
  type IntelligenceFinding,
} from "@/lib/agents/intelligence-agent";

export interface IntelligenceRunResult {
  ok: boolean;
  strategic_priority: string;
  findings: IntelligenceFinding[];
  signal_ids: string[];
  search_count: number;
  latency_ms: number;
  error?: string;
}

/**
 * Run an intelligence sweep for a deal and persist findings to the
 * proper substrate slots. Each call replaces prior public_signals for
 * the account (sweep semantics: latest sweep is the current read).
 */
export async function runAccountIntelligence(
  dealId: string,
): Promise<IntelligenceRunResult> {
  // Look up account + stakeholders
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("id, tenant_id, account_id")
    .eq("id", dealId)
    .maybeSingle();
  if (oppErr || !opp) {
    return {
      ok: false,
      strategic_priority: "",
      findings: [],
      signal_ids: [],
      search_count: 0,
      latency_ms: 0,
      error: "deal not found",
    };
  }

  const { data: account, error: acctErr } = await supabaseAdmin
    .from("accounts")
    .select("name, industry, headquarters")
    .eq("id", opp.account_id)
    .maybeSingle();
  if (acctErr || !account) {
    return {
      ok: false,
      strategic_priority: "",
      findings: [],
      signal_ids: [],
      search_count: 0,
      latency_ms: 0,
      error: "account not found",
    };
  }

  const { data: stakeholders } = await supabaseAdmin
    .from("stakeholders")
    .select("name, title, committee_role")
    .eq("account_id", opp.account_id)
    .eq("is_departed", false)
    .not("committee_role", "is", null)
    .limit(6);

  // Run the sweep
  let result;
  try {
    result = await runIntelligenceSweep({
      account_name: account.name,
      account_industry: account.industry ?? undefined,
      account_headquarters: account.headquarters ?? undefined,
      key_stakeholders: (stakeholders ?? []).map((s) => ({
        name: s.name,
        title: s.title ?? undefined,
        committee_role: s.committee_role ?? undefined,
      })),
    });
  } catch (e) {
    return {
      ok: false,
      strategic_priority: "",
      findings: [],
      signal_ids: [],
      search_count: 0,
      latency_ms: 0,
      error: `sweep failed: ${(e as Error).message}`,
    };
  }

  // Replace-on-sweep: clear prior public_signals for this account
  // before writing the new set. Each sweep is the current state.
  // Only delete if the new sweep returned findings — never wipe on a
  // flaked sweep.
  if (result.findings.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from("public_signals")
      .delete()
      .eq("account_id", opp.account_id);
    if (delErr) {
      console.warn(
        `[intelligence-runner] failed to clear prior signals for ${opp.account_id}: ${delErr.message}`,
      );
    }
  }

  // Update accounts.strategic_priority. This is the macro frame Pass 4
  // reads as substrate.account.strategic_priority.
  if (result.strategic_priority) {
    const { error: spErr } = await supabaseAdmin
      .from("accounts")
      .update({ strategic_priority: result.strategic_priority })
      .eq("id", opp.account_id);
    if (spErr) {
      console.warn(
        `[intelligence-runner] failed to update strategic_priority for ${opp.account_id}: ${spErr.message}`,
      );
    }
  }

  // Write each finding as a public_signals row.
  const signalIds: string[] = [];
  const ts = Date.now();
  for (let i = 0; i < result.findings.length; i++) {
    const f = result.findings[i];
    const externalId = `intel_${ts}_${f.finding_type}_${i}`;
    // Encode the implication into the summary so Pass 4's substrate
    // read sees both the fact and the rep-actionable interpretation.
    // public_signals.summary is text — no separate implication column,
    // so we concatenate. Format chosen for readability + downstream
    // parseability if we ever want to split them again.
    const summary = `${f.summary}\n\nImplication: ${f.implication}`;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("public_signals")
      .insert({
        tenant_id: opp.tenant_id,
        account_id: opp.account_id,
        summary,
        observed_at: new Date().toISOString(),
        source: f.source,
        source_system: "intelligence_web_sweep",
        source_external_id: externalId,
        source_url: f.source_url,
      })
      .select("id")
      .single();
    if (insErr) {
      console.warn(
        `[intelligence-runner] failed to log signal ${externalId}: ${insErr.message}`,
      );
      continue;
    }
    signalIds.push(inserted.id);
  }

  // Bump last_activity_at so freshness paths see the update.
  await supabaseAdmin
    .from("opportunities")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", dealId);

  return {
    ok: true,
    strategic_priority: result.strategic_priority,
    findings: result.findings,
    signal_ids: signalIds,
    search_count: result.search_count,
    latency_ms: result.latency_ms,
  };
}

/**
 * Has this account been swept by the Intelligence Agent in the last
 * `staleAfterDays` days? Used to gate auto-fire — we don't want to
 * re-sweep on every regen, just when the account is fresh or stale.
 *
 * Checks public_signals.observed_at on the account. The earlier
 * implementation checked touches.source_system; we now check the
 * proper table.
 */
export async function accountHasRecentIntelligence(
  dealId: string,
  staleAfterDays = 30,
): Promise<boolean> {
  // Resolve account_id from deal
  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("account_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!opp?.account_id) return false;

  const cutoff = new Date(
    Date.now() - staleAfterDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count } = await supabaseAdmin
    .from("public_signals")
    .select("id", { count: "exact", head: true })
    .eq("account_id", opp.account_id)
    .eq("source_system", "intelligence_web_sweep")
    .gte("observed_at", cutoff);
  return (count ?? 0) > 0;
}
