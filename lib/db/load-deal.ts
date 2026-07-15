/**
 * Loads a deal's full substrate + latest artifacts from Supabase.
 *
 * Reconstructs the JSON shape the prep view already expects, so the only
 * thing that changes for the page is the data source — not the rendering.
 *
 * Usage (server-side only — uses service-role client):
 *   const { substrate, artifact, repBehavior } = await loadDealFromDB(dealId);
 *
 * Returns null if the deal is not found.
 */

import { supabaseAdmin } from "./client";
import { enforceSingleEconomicBuyer } from "@/lib/intelligence/reconcile-economic-buyer";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

export interface LoadedSubstrate {
  opportunity?: {
    id?: string;
    /** Mallin tenant UUID. Needed by callers that route through lib/crm
     *  to dispatch to the right CRM provider for this tenant. */
    tenant_id?: string;
    name?: string;
    stage_label?: string;
    stage_position?: number;
    total_stages?: number;
    deal_posture?: string | null;
    close_date?: string | null;
    last_activity_at?: string | null;
    amount?: number | null;
    currency?: string | null;
  };
  account?: {
    id?: string;
    name?: string;
    industry?: string;
    headquarters?: string;
    size_descriptor?: string;
    /** Macro frame synthesized by the Intelligence Agent. Free text. */
    strategic_priority?: string;
    /** Discrete external observations (news, leadership signals, funding,
     *  etc.) sourced by the Intelligence Agent. Pass 4 reads these as
     *  first-class account-level context. */
    public_signals?: Array<{
      summary: string;
      observed_at: string;
      source: string;
      source_url?: string;
    }>;
  };
  stakeholders?: Array<{
    id: string;
    name: string;
    title?: string;
    company?: string;
    committee_role?: string;
    deal_disposition?: string;
    email?: string;
  }>;
  internal_participants?: Array<{
    id: string;
    name: string;
    email?: string;
    title?: string;
  }>;
  calls?: Array<{
    id: string;
    title?: string;
    started_at?: string;
    duration_seconds?: number;
    summary?: string;
  }>;
  emails?: Array<{
    id: string;
    sent_at?: string;
    subject?: string;
    snippet?: string;
  }>;
  activities?: Array<{
    id: string;
    type: string;
    occurred_at: string;
    subject?: string;
    summary?: string | null;
    source_system?: string;
    with_stakeholder_id?: string;
    crm_sync?: {
      status: "synced" | "failed" | "pending" | "not_configured";
      http_status?: number;
      error?: string;
      attempted_at?: string;
      succeeded_at?: string;
      webhook_url?: string;
    };
  }>;
}

export interface LoadedDeal {
  dealId: string;
  substrate: LoadedSubstrate;
  artifact: PrepArtifact | null;
  /**
   * The most recent prior artifact (is_current=false), if any. Used to
   * surface "what changed" diff indicators after a regeneration so the
   * rep can see at a glance which top-of-page fields shifted.
   */
  previousArtifact: PrepArtifact | null;
  /**
   * True iff there is a touch newer than the current artifact, created
   * within the last 5 minutes. Inferred from data — no schema state.
   * The page uses this to render a "Regenerating brief…" banner +
   * meta-refresh until the new artifact lands. Self-healing: stale
   * in-flight states expire after 5 min, so a crashed background
   * regen doesn't permanently lock the UI.
   */
  regenInFlight: boolean;
  /**
   * created_at of the most recent touch on this deal, ISO string.
   * Exposed so the page can distinguish "regen succeeded for the
   * latest touch" (artifact.generated_at > latestTouchAt) from
   * "regen failed / hasn't run yet" (latestTouchAt > artifact.generated_at).
   * Without this we'd light up diff pills even on a failed regen.
   */
  latestTouchAt: string | null;
  /**
   * All historical PrepArtifact versions for this deal (newest → oldest).
   * Lightweight summary — just the metadata needed to render a version
   * picker at the top of the prep page. Full artifact only loads when
   * a specific version is selected.
   */
  artifactVersions: ArtifactVersionSummary[];
  /**
   * The id of the artifact currently being viewed — matches one of the
   * entries in artifactVersions. null when no artifact exists at all.
   */
  currentArtifactId: string | null;
}

export interface ArtifactVersionSummary {
  id: string;
  generated_at: string;
  is_current: boolean;
  posture: string | null;
  /** Short label like "May 14 · advancing" for the picker UI. */
  label: string;
}

