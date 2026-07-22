/**
 * load-internal-brief-sources — the ONLY module in the internal-brief pipeline
 * that touches the database (Commit 4).
 *
 * After the route has authenticated + authorized, this loads the LATEST
 * AVAILABLE SOURCE BUNDLE for one authorized opportunity — the current
 * opportunity row, the current account-intelligence artifact, the current
 * execution (prep) artifact, and the explicitly-attributed MeetingBlock. Every
 * read is scoped to both the tenant and the opportunity.
 *
 * It deliberately does NOT load raw transcript text (`deal_transcripts`): the
 * only meeting evidence used is the attributed MeetingBlock quotes + the
 * meeting metadata needed for the latest-incorporated-call date. Nothing here
 * is treated as a historical snapshot — the bundle is "latest available", not a
 * point-in-time comparison base.
 *
 * The pure adapter / evidence / validator / model / renderer modules never see
 * a database client — they consume the plain `InternalBriefSources` value.
 */

import { supabaseAdmin } from "@/lib/db/client";
import type { AccountIntelligenceArtifact, MeetingBlock } from "@/lib/intelligence/types";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

/** Immutable current-source coordinates → deterministic bundle version. */
export interface BundleCoordinates {
  opportunityId: string;
  opportunityUpdatedAt?: string;
  intelligenceArtifactId: string;
  executionArtifactId: string;
  meetingRecordId?: string;
}

export interface InternalBriefSources {
  tenantId: string;
  dealId: string;
  opportunity: {
    id: string;
    name: string;
    stageLabel: string | null;
    amount: number | null;
    currency: string | null;
    closeDate: string | null;
  };
  companyName: string | null;
  intelligence: { artifactId: string; artifact: AccountIntelligenceArtifact };
  execution: { artifactId: string; artifact: PrepArtifact; generatedAt: string };
  /** Attributed meeting evidence (quotes + attendees). Null when none exists. */
  meeting: MeetingBlock | null;
  coords: BundleCoordinates;
}

export type LoadSourcesResult =
  | { ok: true; sources: InternalBriefSources }
  | { ok: false; code: "deal_not_found" | "required_artifact_missing" | "current_artifact_conflict" };

/** Distinguish zero / exactly-one / multiple current rows. We never silently
 *  pick the newest when more than one is_current row exists — that would be an
 *  undocumented recovery rule; instead we fail closed. */
function pickCurrent<T>(rows: T[] | null | undefined): { state: "none" } | { state: "one"; row: T } | { state: "conflict" } {
  const list = rows ?? [];
  if (list.length === 0) return { state: "none" };
  if (list.length > 1) return { state: "conflict" };
  return { state: "one", row: list[0] };
}

/** Load the tenant-scoped current source bundle for an already-authorized deal. */
export async function loadInternalBriefSources(dealId: string, tenantId: string): Promise<LoadSourcesResult> {
  const { data: opp } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, stage_label, amount, currency, close_date, last_activity_at, accounts(name)")
    .eq("id", dealId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!opp) return { ok: false, code: "deal_not_found" };

  const { data: intelRows } = await supabaseAdmin
    .from("account_intelligence_artifacts")
    .select("id, artifact")
    .eq("opportunity_id", dealId)
    .eq("tenant_id", tenantId)
    .eq("is_current", true);
  const intelPick = pickCurrent(intelRows as Array<{ id: string; artifact: unknown }> | null);
  if (intelPick.state === "none") return { ok: false, code: "required_artifact_missing" };
  if (intelPick.state === "conflict") return { ok: false, code: "current_artifact_conflict" };
  const intel = intelPick.row;

  const { data: execRows } = await supabaseAdmin
    .from("execution_artifacts")
    .select("id, artifact, generated_at")
    .eq("opportunity_id", dealId)
    .eq("tenant_id", tenantId)
    .eq("is_current", true);
  const execPick = pickCurrent(execRows as Array<{ id: string; artifact: unknown; generated_at: string }> | null);
  if (execPick.state === "none") return { ok: false, code: "required_artifact_missing" };
  if (execPick.state === "conflict") return { ok: false, code: "current_artifact_conflict" };
  const exec = execPick.row;

  const intelArtifact = intel.artifact as AccountIntelligenceArtifact;
  const meeting = intelArtifact.meeting ?? null;
  const accountName = (opp.accounts as unknown as { name?: string } | null)?.name ?? intelArtifact.account?.name ?? null;

  return {
    ok: true,
    sources: {
      tenantId,
      dealId,
      opportunity: {
        id: opp.id as string,
        name: (opp.name as string | null) ?? "Deal",
        stageLabel: (opp.stage_label as string | null) ?? null,
        amount: opp.amount != null ? Number(opp.amount) : null,
        currency: (opp.currency as string | null) ?? null,
        closeDate: (opp.close_date as string | null) ?? null,
      },
      companyName: accountName,
      intelligence: { artifactId: intel.id as string, artifact: intelArtifact },
      execution: { artifactId: exec.id as string, artifact: exec.artifact as PrepArtifact, generatedAt: exec.generated_at as string },
      meeting,
      coords: {
        opportunityId: opp.id as string,
        opportunityUpdatedAt: (opp.last_activity_at as string | null) ?? undefined,
        intelligenceArtifactId: intel.id as string,
        executionArtifactId: exec.id as string,
        meetingRecordId: meeting?.deck_copy_source_at ?? meeting?.date ?? undefined,
      },
    },
  };
}
