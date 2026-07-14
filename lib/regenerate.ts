/**
 * ============================================================================
 *  Brief Regeneration — Pass 4 against updated substrate
 * ============================================================================
 *
 *  Closes the loop: a new touch in the DB triggers a fresh Pass 4 run, the
 *  resulting PrepArtifact lands in execution_artifacts (is_current=true),
 *  the prior artifact is demoted to is_current=false (preserved for diff).
 *
 *  MVP STRATEGY (fixture overlay)
 *  ──────────────────────────────
 *  Pass 4 needs a rich ExecutionAgentInput (meeting, context, intelligence,
 *  conflicts, methodology pillars, etc.) that the DB doesn't yet model in
 *  full. Rather than rebuild that mapper now, we:
 *
 *   1. Find the canonical Pass 3-merged JSON for the deal (looked up by
 *      the opportunity's source_external_id, which matches the fixture's
 *      opportunity.id).
 *   2. Replace the fixture's `off_platform_touch` activities with the
 *      DB's current touches (source of truth post-seed). Calls + emails
 *      stay as-is from the fixture — they don't change between
 *      regenerations.
 *   3. Run ProductionExecutionAgent.execute() against the merged input.
 *   4. Persist the new artifact to execution_artifacts (mark prior current
 *      as is_current=false).
 *
 *  This is honest about what we're doing: the input to Pass 4 is
 *  fixture + DB-touches, not pure DB. When the substrate is fully
 *  modeled in Postgres (calls, emails, meeting, intelligence, conflicts
 *  all in tables with normalizers), this kludge collapses into a single
 *  loadDealAsExecutionAgentInput() function.
 *
 *  FAILURE MODES
 *  ─────────────
 *  - Fixture not found → ok:false ("no_fixture")
 *  - Anthropic API error / Layer A failure → ok:false (error message)
 *  - DB write error → ok:false (error message)
 *  Caller decides what to do; the touch save is independent and already
 *  succeeded by the time this runs.
 * ============================================================================
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "./db/client";
import { ProductionExecutionAgent } from "./agents/execution-agent";
import { withUsageContext } from "@/lib/billing/usage-context";
import type {
  PrepArtifact,
  DealAltitude,
} from "./contracts/execution-agent-output";
import { filterPreMortemPaths } from "./contracts/pre-mortem-filter";

const FIXTURES_DIR = resolve(process.cwd(), "scripts/_fixtures");

// ────────────────────────────────────────────────────────────────────────────
// Fixture map: opportunity.id (== source_external_id) → fixture path
// ────────────────────────────────────────────────────────────────────────────

let _fixtureMap: Map<string, string> | null = null;

function getFixtureMap(): Map<string, string> {
  if (_fixtureMap) return _fixtureMap;
  const map = new Map<string, string>();
  if (!existsSync(FIXTURES_DIR)) {
    _fixtureMap = map;
    return map;
  }
  const files = readdirSync(FIXTURES_DIR).filter((f) =>
    f.endsWith("-substrate-full.pass3-merged.json"),
  );
  for (const f of files) {
    try {
      const fixture = JSON.parse(
        readFileSync(resolve(FIXTURES_DIR, f), "utf-8"),
      );
      const oppId: string | undefined = fixture?.opportunity?.id;
      if (oppId) map.set(oppId, resolve(FIXTURES_DIR, f));
    } catch {
      // ignore malformed fixture
    }
  }
  _fixtureMap = map;
  return map;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export type RegenResult =
  | {
      ok: true;
      artifact: PrepArtifact;
      prevArtifact: PrepArtifact | null;
      latency_ms: number;
      attempts: number;
    }
  | {
      ok: false;
      error: string;
      reason: "no_fixture" | "agent_failure" | "db_failure" | "deal_not_found";
    };

/**
 * Regenerate the Pass 4 brief for a deal whose substrate just changed.
 * Reads the deal's source_external_id from the DB to find the canonical
 * fixture, overlays current DB touches onto its activities, runs Pass 4,
 * and persists the new artifact.
 */
