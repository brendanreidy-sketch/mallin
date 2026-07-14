/**
 * ============================================================================
 *  B2C intake — raw transcript → persisted deal + brief
 * ============================================================================
 *
 *  Two-stage, on purpose (the pipeline is long-running, so the HTTP request
 *  must not block on it):
 *
 *    createDealShell()    — FAST, no LLM. Inserts account + opportunity + the
 *                           transcript (as a `calls` row and a deal_transcripts
 *                           row). Returns ids immediately so the UI can route
 *                           to a "building…" screen.
 *
 *    runIntakePipeline()  — SLOW, the heavy lift. Runs in the background
 *                           (route schedules it via next/server `after()`):
 *                             Pass 0  runIntakeSubstrate (account + stakeholders
 *                                     + account-intelligence artifact)
 *                             Pass1.5 assembleCoreIntelligenceInput (DB → input)
 *                             Pass 2  Core Intelligence enrich
 *                             Pass 3  applyCoreIntelligence merge
 *                             Pass 4  Execution agent → PrepArtifact
 *                           then persists the execution_artifact. /prep renders
 *                           it once is_current lands (the status route polls for
 *                           exactly that).
 *
 *  Tenant-scoped throughout (the user's personal workspace). is_demo is left to
 *  the tenant row (B2C tenants are is_demo=false). source_system="intake".
 *
 *  Requires ANTHROPIC_API_KEY (Pass 0/2/4 all hit the model).
 * ============================================================================
 */

import { supabaseAdmin } from "@/lib/db/client";
import { runIntakeSubstrate } from "@/lib/agents/intake-substrate-agent";
import { getRepFocus, getCrossDealFocus } from "@/lib/cognition/rep-focus";
import { assembleCoreIntelligenceInput } from "@/orchestration/pass-1.5/input-assembler";
import { ProductionCoreIntelligenceAgent } from "@/lib/agents/core-intelligence-agent";
import { applyCoreIntelligence } from "@/orchestration/pass-3/apply";
import { ProductionExecutionAgent } from "@/lib/agents/execution-agent";
import { saveDealTranscript } from "@/lib/deck/deck-transcripts";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

// Valid stakeholders.committee_role values (DB CHECK constraint).
const COMMITTEE_ROLES = new Set([
  "champion",
  "economic_buyer",
  "user",
  "technical_buyer",
  "decision_maker",
  "influencer",
  "skeptic",
  "blocker",
  "unknown",
]);

export interface CreateShellInput {
  tenantId: string;
  ownerId: string;
  transcript: string;
  productContext: string;
  accountNameHint?: string | null;
}

export interface DealShell {
  opportunityId: string;
  accountId: string;
  externalId: string;
}

/**
 * FAST path — no LLM. Creates the account + opportunity + transcript rows so we
 * have an opportunity_id to route to immediately. Names are placeholders until
 * Pass 0 enriches them in the background.
 */
