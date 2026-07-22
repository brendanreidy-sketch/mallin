/**
 * brief-artifact-adapter — pure mapping from the REAL Mallín records into the
 * deterministic `DealSnapshot` the evidence layer consumes.
 *
 * PURITY CONTRACT (enforced by review + tests): this module performs
 *   - no database access
 *   - no authentication
 *   - no model / LLM call
 *   - no mutation of its inputs
 *   - no current-time (`Date`) or random operations
 * Every value comes from the passed-in records. The future API route's only
 * job is: authorize → load records → call `toDealSnapshot` → return.
 *
 * Faithfulness notes (documented limitations of today's real artifacts):
 *   - `PrepArtifact.deliverables` items carry no completion state and no due
 *     date, so every deliverable maps to a commitment with state "open" and
 *     `expectedBy: null`. A deliverable later LEAVING the list is reported by
 *     the change layer as `commitment_removed` (assurance unresolved) — never
 *     assumed completed. `commitment_completed`/`missed` require an explicit
 *     state, which real deliverables do not yet carry; the fixture supplies it.
 *   - NEXT ACTION: the real PrepArtifact has NO explicit next-action field.
 *     Audited candidates and why each is NOT the current next action:
 *       · deliverables[] — "what {buyer} is waiting on before they decide"
 *         (buyer-blocking checklist; first item is a proxy, forbidden)
 *       · how_you_win    — "The ONE strategic play that closes this deal"
 *         (win condition/strategy, not the immediate next action)
 *       · talk_track.opening_angle — "Opening line / framing for the call"
 *       · commercial_reality.asks  — negotiation asks (CommercialAsk[])
 *       · pre_mortem_paths[].forcing_move — per-failure-path move (anticipation)
 *     None has "current next action" semantics, so the adapter leaves
 *     `nextAction` undefined and the evidence layer emits a Not-confirmed
 *     open_question. The opportunity record has no next-step field either.
 *   - `customer_stated` is only ever produced from a transcript statement whose
 *     speaker resolves to a buyer-side attendee (explicit side metadata).
 */

import type {
  AccountIntelligenceArtifact,
  MeetingAttendee,
  RecentEvent,
  SourcedFact,
} from "@/lib/intelligence/types";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import type {
  DealSnapshot,
  IntelFactInput,
  IntelInput,
  OpportunityFields,
  PrepInput,
  SpeakerSide,
  TranscriptExcerpt,
} from "@/lib/deck/brief-evidence";

/** Opportunity record fields the adapter needs (subset of the DB row). */
export interface AdapterOpportunity {
  id: string;
  name?: string | null;
  stage_label?: string | null;
  amount?: number | null;
  currency?: string | null;
  close_date?: string | null;
  next_step?: string | null;
  /** How these fields originated — drives seller_provided vs system_recorded. */
  origin?: OpportunityFields["origin"];
}

export interface AdapterTranscriptStatement {
  /** Immutable segment identity within the transcript (e.g. start-ms or a
   *  segment row id). MUST NOT be an array index. */
  segmentId: string;
  speaker: string | null;
  /** Explicit side when known; otherwise resolved from `attendees`. */
  side?: SpeakerSide;
  text: string;
}

export interface AdapterTranscript {
  transcriptId: string;
  callDate?: string | null;
  /** Attendee roster for name → side resolution (from the meeting block). */
  attendees?: MeetingAttendee[];
  statements: AdapterTranscriptStatement[];
}

export interface BriefSourceRecords {
  tenantId: string;
  dealId: string;
  /** Immutable per-snapshot id (from the artifact ledger). */
  snapshotId: string;
  /** ISO — when this snapshot's artifacts were generated. */
  capturedAt: string;
  /** Immutable monotonic ledger sequence, when available. */
  sequence?: number;
  opportunity: AdapterOpportunity;
  intelligence?: AccountIntelligenceArtifact | null;
  /** Immutable version id for the intelligence artifact (ledger id). Falls
   *  back to the artifact's generated_at when not supplied. */
  intelligenceVersionId?: string;
  prep?: PrepArtifact | null;
  /** Immutable version id for the prep artifact. Falls back to generated_at. */
  prepVersionId?: string;
  transcripts?: AdapterTranscript[];
}

/** Deterministically map real records into a DealSnapshot. Pure. */
export function toDealSnapshot(records: BriefSourceRecords): DealSnapshot {
  return {
    tenantId: records.tenantId,
    dealId: records.dealId,
    snapshotId: records.snapshotId,
    capturedAt: records.capturedAt,
    sequence: records.sequence,
    opportunity: mapOpportunity(records.opportunity),
    intelligence: records.intelligence
      ? mapIntelligence(records.intelligence, records.intelligenceVersionId)
      : undefined,
    prep: records.prep ? mapPrep(records.prep, records.prepVersionId) : undefined,
    transcripts: (records.transcripts ?? []).flatMap(mapTranscript),
  };
}

