/**
 * Seed the full demo pipeline (lib/demo/pipeline-deals.ts) into the mallin-demo
 * tenant — accounts, opportunities, stakeholders, internal participants, calls,
 * the Pass-4 brief (execution_artifact), and deal_outcomes for closed deals.
 *
 * Run: tsx --env-file=.env.local scripts/db/seed-demo-pipeline.ts
 * Idempotent: upserts on (tenant, source_system, source_external_id); the brief
 * uses demote-then-insert so the cockpit always reads the latest is_current.
 */
import { createClient } from "@supabase/supabase-js";
import { DEMO_PIPELINE } from "../../lib/demo/pipeline-deals";
import { brief, type DemoDeal } from "../../lib/demo/pipeline";

const SLUG = "mallin-demo";
const NAME = "Mallin Demo";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing (run with tsx --env-file=.env.local)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
type C = ReturnType<typeof client>;

const ROLE_MAP: Record<string, string> = {
  champion: "champion",
  economic_buyer: "economic_buyer",
  user: "user",
  procurement: "influencer",
  technical: "technical_buyer",
};
const POSTURE_MAP: Record<string, string> = {
  at_risk: "at_risk",
  stalled: "stalled",
  on_track: "advancing",
  advancing: "advancing",
};
const email = (name: string, domain: string) =>
  `${name.toLowerCase().replace(/\s+/g, ".")}@${domain}`;

async function ensureTenant(c: C): Promise<string> {
  const { data: existing } = await c
    .from("tenants")
    .select("id, is_demo")
    .eq("slug", SLUG)
    .maybeSingle();
  if (existing) {
    if (!existing.is_demo) await c.from("tenants").update({ is_demo: true }).eq("id", existing.id);
    console.log(`✓ tenant: ${existing.id} (${SLUG})`);
    return existing.id as string;
  }
  const { data: created, error } = await c
    .from("tenants")
    .insert({ slug: SLUG, name: NAME, is_demo: true, crm_provider: "hubspot", enabled_sinks: ["slack"] })
    .select("id")
    .single();
  if (error || !created) throw new Error(`tenant insert failed: ${error?.message}`);
  console.log(`+ tenant created: ${created.id}`);
  return created.id as string;
}