export async function createDealShell(input: CreateShellInput): Promise<DealShell> {
  const { tenantId, ownerId, transcript, accountNameHint } = input;
  // Deterministic-ish external id; unique per intake (timestamp suffix).
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const baseName = accountNameHint?.trim() || "New deal";
  const externalId = `${slug(baseName) || "deal"}-${stamp}`;

  const { data: acct, error: acctErr } = await supabaseAdmin
    .from("accounts")
    .upsert(
      {
        tenant_id: tenantId,
        name: accountNameHint?.trim() || "New account",
        source_system: "manual",
        source_external_id: `acct_${externalId}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr || !acct) throw new Error(`intake: account insert failed: ${acctErr?.message}`);

  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        name: baseName,
        stage_label: "Discovery",
        stage_position: 1,
        total_stages: 5,
        currency: "USD",
        owner_id: ownerId,
        deal_posture: "indeterminate",
        methodology_type: "MEDDPICC",
        methodology_surface_mode: "full",
        last_activity_at: new Date().toISOString(),
        source_system: "manual",
        source_external_id: `opp_${externalId}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr || !opp) throw new Error(`intake: opportunity insert failed: ${oppErr?.message}`);

  // Persist the transcript both as a `calls` row (so Pass 1.5 assembles it into
  // activities) and as a deal_transcripts row (raw archive / deck source).
  const startedAt = new Date().toISOString();
  const { data: call, error: callErr } = await supabaseAdmin
    .from("calls")
    .upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        opportunity_id: opp.id,
        provider: "manual",
        title: "Pasted call",
        started_at: startedAt,
        duration_seconds: 0, // unknown for a pasted transcript; NOT NULL column
        direction: "outbound",
        party_emails: [],
        // Pass 1.5 reads call content from `summary` (text). `transcript` is a
        // jsonb column expecting a structured shape, so the raw text lives in
        // summary — mirrors how the seed substrate feeds the pipeline.
        summary: transcript,
        key_moments: [],
        transcript: null,
        topics: [],
        triggers: [],
        source_system: "manual",
        source_external_id: `call_${externalId}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (callErr || !call) throw new Error(`intake: call insert failed: ${callErr?.message}`);

  // The `activities` table is the source of truth Pass 1.5 reads — a calls row
  // is invisible to the pipeline unless an activity references it via call_id.
  // Without this, the brief comes back empty ("no activity logged"). The CHECK
  // constraint requires type='call' ⇒ call_id set, email_id/meeting_id null.
  const { error: actErr } = await supabaseAdmin.from("activities").insert({
    tenant_id: tenantId,
    account_id: acct.id,
    opportunity_id: opp.id,
    type: "call",
    occurred_at: startedAt,
    subject: "Pasted call",
    summary: "Discovery call pasted by the rep.",
    call_id: call.id,
    source_system: "manual",
    source_external_id: `act_${externalId}`,
  });
  if (actErr) throw new Error(`intake: activity insert failed: ${actErr.message}`);

  // Best-effort archive copy for the deck-copy source. The load-bearing
  // transcript for Pass 1.5 lives in calls.summary above; deal_transcripts is a
  // secondary archive whose migration may not be applied everywhere — never
  // fail intake on it (saveDealTranscript swallows its own errors). Single
  // archive path shared with the follow-up route (appendCallAndRebuild).
  await saveDealTranscript({
    tenantId,
    opportunityId: opp.id,
    accountId: acct.id,
    source: "intake",
    rawText: transcript,
  });

  return { opportunityId: opp.id, accountId: acct.id, externalId };
}

/**
 * Roll back a shell whose brief never completed. Children before parents so FK
 * constraints don't block; errors ignored (some tables vary by env / may be
 * empty). This keeps a FAILED intake from (a) burning a free-tier deal slot —
 * the meter counts opportunities — and (b) leaving an orphaned half-deal in the
 * cockpit. Each /new intake makes a fresh account (timestamped external id), so
 * deleting the account here is safe — nothing else references it.
 */
export async function deleteDealShell(shell: DealShell): Promise<void> {
  const { opportunityId, accountId } = shell;
  const del = (table: string, col: string, val: string) =>
    supabaseAdmin.from(table).delete().eq(col, val);
  await del("execution_artifacts", "opportunity_id", opportunityId);
  await del("activities", "opportunity_id", opportunityId);
  await del("deal_transcripts", "opportunity_id", opportunityId);
  await del("calls", "opportunity_id", opportunityId);
  await del("opportunities", "id", opportunityId);
  await del("stakeholders", "account_id", accountId);
  await del("account_intelligence_artifacts", "account_id", accountId);
  await del("accounts", "id", accountId);
}

export interface CreateResearchInput {
  tenantId: string;
  ownerId: string;
  company: string;
  productContext: string;
  stakeholderHints?: string[];
}

/**
 * Pre-call (NO transcript) deal. Creates account + opportunity only — no call,
 * no activity — so it is NOT a "worked" deal and doesn't burn a free-tier slot
 * until a real call is added later. Returns a shell to research into.
 */
export async function createResearchDeal(input: CreateResearchInput): Promise<DealShell> {
  const { tenantId, ownerId, company } = input;
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const baseName = company.trim() || "New account";
  const externalId = `${slug(baseName) || "deal"}-${stamp}`;

  const { data: acct, error: acctErr } = await supabaseAdmin
    .from("accounts")
    .upsert(
      { tenant_id: tenantId, name: baseName, source_system: "manual", source_external_id: `acct_${externalId}` },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr || !acct) throw new Error(`research: account insert failed: ${acctErr?.message}`);

  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        name: baseName,
        stage_label: "Discovery",
        stage_position: 1,
        total_stages: 5,
        currency: "USD",
        owner_id: ownerId,
        deal_posture: "indeterminate",
        methodology_type: "MEDDPICC",
        methodology_surface_mode: "full",
        last_activity_at: new Date().toISOString(),
        source_system: "manual",
        source_external_id: `opp_${externalId}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr || !opp) throw new Error(`research: opportunity insert failed: ${oppErr?.message}`);

  return { opportunityId: opp.id, accountId: acct.id, externalId };
}