function mapOpportunity(o: AdapterOpportunity): OpportunityFields {
  return {
    recordId: o.id,
    name: o.name ?? "(unnamed opportunity)",
    stageLabel: o.stage_label ?? null,
    amountUsd: o.amount ?? null,
    currency: o.currency ?? null,
    closeDate: o.close_date ?? null,
    nextStep: o.next_step ?? null,
    origin: o.origin ?? "unknown",
  };
}

function fact(key: string, f: SourcedFact): IntelFactInput {
  return {
    key,
    value: f.value,
    source: f.source,
    sourceUrl: f.source_url,
    capturedAt: f.captured_at ?? null,
    confidence: f.confidence,
    confidenceNote: f.confidence_note,
  };
}

function eventFact(e: RecentEvent): IntelFactInput {
  return {
    key: `event:${e.date}:${slug(e.headline)}`,
    value: `${e.headline} — ${e.relevance}`,
    source: e.source,
    sourceUrl: e.source_url,
    capturedAt: e.captured_at ?? null,
    confidence: e.confidence,
  };
}

function mapIntelligence(intel: AccountIntelligenceArtifact, versionId?: string): IntelInput {
  const facts: IntelFactInput[] = [
    fact("account:one_line", intel.account.one_line),
    fact("account:industry", intel.account.industry),
    ...intel.account.strategic_priorities.map((p) => fact(`priority:${slug(p.value)}`, p)),
    ...intel.recent_events.map(eventFact),
  ];

  return {
    versionId: versionId ?? intel.metadata.generated_at,
    generatedAt: intel.metadata.generated_at,
    facts,
    stakeholders: intel.stakeholders.map((sh) => ({
      stakeholderId: sh.stakeholder_id ?? `name:${slug(sh.name)}`,
      name: sh.name,
      title: sh.title?.value ?? null,
      roleInDeal: {
        value: sh.role_in_deal.value,
        confidence: sh.role_in_deal.confidence,
        rationale: sh.role_in_deal.rationale,
      },
    })),
    gaps: intel.metadata.gaps ?? [],
  };
}

function mapPrep(prep: PrepArtifact, versionId?: string): PrepInput {
  const version = versionId ?? prep.metadata.generated_at;
  const deliverables = prep.deliverables?.items ?? [];

  return {
    versionId: version,
    generatedAt: prep.metadata.generated_at,
    posture: prep.top_line.posture,
    topLine: prep.top_line.text,
    // No explicit next-action field exists on PrepArtifact (see the header
    // audit). Leave undefined — the evidence layer emits a Not-confirmed
    // open_question rather than proxying the first deliverable.
    nextAction: undefined,
    criticalRisks: prep.critical_risks.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      severity: r.severity,
      evidenceIds: r.evidence_ids,
    })),
    stakeholderStates: prep.stakeholder_strategy.map((s) => ({
      stakeholderId: s.stakeholder_id,
      name: s.stakeholder_name,
      role: s.role,
      disposition: s.current_state.disposition,
      dispositionRationale: s.current_state.disposition_rationale,
      engagementLevel: s.current_state.engagement_level ?? null,
      evidenceIds: s.evidence_ids,
    })),
    // Deliverables carry no state/date today → all open, no expected date.
    // Stable id from the label so the same deliverable matches across snapshots.
    commitments: deliverables.map((d) => ({
      id: `d/${slug(d.label)}`,
      label: d.label,
      state: "open" as const,
      expectedBy: null,
      // Deliverables are seller-side sends; a customer commitment needs a
      // distinct typed record, which the real artifact does not yet carry.
      party: "seller" as const,
      route: d.route ?? null,
      evidenceIds: [],
    })),
  };
}

function mapTranscript(t: AdapterTranscript): TranscriptExcerpt[] {
  return t.statements.map((s) => ({
    transcriptId: t.transcriptId,
    segmentId: s.segmentId,
    callDate: t.callDate ?? null,
    speaker: s.speaker,
    speakerSide: s.side ?? resolveSide(s.speaker, t.attendees),
    text: s.text,
  }));
}

/** Resolve a speaker to buyer/seller via explicit attendee side metadata. An
 *  unmatched or unnamed speaker stays "unknown" — never assumed customer. */
function resolveSide(speaker: string | null, attendees?: MeetingAttendee[]): SpeakerSide {
  if (!speaker || !attendees?.length) return "unknown";
  const norm = speaker.trim().toLowerCase();
  const match = attendees.find((a) => a.name.trim().toLowerCase() === norm);
  return match ? match.side : "unknown";
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}
