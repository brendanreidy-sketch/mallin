/**
 * generate-internal-brief — orchestration for the internal executive brief
 * (Commit 4). No database client enters here or anything it calls; it receives
 * the already-loaded `InternalBriefSources` and an INJECTED model client.
 *
 * Pipeline: sources → pure adapter → evidence packet → ChangeSet(previous=null)
 * → validated brief agent → PowerPoint renderer.
 *
 * Phase-1 decisions (approved):
 *   - `previous = null` ALWAYS. There is no populated intelligence↔execution
 *     lineage and no opportunity-field history, so a prior-state comparison
 *     cannot be proven — the "What changed" section is omitted deterministically
 *     (detectChanges returns hasPriorState:false + an unresolved diagnostic).
 *   - The current opportunity/intelligence/execution/meeting records are the
 *     "latest available source bundle", NOT a historical snapshot. The bundle
 *     version is a collision-safe deterministic hash of immutable current
 *     source coordinates — never a single artifact id.
 */

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { buildEvidencePacket, packComponents } from "@/lib/deck/brief-evidence";
import { detectChanges } from "@/lib/deck/brief-change-detection";
import { toDealSnapshot, type AdapterTranscript, type BriefSourceRecords } from "@/lib/deck/brief-artifact-adapter";
import { createJsonBriefClient, generateExecutiveBrief, type BriefModelClient } from "@/lib/deck/brief-agent";
import { buildBriefPptx, type RenderDiagnostic } from "@/lib/deck/build-brief-pptx";
import type { MeetingBlock } from "@/lib/intelligence/types";
import { SONNET_MODEL } from "@/lib/agents/model-config";
import type { BundleCoordinates, InternalBriefSources } from "@/lib/deck/load-internal-brief-sources";

/** Default model tier — the SHARED config, not a brief-specific constant. */
export const DEFAULT_BRIEF_MODEL = SONNET_MODEL;

export type InternalBriefResult =
  | { ok: true; buffer: Buffer; filename: string; bundleVersion: string; modelId: string; diagnostics: RenderDiagnostic[] }
  | { ok: false; code: "brief_failed_validation" | "model_generation_failed" | "brief_render_failed" };

export interface GenerateInternalBriefArgs {
  sources: InternalBriefSources;
  cover: { dealName: string; companyName?: string; asOf: string };
  modelClient: BriefModelClient;
  modelId?: string;
  /** Overrides the capturedAt (defaults to the execution artifact's time). */
  capturedAt?: string;
}

// ── deterministic bundle version (immutable current-source coordinates) ─────

/** Collision-safe, order-independent bundle version. Built from named
 *  coordinates (sorted, length-prefix packed) then hashed — reordering the
 *  input changes nothing; changing any one coordinate changes the version. */
export function computeBundleVersion(coords: BundleCoordinates): { full: string; short: string } {
  const entries: Array<[string, string]> = [
    ["opportunityId", coords.opportunityId],
    ["opportunityUpdatedAt", coords.opportunityUpdatedAt ?? ""],
    ["intelligenceArtifactId", coords.intelligenceArtifactId],
    ["executionArtifactId", coords.executionArtifactId],
    ["meetingRecordId", coords.meetingRecordId ?? ""],
  ];
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const full = packComponents(entries.flatMap(([k, v]) => [k, v]));
  const short = createHash("sha256").update(full).digest("hex").slice(0, 12);
  return { full, short };
}

// ── source bundle → pure adapter input ──────────────────────────────────────

function segmentId(text: string): string {
  // Immutable content identity for a quote — never an array index.
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** MeetingBlock → a single attributed transcript. Only explicitly-attributed
 *  quotes are used; the adapter resolves buyer/seller side ONLY from an
 *  attendee explicitly marked with that side (ambiguous → unknown). No raw
 *  transcript body is ever included. */
function meetingToTranscript(meeting: MeetingBlock): AdapterTranscript {
  return {
    transcriptId: `meeting:${meeting.deck_copy_source_at ?? meeting.date ?? "unknown"}`,
    callDate: meeting.date ?? null,
    attendees: meeting.attendees,
    // Meeting quotes are extracted into a GENERATED artifact with no immutable
    // segment reference → sourceKind "meeting_quote" (never customer_stated).
    statements: (meeting.quotes ?? []).map((q) => ({ segmentId: segmentId(q.text), speaker: q.speaker, sourceKind: "meeting_quote" as const, text: q.text })),
  };
}

export function mapSourcesToRecords(sources: InternalBriefSources, bundleVersion: string, capturedAt: string): BriefSourceRecords {
  return {
    tenantId: sources.tenantId,
    dealId: sources.dealId,
    snapshotId: bundleVersion,
    capturedAt,
    opportunity: {
      id: sources.opportunity.id,
      name: sources.opportunity.name,
      stage_label: sources.opportunity.stageLabel,
      amount: sources.opportunity.amount,
      currency: sources.opportunity.currency,
      close_date: sources.opportunity.closeDate,
      // CRM-imported fields; the opportunity carries no next-step column.
      origin: "crm_import",
    },
    intelligence: sources.intelligence.artifact,
    intelligenceVersionId: sources.intelligence.artifactId,
    prep: sources.execution.artifact,
    prepVersionId: sources.execution.artifactId,
    transcripts: sources.meeting ? [meetingToTranscript(sources.meeting)] : [],
  };
}

// ── orchestration ────────────────────────────────────────────────────────────

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "deal";
}

export async function generateInternalBrief(args: GenerateInternalBriefArgs): Promise<InternalBriefResult> {
  const bundle = computeBundleVersion(args.sources.coords);
  const capturedAt = args.capturedAt ?? args.sources.execution.generatedAt;
  const records = mapSourcesToRecords(args.sources, bundle.short, capturedAt);

  const snapshot = toDealSnapshot(records);
  const packet = buildEvidencePacket(snapshot);
  // Phase 1: previous = null → hasPriorState:false → "What changed" omitted.
  const changeSet = detectChanges(packet, null);

  const request = {
    packet,
    changeSet,
    cover: { dealName: args.cover.dealName, companyName: args.cover.companyName, asOf: args.cover.asOf },
  };

  let gen;
  try {
    gen = await generateExecutiveBrief(request, args.modelClient);
  } catch {
    // Transport / model error (never leaks prompt or evidence).
    return { ok: false, code: "model_generation_failed" };
  }
  if (!gen.ok) return { ok: false, code: "brief_failed_validation" };

  let render;
  try {
    render = await buildBriefPptx(gen.brief);
  } catch {
    return { ok: false, code: "brief_render_failed" };
  }

  return {
    ok: true,
    buffer: render.buffer,
    filename: `${safeFilename(args.cover.dealName)}-internal-brief-${bundle.short}.pptx`,
    bundleVersion: bundle.short,
    modelId: args.modelId ?? DEFAULT_BRIEF_MODEL,
    diagnostics: render.diagnostics,
  };
}

// ── real model client (used by the route; tests inject a mock) ──────────────

/** Non-streaming, structured-JSON Sonnet-tier client. Constructs the SDK only
 *  when called, so importing this module in tests never needs an API key. */
export function createSonnetBriefClient(model: string = DEFAULT_BRIEF_MODEL): BriefModelClient {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return createJsonBriefClient(async (system, user) => {
    const res = await client.messages.create({
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  });
}