/**
 * Pre-call research: Pass 0 ONLY (no call → no Pass 1.5–4). Researches the
 * company + the named people the rep is about to meet and persists the
 * account-intelligence artifact, so the deal lands on the Account-Intelligence
 * ("before your call") view. A later "+ Add next call" deepens it into a full
 * brief.
 */
/** Persist the AE's own company on the tenant (set once at intake; fills the
 *  firmographics gap that email_domain leaves for personal-email AEs). No-op
 *  when blank; never throws — capture is best-effort, not a gate. */
async function persistSellerCompany(tenantId: string, sellerCompany?: string): Promise<void> {
  const value = (sellerCompany ?? "").trim();
  if (!value) return;
  const { error } = await supabaseAdmin
    .from("tenants")
    .update({ seller_company: value })
    .eq("id", tenantId);
  if (error) console.warn(`[intake] seller_company persist failed: ${error.message}`);
}

/** Fold the seller's company into product_context — the lens Pass 0 already
 *  writes every relevance line through — so the competitive read becomes
 *  seller-aware without touching the substrate engine. */
function withSeller(productContext: string, sellerCompany?: string): string {
  const value = (sellerCompany ?? "").trim();
  return value ? `${productContext}\n\nSold by: ${value}` : productContext;
}

export async function runResearchOnly(args: {
  tenantId: string;
  shell: DealShell;
  company: string;
  productContext: string;
  stakeholderHints?: string[];
  sellerCompany?: string;
}): Promise<void> {
  const { tenantId, shell, company, productContext, stakeholderHints, sellerCompany } = args;
  const { opportunityId, accountId } = shell;

  await persistSellerCompany(tenantId, sellerCompany);

  const intake = await runIntakeSubstrate({
    mode: "pre_call",
    transcript: "",
    product_context: withSeller(productContext, sellerCompany),
    account_name_hint: company,
    stakeholder_hints: stakeholderHints,
  });

  await supabaseAdmin.from("accounts").update({ name: intake.account_name }).eq("id", accountId);
  await supabaseAdmin.from("opportunities").update({ name: intake.opportunity_name }).eq("id", opportunityId);

  console.log(`[research] Pass 0 returned ${intake.participants.length} expected participant(s)`);
  for (const p of intake.participants) {
    if (!p.name) continue;
    const { error: sErr } = await supabaseAdmin.from("stakeholders").insert({
      tenant_id: tenantId,
      account_id: accountId,
      name: p.name,
      email: p.email ?? null,
      title: null,
      company: intake.account_name,
      party: "external",
      committee_role: COMMITTEE_ROLES.has(p.role ?? "") ? (p.role as string) : "unknown",
      // "manual" — rep named who they're meeting (DB CHECK rejects other
      // values like "pre_call_research"; "manual" is allowed + accurate).
      created_via: "manual",
      source_system: "manual",
      source_external_id: `sth_${shell.externalId}_${slug(p.name)}`,
    });
    if (sErr) console.warn(`[research] stakeholder insert (${p.name}) failed: ${sErr.message}`);
  }

  await supabaseAdmin
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("account_id", accountId)
    .eq("is_current", true);
  await supabaseAdmin.from("account_intelligence_artifacts").insert({
    tenant_id: tenantId,
    account_id: accountId,
    opportunity_id: opportunityId,
    artifact: intake.artifact as unknown as Record<string, unknown>,
    primary_source: "web_search",
    is_current: true,
    generated_at: intake.artifact?.metadata?.generated_at ?? new Date().toISOString(),
  });
}

/**
 * SLOW path — the full pipeline. Throws on failure; the caller (a background
 * `after()` task) logs it. Status is observed by the presence of a current
 * execution_artifact (see app/api/intake/status).
 */