async function seedDeal(c: C, tenantId: string, d: DemoDeal) {
  const slug = d.key;

  const { data: acct, error: acctErr } = await c
    .from("accounts")
    .upsert(
      {
        tenant_id: tenantId,
        name: d.account.name,
        industry: d.account.industry,
        size_descriptor: null,
        headquarters: null,
        website: null,
        strategic_priority: null,
        source_system: "manual",
        source_external_id: `acct_${slug}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (acctErr) throw new Error(`[${slug}] account: ${acctErr.message}`);

  const lastCall = d.calls[d.calls.length - 1]?.date ?? d.deal.closeDate;
  const { data: opp, error: oppErr } = await c
    .from("opportunities")
    .upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        name: d.deal.name,
        stage_label: d.deal.stageLabel,
        stage_position: d.deal.stagePosition,
        total_stages: d.deal.totalStages,
        amount: d.deal.arr,
        currency: "USD",
        close_date: d.deal.closeDate,
        owner_id: "demo_user_placeholder",
        deal_posture: POSTURE_MAP[d.brief.posture],
        methodology_type: d.deal.methodology,
        methodology_surface_mode: "full",
        last_activity_at: lastCall,
        source_system: "manual",
        source_external_id: `opp_${slug}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    )
    .select("id")
    .single();
  if (oppErr) throw new Error(`[${slug}] opportunity: ${oppErr.message}`);

  for (const s of d.stakeholders) {
    const { error } = await c.from("stakeholders").upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        name: s.name,
        email: email(s.name, d.account.domain),
        title: s.title,
        company: d.account.name,
        party: "external",
        committee_role: ROLE_MAP[s.role] ?? "unknown",
        created_via: "manual",
        source_system: "manual",
        source_external_id: `sth_${slug}_${s.name.toLowerCase().replace(/\s+/g, "_")}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    );
    if (error) console.warn(`  ⚠ [${slug}] stakeholder ${s.name}: ${error.message}`);
  }

  for (const p of [
    { name: "Demo Rep", title: "Account Executive", role: "user" },
    { name: "Demo SE", title: "Solutions Engineer", role: "technical_buyer" },
  ]) {
    const { error } = await c.from("internal_participants").upsert(
      {
        tenant_id: tenantId,
        opportunity_id: opp.id,
        account_id: acct.id,
        name: p.name,
        email: email(p.name, "mallin.io"),
        title: p.title,
        company: "Mallin",
        party: "internal",
        committee_role: p.role,
        source_system: "manual",
        source_external_id: `int_${slug}_${p.name.toLowerCase().replace(/\s+/g, "_")}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    );
    if (error) console.warn(`  ⚠ [${slug}] internal ${p.name}: ${error.message}`);
  }

  for (const cl of d.calls) {
    const summary = [cl.summary, "", "Key excerpts:", ...cl.excerpts.map((e) => `  [${e.speaker}] "${e.quote}"`)].join("\n");
    const { error } = await c.from("calls").upsert(
      {
        tenant_id: tenantId,
        account_id: acct.id,
        opportunity_id: opp.id,
        provider: "gong",
        title: cl.title,
        started_at: new Date(`${cl.date}T10:00:00Z`).toISOString(),
        duration_seconds: cl.durationMin * 60,
        direction: "outbound",
        party_emails: cl.attendees.map((a) => email(a.name, d.account.domain)),
        summary,
        key_moments: [],
        transcript: null,
        topics: [],
        triggers: [],
        source_system: "manual",
        source_external_id: `call_${slug}_${cl.id}`,
      },
      { onConflict: "tenant_id,source_system,source_external_id" },
    );
    if (error) console.warn(`  ⚠ [${slug}] call ${cl.title}: ${error.message}`);
  }

  const artifact = brief(d);
  await c.from("execution_artifacts").update({ is_current: false }).eq("opportunity_id", opp.id).eq("is_current", true);
  const meta = artifact.metadata as { prompt_version?: string; model?: string; generated_at?: string };
  const { error: artErr } = await c.from("execution_artifacts").insert({
    tenant_id: tenantId,
    opportunity_id: opp.id,
    artifact,
    prompt_version: meta?.prompt_version ?? null,
    model: meta?.model ?? null,
    generated_at: meta?.generated_at ?? new Date().toISOString(),
    is_current: true,
  });
  if (artErr) console.warn(`  ⚠ [${slug}] artifact: ${artErr.message}`);

  if (d.outcome) {
    const { error: outErr } = await c.from("deal_outcomes").upsert(
      {
        tenant_id: tenantId,
        opportunity_id: opp.id,
        outcome: d.outcome.outcome,
        closed_at: d.outcome.closedAt,
        amount: d.deal.arr,
        currency: "USD",
        risk_materialized: d.outcome.riskMaterialized,
        move_taken: d.outcome.moveTaken,
        notes: d.outcome.notes,
        created_by: "demo-seed",
      },
      { onConflict: "opportunity_id" },
    );
    if (outErr) console.warn(`  ⚠ [${slug}] outcome: ${outErr.message}`);
  }

  console.log(`  ✓ ${d.account.name} (${d.brief.posture}${d.outcome ? ` · ${d.outcome.outcome}` : ""})`);
}

async function main() {
  const c = client();
  const tenantId = await ensureTenant(c);
  console.log(`\nSeeding ${DEMO_PIPELINE.length} deals…`);
  for (const d of DEMO_PIPELINE) await seedDeal(c, tenantId, d);
  console.log(`\n✓ done — ${DEMO_PIPELINE.length} deals in ${SLUG}`);
}

main().catch((e) => {
  console.error("seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