export async function regenerateBriefForDeal(
  dealId: string,
  options: { declared_altitude?: DealAltitude | null } = {},
): Promise<RegenResult> {
  const { declared_altitude = null } = options;
  // ── 1. Resolve fixture path from deal's source_external_id ──────────────
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("id, tenant_id, source_external_id")
    .eq("id", dealId)
    .maybeSingle();
  if (oppErr || !opp) {
    return { ok: false, error: "deal not found", reason: "deal_not_found" };
  }
  const oppExternalId = opp.source_external_id;
  const fixturePath = oppExternalId
    ? getFixtureMap().get(oppExternalId)
    : undefined;
  if (!fixturePath) {
    return {
      ok: false,
      error: `no Pass 3-merged fixture found for source_external_id=${oppExternalId}`,
      reason: "no_fixture",
    };
  }

  // ── 2. Load fixture + overlay DB touches ────────────────────────────────
  let enrichedInput: Record<string, unknown>;
  try {
    enrichedInput = JSON.parse(readFileSync(fixturePath, "utf-8"));
  } catch (err) {
    return {
      ok: false,
      error: `failed to load fixture ${fixturePath}: ${(err as Error).message}`,
      reason: "no_fixture",
    };
  }

  const { data: dbTouches } = await supabaseAdmin
    .from("touches")
    .select(
      "id, occurred_at, subject, body, source_system, source_external_id, with_stakeholder_id, attendee_emails",
    )
    .eq("opportunity_id", dealId)
    .order("occurred_at", { ascending: true });

  const accountId = (enrichedInput.account as { id?: string })?.id ?? null;
  const opportunityId =
    (enrichedInput.opportunity as { id?: string })?.id ?? oppExternalId;

  // Touches may have stakeholder_id as a DB UUID — translate back to fixture
  // stakeholder ids (e.g. "sth_leo_le") so the activity links correctly.
  const stakeholderUuidToExt = await loadStakeholderUuidMap(opp.tenant_id);

  const touchActivities = (dbTouches ?? []).map((t) => {
    const stExt = t.with_stakeholder_id
      ? (stakeholderUuidToExt.get(t.with_stakeholder_id) ?? undefined)
      : undefined;
    return {
      id: `act_${t.source_external_id}`,
      account_id: accountId,
      opportunity_id: opportunityId,
      type: "off_platform_touch",
      occurred_at: t.occurred_at,
      subject:
        t.subject ??
        `Off-platform touch — ${(t.body ?? "").slice(0, 80)}`,
      summary: t.body,
      rep_note: null,
      call_id: null,
      email_id: null,
      meeting_id: null,
      off_platform_touch_id: t.source_external_id,
      attendee_emails: t.attendee_emails ?? [],
      source_system: t.source_system ?? "rep_log",
      source_external_id: t.source_external_id,
      anchor_type: "opportunity_anchored",
      with_stakeholder_id: stExt,
    };
  });

  // Replace fixture's off_platform_touches with DB versions; keep calls/emails.
  const fixtureActivities = Array.isArray(enrichedInput.activities)
    ? (enrichedInput.activities as Array<{ type?: string }>)
    : [];
  const nonTouchActivities = fixtureActivities.filter(
    (a) => a.type !== "off_platform_touch",
  );
  enrichedInput.activities = [
    ...nonTouchActivities,
    ...touchActivities,
  ].sort((a, b) =>
    String((a as { occurred_at?: string }).occurred_at ?? "").localeCompare(
      String((b as { occurred_at?: string }).occurred_at ?? ""),
    ),
  );

  // ── 3. Run Pass 4 ────────────────────────────────────────────────────────
  let artifact: PrepArtifact;
  try {
    const agent = new ProductionExecutionAgent();
    // Attribute this regeneration's model cost to the deal's tenant.
    artifact = await withUsageContext(
      { tenantId: opp.tenant_id, opportunityId: dealId },
      () =>
        agent.execute({
          enriched_input:
            enrichedInput as unknown as Parameters<
              ProductionExecutionAgent["execute"]
            >[0]["enriched_input"],
          config: { declared_altitude },
        }),
    );
  } catch (err) {
    return {
      ok: false,
      error: `Pass 4 agent failed: ${(err as Error).message}`,
      reason: "agent_failure",
    };
  }

  // ── 4. Capture previous artifact (for diff), demote it, insert new ──────
  const { data: prevRow } = await supabaseAdmin
    .from("execution_artifacts")
    .select("artifact")
    .eq("opportunity_id", dealId)
    .eq("is_current", true)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevArtifact = (prevRow?.artifact ?? null) as PrepArtifact | null;

  // ── 4a. Pre-render filter on pre-mortem paths ───────────────────────────
  // Layer A/B blocked-and-retried at agent time. The filter is the
  // best-effort cleanup: drops stale/duplicate/low-impact paths and caps
  // at 3, ranked by likelihood × severity with recency tie-break. The
  // load-bearing rule here is "stale vs. previous artifact" — protects
  // against smart-nagging.
  if (artifact.pre_mortem_paths && artifact.pre_mortem_paths.length > 0) {
    const filtered = filterPreMortemPaths(
      artifact.pre_mortem_paths,
      prevArtifact,
    );
    artifact.pre_mortem_paths = filtered.paths;
    if (filtered.dropped.length > 0) {
      console.log(
        `[regen] ${dealId}: dropped ${filtered.dropped.length} pre-mortem path(s):`,
        filtered.dropped,
      );
    }
  }

  const { error: demoteErr } = await supabaseAdmin
    .from("execution_artifacts")
    .update({ is_current: false })
    .eq("opportunity_id", dealId)
    .eq("is_current", true);
  if (demoteErr) {
    return {
      ok: false,
      error: `failed to demote prior artifact: ${demoteErr.message}`,
      reason: "db_failure",
    };
  }

  const { error: insErr } = await supabaseAdmin
    .from("execution_artifacts")
    .insert({
      tenant_id: opp.tenant_id,
      opportunity_id: dealId,
      artifact: artifact as unknown as Record<string, unknown>,
      prompt_version: artifact.metadata?.prompt_version ?? null,
      model: artifact.metadata?.model ?? null,
      generated_at: artifact.metadata?.generated_at ?? new Date().toISOString(),
      is_current: true,
    });
  if (insErr) {
    return {
      ok: false,
      error: `failed to insert new artifact: ${insErr.message}`,
      reason: "db_failure",
    };
  }

  return {
    ok: true,
    artifact,
    prevArtifact,
    latency_ms: artifact.metadata?.latency_ms ?? 0,
    attempts: artifact.metadata?.attempts ?? 1,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function loadStakeholderUuidMap(
  tenantId: string,
): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from("stakeholders")
    .select("id, source_external_id")
    .eq("tenant_id", tenantId);
  const map = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.source_external_id) map.set(r.id, r.source_external_id);
  }
  return map;
}