export async function runIntakePipeline(args: {
  tenantId: string;
  shell: DealShell;
  transcript: string;
  productContext: string;
  accountNameHint?: string | null;
  sellerCompany?: string;
}): Promise<void> {
  const { tenantId, shell, transcript, productContext, accountNameHint, sellerCompany } = args;
  const { opportunityId, accountId } = shell;

  await persistSellerCompany(tenantId, sellerCompany);

  // ── Pass 0: intake substrate (account facts + stakeholders + AI artifact) ──
  const intake = await runIntakeSubstrate({
    transcript,
    product_context: withSeller(productContext, sellerCompany),
    account_name_hint: accountNameHint ?? undefined,
  });

  // Enrich the placeholder names now that Pass 0 resolved them.
  await supabaseAdmin
    .from("accounts")
    .update({ name: intake.account_name })
    .eq("id", accountId);
  await supabaseAdmin
    .from("opportunities")
    .update({ name: intake.opportunity_name })
    .eq("id", opportunityId);

  // Stakeholders from the extracted participants.
  console.log(`[intake] Pass 0 returned ${intake.participants.length} participant(s)`);
  for (const p of intake.participants) {
    if (!p.name) continue;
    const { error: sErr } = await supabaseAdmin.from("stakeholders").insert(
      {
        tenant_id: tenantId,
        account_id: accountId,
        name: p.name,
        email: p.email ?? null,
        title: null, // Pass 0 participants carry a deal-role, not a job title
        company: intake.account_name,
        party: "external",
        // p.role is the deal role (champion/economic_buyer/…) — map it to
        // committee_role when it's one of the allowed values, else 'unknown'.
        committee_role: COMMITTEE_ROLES.has(p.role ?? "")
          ? (p.role as string)
          : "unknown",
        created_via: "transcript_inference",
        source_system: "manual",
        source_external_id: `sth_${shell.externalId}_${slug(p.name)}`,
      },
    );
    if (sErr) console.warn(`[intake] stakeholder insert (${p.name}) failed: ${sErr.message}`);
  }

  // Account-intelligence artifact (Pass 0). Demote any prior current, insert new.
  await supabaseAdmin
    .from("account_intelligence_artifacts")
    .update({ is_current: false })
    .eq("account_id", accountId)
    .eq("is_current", true);
  await supabaseAdmin.from("account_intelligence_artifacts").insert({
    tenant_id: tenantId,
    account_id: accountId,
    opportunity_id: opportunityId,
    artifact: intake.artifact as unknown as Record<string, unknown>,
    primary_source: "web_search",
    is_current: true,
    generated_at: intake.artifact?.metadata?.generated_at ?? new Date().toISOString(),
  });

  // Build the brief from the assembled substrate (Pass 1.5 → 4).
  await rebuildBrief({ tenantId, opportunityId });
}

/**
 * Pass 1.5 → 4 over whatever calls/activities currently exist on a deal.
 *
 * Reused by the initial intake AND by appendCallAndRebuild (follow-up calls),
 * so a deal's brief always reflects ALL its calls — call #1 becomes "what was
 * said last time" once call #2 lands. Reuses the deal's existing
 * account-intelligence artifact (no Pass 0 re-research), so a follow-up is
 * faster than a first build.
 */
export async function rebuildBrief(args: {
  tenantId: string;
  opportunityId: string;
}): Promise<void> {
  const { tenantId, opportunityId } = args;

  // ── Pass 1.5: assemble the Core Intelligence input from the DB rows ──
  const assembly = await assembleCoreIntelligenceInput({
    tenant_id: tenantId,
    opportunity_id: opportunityId,
  });

  // ── Pass 2: Core Intelligence enrich ──
  const ci = new ProductionCoreIntelligenceAgent();
  const enrichments = await ci.enrich({
    pre_enrichment_input: assembly.input as never,
    config: {
      model: "claude-sonnet-4-6",
      min_confidence: "low",
      include_full_transcripts: false,
      max_intelligence_items: 30,
    },
  });

  // ── Pass 3: apply merge ──
  const merged = applyCoreIntelligence(assembly.input as never, enrichments);

  // Feed-forward: fold the rep's recent cockpit questions into the brief input
  // so the regenerated brief leads with what they've been probing, plus their
  // cross-deal lens (how they reason across deals).
  const [repFocus, crossDealFocus] = await Promise.all([
    getRepFocus({ tenantId, opportunityId }),
    getCrossDealFocus({ tenantId, excludeOpportunityId: opportunityId }),
  ]);
  if (repFocus.length > 0) {
    (merged as { rep_focus?: string[] }).rep_focus = repFocus;
  }
  if (crossDealFocus.length > 0) {
    (merged as { rep_cross_deal_focus?: string[] }).rep_cross_deal_focus =
      crossDealFocus;
  }

  // ── Pass 4: Execution agent → PrepArtifact ──
  const exec = new ProductionExecutionAgent();
  const artifact: PrepArtifact = await exec.execute({
    enriched_input: merged as unknown as Parameters<
      ProductionExecutionAgent["execute"]
    >[0]["enriched_input"],
    config: {},
  });

  // ── Persist the brief (demote prior current, insert new) ──
  await supabaseAdmin
    .from("execution_artifacts")
    .update({ is_current: false })
    .eq("opportunity_id", opportunityId)
    .eq("is_current", true);
  const { error: insErr } = await supabaseAdmin.from("execution_artifacts").insert({
    tenant_id: tenantId,
    opportunity_id: opportunityId,
    artifact: artifact as unknown as Record<string, unknown>,
    prompt_version: artifact.metadata?.prompt_version ?? null,
    model: artifact.metadata?.model ?? null,
    generated_at: artifact.metadata?.generated_at ?? new Date().toISOString(),
    is_current: true,
  });
  if (insErr) throw new Error(`intake: artifact insert failed: ${insErr.message}`);
}

