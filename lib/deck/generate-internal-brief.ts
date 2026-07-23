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
import { BriefDraftJsonSchema } from "@/lib/deck/brief-schema";
import type { BundleCoordinates, InternalBriefSources } from "@/lib/deck/load-internal-brief-sources";

/** Default model tier — the SHARED config, not a brief-specific constant. */
export const DEFAULT_BRIEF_MODEL = SONNET_MODEL;

/** Max output tokens for brief generation. A CONSERVATIVE first ceiling for the
 *  canary: the staging run proved >8000 are needed (stop_reason:"max_tokens")
 *  but not the exact size. 16000 is well within Sonnet 4.6's output capacity; it
 *  is NOT guaranteed to complete — assertParseableResponse makes an insufficient
 *  ceiling fail safely (private truncation diagnostic) rather than crash parsing. */
const BRIEF_MAX_TOKENS = 16000;

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

// ── sanitized failure diagnostics (Gate G1) ──────────────────────────────────
// Surfaces ONLY safe, structured fields about a generation failure — never the
// prompt, evidence, model output, credentials, headers, or the raw error object.
// The client response is unchanged; this only makes the swallowed cause visible.

/** Fixed internal string authored by our code — used ONLY to classify the stage,
 *  never logged. NO provider- or error-generated message text is ever logged. */
const COVER_BUILD_ERROR = "buildCover produced an unverifiable cover fact.";

export type BriefFailureStage =
  | "cover_build"
  | "anthropic_request"
  | "json_parsing"
  | "model_output_truncated"      // PRIVATE diagnostic: stop_reason === "max_tokens"
  | "model_refusal"               // PRIVATE diagnostic: stop_reason === "refusal"
  | "model_incomplete_response"   // PRIVATE diagnostic: any other non-"end_turn" stop
  | "brief_validation"
  | "assembly_or_other"
  | "powerpoint_rendering";

/** Class of the first non-whitespace character — a shape signal that never
 *  reveals the actual character (which could be prose content). */
export type FirstNonWsClass = "open_brace" | "open_bracket" | "backtick" | "double_quote" | "other";

/** Sanitized, non-content facts about the model's returned text, to localize a
 *  json_parsing failure (truncation vs. markdown fence vs. prose vs. other).
 *  NEVER includes the response text OR a character length (chars ≠ tokens). */
export interface ModelResponseSignal {
  /** Anthropic stop_reason enum (e.g. "end_turn"; "max_tokens" ⇒ truncation). */
  stopReason?: string;
  /** A ``` code fence appears ANYWHERE in the response (markdown contamination).
   *  Whether it is LEADING is separately given by firstNonWsClass === "backtick". */
  hasCodeFence?: boolean;
  /** Class of the first non-whitespace char — never the raw character. */
  firstNonWsClass?: FirstNonWsClass;
}

/** Compute the sanitized response signal from raw text + stop_reason. Pure +
 *  exported for tests. Reads only structure — never returns or logs content,
 *  and deliberately excludes any character length. */
export function computeResponseSignal(text: string, stopReason: string | null | undefined): ModelResponseSignal {
  const trimmed = text.replace(/^\s+/, "");
  const c = trimmed.charAt(0);
  const firstNonWsClass: FirstNonWsClass =
    c === "{" ? "open_brace" : c === "[" ? "open_bracket" : c === "`" ? "backtick" : c === '"' ? "double_quote" : "other";
  const signal: ModelResponseSignal = { hasCodeFence: text.includes("```"), firstNonWsClass };
  if (typeof stopReason === "string") signal.stopReason = stopReason;
  return signal;
}

/** Sanitized diagnostic: structured, non-content fields ONLY. No provider or
 *  error message text, no response text, and no character length. */
export interface BriefDiagnostic {
  stage: BriefFailureStage;
  /** Error CLASS name (e.g. "NotFoundError", "SyntaxError") — never message text. */
  errorName?: string;
  httpStatus?: number;
  providerErrorType?: string;
  requestId?: string;
  elapsedMs: number;
  // ── model-response shape signal (attached on a json_parsing failure) ──
  modelStopReason?: string;
  responseHasCodeFence?: boolean;
  responseFirstNonWsClass?: FirstNonWsClass;
}

type AnthropicShape = { name?: string; status?: number; type?: string; requestId?: string };

/** Recognize an Anthropic API error by instance OR shape (status + error body),
 *  extracting only structured, non-content fields (never the message). */
function asAnthropicError(error: unknown): AnthropicShape | null {
  const obj = (error && typeof error === "object" ? (error as Record<string, unknown>) : null);
  const isInstance = error instanceof Anthropic.APIError;
  const hasShape = !!obj && typeof obj.status === "number" && "error" in obj;
  if (!isInstance && !hasShape) return null;
  const body = (obj?.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null);
  return {
    name: typeof obj?.name === "string" ? obj.name : undefined,
    status: typeof obj?.status === "number" ? obj.status : undefined,
    type: body && typeof body.type === "string" ? (body.type as string) : undefined,
    requestId: typeof obj?.request_id === "string" ? (obj.request_id as string) : undefined,
  };
}

/** Thrown when the response did NOT end normally, so it must not be parsed:
 *  max_tokens ⇒ partial JSON; refusal ⇒ HTTP 200 with non-schema output; any
 *  other stop reason ⇒ not a complete structured object. Carries only the (safe)
 *  stop-reason enum for the PRIVATE diagnostic — never any response content. */
export class BriefUnparseableResponseError extends Error {
  readonly stopReason: string | null;
  constructor(stopReason: string | null) {
    super("model_response_unparseable");
    this.name = "BriefUnparseableResponseError";
    this.stopReason = stopReason;
  }
}