export async function loadDealFromDB(
  dealId: string,
  /**
   * Optional execution_artifact id. When provided, that specific historical
   * brief is loaded as `artifact`; the immediately-prior (by generated_at)
   * becomes `previousArtifact`. When omitted (default), behavior is
   * unchanged: load the is_current=true artifact + the most recent
   * is_current=false as the diff base.
   */
  artifactId?: string,
): Promise<LoadedDeal | null> {
  // Load opportunity (deal)
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("*")
    .eq("id", dealId)
    .maybeSingle();
  if (oppErr || !opp) return null;

  // Everything below is independent of everything else: the account-scoped
  // reads need opp.account_id, the rest are keyed on dealId. Firing them
  // serially was ~10 blocking round-trips (~900ms observed); run them as one
  // concurrent batch instead. The artifact + latest-touch reads join it too.
  const accountId = opp.account_id;
  const artifactQuery = artifactId
    ? supabaseAdmin
        .from("execution_artifacts")
        .select("artifact, generated_at")
        .eq("opportunity_id", dealId)
        .eq("id", artifactId)
        .maybeSingle()
    : supabaseAdmin
        .from("execution_artifacts")
        .select("artifact, generated_at")
        .eq("opportunity_id", dealId)
        .eq("is_current", true)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const [
    { data: acct },
    { data: publicSignals },
    { data: stakeholders },
    { data: internal },
    { data: calls },
    { data: emails },
    { data: activities },
    { data: touches },
    { data: artRow },
    { data: latestTouch },
  ] = await Promise.all([
    // Account
    supabaseAdmin.from("accounts").select("*").eq("id", accountId).maybeSingle(),
    // Public signals (Intelligence Agent output — Layer 1 substrate). Loaded
    // onto substrate.account.public_signals so Pass 4 reads them as first-class
    // account-level context. Newest first; cap at 8 for prompt-token budget.
    supabaseAdmin
      .from("public_signals")
      .select("summary, observed_at, source, source_url")
      .eq("account_id", accountId)
      .order("observed_at", { ascending: false })
      .limit(8),
    // Stakeholders
    supabaseAdmin.from("stakeholders").select("*").eq("account_id", accountId),
    // Internal participants (seller side)
    supabaseAdmin
      .from("internal_participants")
      .select("*")
      .eq("opportunity_id", dealId),
    // Calls
    supabaseAdmin
      .from("calls")
      .select("id, title, started_at, duration_seconds, summary")
      .eq("opportunity_id", dealId)
      .order("started_at", { ascending: true }),
    // Emails
    supabaseAdmin
      .from("emails")
      .select("id, sent_at, subject, snippet")
      .eq("opportunity_id", dealId)
      .order("sent_at", { ascending: true }),
    // Activities (calls + emails + meetings)
    supabaseAdmin
      .from("activities")
      .select("id, type, occurred_at, subject, summary, source_system")
      .eq("opportunity_id", dealId)
      .order("occurred_at", { ascending: true }),
    // Touches — reconstituted below as off_platform_touch activities so the
    // page renders them in the same Off-platform touches block it does today.
    supabaseAdmin
      .from("touches")
      .select(
        "id, occurred_at, subject, body, source_system, with_stakeholder_id, crm_sync_status, crm_sync_meta, source_external_id",
      )
      .eq("opportunity_id", dealId)
      .order("occurred_at", { ascending: false }),
    // Pass 4 artifact — the requested version, or the current one.
    artifactQuery,
    // Latest touch — for the regen-in-flight inference below.
    supabaseAdmin
      .from("touches")
      .select("created_at")
      .eq("opportunity_id", dealId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const touchActivities = (touches ?? []).map((t) => ({
    id: t.id,
    type: "off_platform_touch",
    occurred_at: t.occurred_at,
    subject: t.subject ?? undefined,
    summary: t.body,
    source_system: t.source_system,
    with_stakeholder_id: t.with_stakeholder_id ?? undefined,
    crm_sync: t.crm_sync_status
      ? { status: t.crm_sync_status, ...(t.crm_sync_meta as object) }
      : undefined,
  }));

  // Pass 4 artifact — resolved in the batch above (explicit id or current).
  const artifact = (artRow?.artifact ?? null) as PrepArtifact | null;
  const selectedGeneratedAt = artRow?.generated_at ?? null;

  // Prior artifact — for diff display. When viewing a specific historical
  // brief, "prior" means the one generated immediately before it (by date).
  // When viewing current, "prior" stays as the most recent is_current=false.
  let previousArtifact: PrepArtifact | null = null;
  if (selectedGeneratedAt) {
    const { data: prevRow } = await supabaseAdmin
      .from("execution_artifacts")
      .select("artifact")
      .eq("opportunity_id", dealId)
      .lt("generated_at", selectedGeneratedAt)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    previousArtifact = (prevRow?.artifact ?? null) as PrepArtifact | null;
  }

  // ── Infer regen-in-flight from data ──────────────────────────────────
  // True when the rep just logged a touch and the regen hasn't finished
  // landing a new artifact yet. We define "in flight" as: the latest
  // touch's created_at is newer than the current artifact's generated_at,
  // AND that touch was created within the last 5 minutes. The 5-min
  // ceiling is the self-healing window — if regen crashed, the UI
  // unlocks itself instead of staying pinned forever. (latestTouch is read
  // in the batch above.)
  const latestTouchAt = latestTouch?.created_at ?? null;

  let regenInFlight = false;
  const currentArtGeneratedAt = artifact?.metadata?.generated_at;
  if (currentArtGeneratedAt && latestTouchAt) {
    const touchTime = new Date(latestTouchAt).getTime();
    const artTime = new Date(currentArtGeneratedAt).getTime();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    regenInFlight = touchTime > artTime && touchTime > fiveMinAgo;
  }

  const substrate: LoadedSubstrate = {
    opportunity: {
      id: opp.id,
      tenant_id: opp.tenant_id,
      name: opp.name,
      stage_label: opp.stage_label,
      stage_position: opp.stage_position ?? undefined,
      total_stages: opp.total_stages ?? undefined,
      deal_posture: opp.deal_posture,
      close_date: opp.close_date,
      last_activity_at: opp.last_activity_at,
      amount: opp.amount != null ? Number(opp.amount) : null,
      currency: opp.currency ?? null,
    },
    account: acct
      ? {
          id: acct.id,
          name: acct.name,
          industry: acct.industry ?? undefined,
          headquarters: acct.headquarters ?? undefined,
          size_descriptor: acct.size_descriptor ?? undefined,
          strategic_priority: acct.strategic_priority ?? undefined,
          public_signals: (publicSignals ?? []).map((p) => ({
            summary: p.summary,
            observed_at: p.observed_at,
            source: p.source,
            source_url: p.source_url ?? undefined,
          })),
        }
      : undefined,
    stakeholders: enforceSingleEconomicBuyer(
      (stakeholders ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title ?? undefined,
        company: s.company ?? undefined,
        committee_role: s.committee_role ?? undefined,
        email: s.email ?? undefined,
      })),
    ),
    internal_participants: (internal ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? undefined,
      title: p.title ?? undefined,
    })),
    calls: (calls ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? undefined,
      started_at: c.started_at ?? undefined,
      duration_seconds: c.duration_seconds ?? undefined,
      summary: c.summary ?? undefined,
    })),
    emails: (emails ?? []).map((e) => ({
      id: e.id,
      sent_at: e.sent_at ?? undefined,
      subject: e.subject ?? undefined,
      snippet: e.snippet ?? undefined,
    })),
    activities: [
      ...(activities ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        occurred_at: a.occurred_at,
        subject: a.subject ?? undefined,
        summary: a.summary ?? null,
        source_system: a.source_system ?? undefined,
      })),
      ...touchActivities,
    ].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
  };

  // Full history — newest → oldest. The version picker reads this.
  const { data: allVersions } = await supabaseAdmin
    .from("execution_artifacts")
    .select("id, generated_at, is_current, artifact")
    .eq("opportunity_id", dealId)
    .order("generated_at", { ascending: false });

  const artifactVersions: ArtifactVersionSummary[] = (allVersions ?? []).map(
    (row) => {
      const a = row.artifact as PrepArtifact | null;
      const posture = a?.top_line?.posture ?? null;
      const date = new Date(row.generated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      return {
        id: row.id,
        generated_at: row.generated_at,
        is_current: row.is_current,
        posture,
        label: posture ? `${date} · ${posture}` : date,
      };
    },
  );

  const currentArtifactId =
    (allVersions ?? []).find((v) =>
      artifactId ? v.id === artifactId : v.is_current,
    )?.id ?? null;

  return {
    dealId,
    substrate,
    artifact,
    previousArtifact,
    regenInFlight,
    latestTouchAt,
    artifactVersions,
    currentArtifactId,
  };
}

/**
 * Lightweight deal-list query for /manager-style index pages later.
 * Returns minimum fields per deal in a tenant.
 */
export async function listDealsForTenant(tenantId: string) {
  const { data } = await supabaseAdmin
    .from("opportunities")
    .select(
      "id, name, stage_label, stage_position, total_stages, deal_posture, close_date, account_id",
    )
    .eq("tenant_id", tenantId)
    .order("last_activity_at", { ascending: false });
  return data ?? [];
}