/**
 * Follow-up call on an EXISTING deal. Appends a new call + activity to the
 * opportunity, then rebuilds the brief over ALL its calls. No new opportunity
 * is created — so a follow-up never counts against the free-deal meter, and
 * the brief advances (prior call → "what was said last time"). This is the
 * call-to-call continuity loop for self-serve deals.
 */
export async function appendCallAndRebuild(args: {
  tenantId: string;
  opportunityId: string;
  transcript: string;
}): Promise<void> {
  const { tenantId, opportunityId, transcript } = args;

  // Confirm the opportunity belongs to this tenant and grab its account.
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("id, account_id")
    .eq("id", opportunityId)
    .eq("tenant_id", tenantId)
    .single();
  if (oppErr || !opp) {
    throw new Error("appendCall: opportunity not found for this tenant");
  }

  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const externalId = `followup-${stamp}`;
  const startedAt = new Date().toISOString();

  const { data: call, error: callErr } = await supabaseAdmin
    .from("calls")
    .insert({
      tenant_id: tenantId,
      account_id: opp.account_id,
      opportunity_id: opportunityId,
      provider: "manual",
      title: "Pasted follow-up call",
      started_at: startedAt,
      duration_seconds: 0,
      direction: "outbound",
      party_emails: [],
      summary: transcript,
      key_moments: [],
      transcript: null,
      topics: [],
      triggers: [],
      source_system: "manual",
      source_external_id: `call_${externalId}`,
    })
    .select("id")
    .single();
  if (callErr || !call) {
    throw new Error(`appendCall: call insert failed: ${callErr?.message}`);
  }

  const { error: actErr } = await supabaseAdmin.from("activities").insert({
    tenant_id: tenantId,
    account_id: opp.account_id,
    opportunity_id: opportunityId,
    type: "call",
    occurred_at: startedAt,
    subject: "Pasted follow-up call",
    summary: "Follow-up call pasted by the rep.",
    call_id: call.id,
    source_system: "manual",
    source_external_id: `act_${externalId}`,
  });
  if (actErr) {
    throw new Error(`appendCall: activity insert failed: ${actErr.message}`);
  }

  await supabaseAdmin
    .from("opportunities")
    .update({ last_activity_at: startedAt })
    .eq("id", opportunityId);

  // Rebuild the brief FIRST — it's the failure-prone step. Only once it
  // succeeds do we archive the transcript, which is the metered artifact
  // (the free-tier meter counts deal_transcripts rows). So a failed follow-up
  // rebuild throws WITHOUT persisting a transcript and never burns a free
  // call slot — mirroring the new-deal path's rollback. Ordering is safe:
  // rebuildBrief reads the call substrate, not this archive.
  await rebuildBrief({ tenantId, opportunityId });

  // Archive the follow-up transcript to the deck-copy source, same store and
  // helper as the new-deal path. Without this, a follow-up call never gets a
  // rich deck — the deck-copy agent sees no transcript and falls back to
  // generic slides. Best-effort by construction.
  await saveDealTranscript({
    tenantId,
    opportunityId,
    accountId: opp.account_id,
    source: "intake-followup",
    rawText: transcript,
  });
}