/** Parse ONLY after a normal completion. Throws for max_tokens / refusal / any
 *  other non-"end_turn" stop reason. Pure + exported for tests. */
export function assertParseableResponse(stopReason: string | null | undefined): void {
  if (stopReason !== "end_turn") throw new BriefUnparseableResponseError(stopReason ?? null);
}

/** Infer the failure stage from a thrown error without logging its content. */
export function inferBriefStage(error: unknown): BriefFailureStage {
  if (asAnthropicError(error)) return "anthropic_request";
  if (error instanceof BriefUnparseableResponseError) {
    return error.stopReason === "max_tokens" ? "model_output_truncated"
      : error.stopReason === "refusal" ? "model_refusal"
      : "model_incomplete_response";
  }
  if (error instanceof SyntaxError) return "json_parsing"; // parseBriefDraft (JSON.parse) throws
  if (error instanceof Error && error.message === COVER_BUILD_ERROR) return "cover_build";
  return "assembly_or_other";
}

/** Build a sanitized diagnostic record — structured fields ONLY, never any
 *  provider- or error-message text. Pure + exported for tests. */
export function sanitizeBriefDiagnostic(stage: BriefFailureStage, error: unknown, elapsedMs: number, signal?: ModelResponseSignal): BriefDiagnostic {
  const d: BriefDiagnostic = { stage, elapsedMs };
  const api = asAnthropicError(error);
  if (api) {
    if (api.name) d.errorName = api.name;
    if (typeof api.status === "number") d.httpStatus = api.status;
    if (api.type) d.providerErrorType = api.type;
    if (api.requestId) d.requestId = api.requestId;
  } else if (error instanceof Error) {
    d.errorName = error.name; // class name only — never error.message
  } else if (error !== undefined) {
    d.errorName = "unknown";
  }
  // Model-response shape — structural facts only (never content, never length).
  if (signal) {
    if (signal.stopReason) d.modelStopReason = signal.stopReason;
    if (typeof signal.hasCodeFence === "boolean") d.responseHasCodeFence = signal.hasCodeFence;
    if (signal.firstNonWsClass) d.responseFirstNonWsClass = signal.firstNonWsClass;
  }
  return d;
}

function logBriefDiagnostic(stage: BriefFailureStage, error: unknown, elapsedMs: number, signal?: ModelResponseSignal): void {
  // Structured + sanitized. NEVER the raw error object (no console.error(error)).
  console.warn(`[internal-brief:diagnostic] ${JSON.stringify(sanitizeBriefDiagnostic(stage, error, elapsedMs, signal))}`);
}

/** Stages where the model DID return a response — the sanitized response signal
 *  (stop_reason + shape) is meaningful and gets attached to the diagnostic. */
const MODEL_RESPONDED_STAGES: ReadonlySet<BriefFailureStage> = new Set<BriefFailureStage>([
  "json_parsing", "model_output_truncated", "model_refusal", "model_incomplete_response",
]);

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

  const modelStartedAt = Date.now();
  let gen;
  try {
    gen = await generateExecutiveBrief(request, args.modelClient);
  } catch (error) {
    // Sanitized diagnostic (stage + elapsed + safe provider fields); the client
    // response is unchanged — still model_generation_failed. Never leaks prompt,
    // evidence, model output, credentials, headers, or the raw error object.
    const stage = inferBriefStage(error);
    // When the model DID respond (parse failure, truncation, refusal, other
    // incomplete stop) attach the client's sanitized response signal (stop_reason
    // + shape) to localize the cause. PRIVATE diagnostic only.
    const signal = MODEL_RESPONDED_STAGES.has(stage)
      ? (args.modelClient as BriefModelClientWithSignal).lastResponseSignal : undefined;
    logBriefDiagnostic(stage, error, Date.now() - modelStartedAt, signal);
    // Public code stays GENERIC regardless of private stage — no client-contract change.
    return { ok: false, code: "model_generation_failed" };
  }
  if (!gen.ok) {
    logBriefDiagnostic("brief_validation", undefined, Date.now() - modelStartedAt);
    return { ok: false, code: "brief_failed_validation" };
  }

  const renderStartedAt = Date.now();
  let render;
  try {
    render = await buildBriefPptx(gen.brief);
  } catch (error) {
    logBriefDiagnostic("powerpoint_rendering", error, Date.now() - renderStartedAt);
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

/** A brief model client that also exposes the SANITIZED shape signal of its most
 *  recent response, so a downstream json_parsing failure can be localized. */
export interface BriefModelClientWithSignal extends BriefModelClient {
  lastResponseSignal?: ModelResponseSignal;
}

/** Non-streaming, structured-JSON Sonnet-tier client. Constructs the SDK only
 *  when called, so importing this module in tests never needs an API key. Records
 *  only the sanitized response signal (stop_reason + shape) — never the response
 *  text or a length — for the parse-failure diagnostic. */
export function createSonnetBriefClient(model: string = DEFAULT_BRIEF_MODEL): BriefModelClientWithSignal {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const briefClient = createJsonBriefClient(async (system, user) => {
    const res = await client.messages.create({
      model,
      max_tokens: BRIEF_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
      // Structured Outputs: constrain the model to a fence-free JSON object of the
      // brief shape (removes the ```json wrapper that broke JSON.parse).
      output_config: { format: { type: "json_schema", schema: BriefDraftJsonSchema } },
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    briefClient.lastResponseSignal = computeResponseSignal(text, res.stop_reason);
    // Parse ONLY after a normal end_turn. Truncated (max_tokens), refused, or
    // otherwise incomplete responses are partial/non-schema even under Structured
    // Outputs — fail here so parseBriefDraft/JSON.parse is never reached.
    assertParseableResponse(res.stop_reason);
    return text;
  }) as BriefModelClientWithSignal;
  return briefClient;
}
