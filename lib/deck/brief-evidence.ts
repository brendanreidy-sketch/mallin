/**
 * brief-evidence — deterministic evidence packet for the INTERNAL executive
 * deal brief (Commit 1 foundation; hardened in 1A; finalized in 1B).
 *
 * Pure TypeScript. No LLM, no rendering, no I/O, no clock, no randomness.
 * Given a point-in-time `DealSnapshot`, it produces a normalized,
 * provenance-classified `EvidencePacket` whose items carry TYPED payloads
 * (a discriminated union) and TWO deterministic identifiers.
 *
 * ── Two identifiers ────────────────────────────────────────────────────────
 *   evidenceId    — identity of a specific evidence OCCURRENCE, in one
 *                   snapshot/artifact version. Includes the snapshot id, so it
 *                   changes every snapshot even if the value is unchanged.
 *   sourceFactKey — identity of the same LOGICAL fact across snapshots. Excludes
 *                   the snapshot id; built from the immutable source record and
 *                   a stable field path. Used to match a fact over time.
 * Both are collision-resistant: components are length-prefixed (netstring
 * style), so delimiter characters inside values cannot forge a boundary.
 *
 * ── Source → provenance contract ──────────────────────────────────────────
 * `customer_stated` is earned ONLY by an explicitly identified customer-side
 * speaker (a transcript statement whose speaker resolves to a buyer-side
 * attendee). It is NEVER inferred from a source label alone.
 *
 *   transcript, speakerSide = "buyer"         → customer_stated
 *   transcript, speakerSide = "seller"        → seller_provided
 *   transcript, speakerSide = "unknown"       → system_recorded
 *   opportunity field (seller/CRM origin)     → seller_provided
 *   opportunity field (unknown origin)        → system_recorded
 *   intelligence SourcedFact "manual"         → seller_provided
 *   intelligence SourcedFact "customer_input" → system_recorded (conservative)
 *   intelligence SourcedFact (all others)     → system_recorded
 *   role read / prep posture / risk / disposition / commitment → mallin_inference
 *   missing / unsupported field / stated gap  → open_question ("Not confirmed")
 *
 * Confidence is preserved and NEVER raised (only degraded to "none"). Provenance
 * is NOT confidence and NOT change assurance — separate axes.
 */

import type { Confidence, IntelligenceSource } from "@/lib/intelligence/types";
import type {
  DealPosture,
  RiskSeverity,
  StakeholderDisposition,
} from "@/lib/contracts/execution-agent-output";

// ── Vocabularies ────────────────────────────────────────────────────────────

export type Provenance =
  | "customer_stated"
  | "seller_provided"
  | "system_recorded"
  | "mallin_inference"
  | "open_question";

export type EvidenceConfidence = "high" | "medium" | "low" | "none";

export type EvidenceStatus = "current" | "superseded";

export type EvidenceSourceType =
  | "transcript"
  | "opportunity"
  | "intelligence_artifact"
  | "prep_artifact";

export type SpeakerSide = "buyer" | "seller" | "unknown";

/** Who/what proves a commitment reached its state (done/missed). Its presence
 *  is what separates "observed" completion from an unproven inference. */
export interface CommitmentStateEvidence {
  confirmedBy: "customer" | "seller" | "activity" | "system";
  note?: string;
}

// ── Typed evidence payloads (change detection reads these, never `claim`) ────

export type EvidencePayload =
  | { kind: "opportunity_value"; field: "stage" | "amount" | "closeDate"; value: string }
  | { kind: "next_action"; origin: "opportunity" | "prep"; value: string }
  | { kind: "transcript_statement"; transcriptId: string; segmentId: string; side: SpeakerSide; text: string }
  | { kind: "intel_fact"; factKey: string; value: string }
  | { kind: "stakeholder"; stakeholderId: string; name: string; aspect: "disposition" | "role"; value: string }
  | { kind: "risk"; riskId: string; severity: RiskSeverity; title: string }
  | {
      kind: "commitment";
      commitmentId: string;
      state: "open" | "done" | "missed";
      expectedBy: string | null;
      label: string;
      /** Whose commitment this is. A customer commitment REQUIRES party
       *  "customer" — a generic buyer statement never qualifies. */
      party?: "customer" | "seller";
      /** Named owner/speaker on the committing side, when known. */
      owner?: string;
      /** Evidence ids (in this same packet) that underlie the commitment —
       *  e.g. a buyer-side transcript segment, or a seller-recorded note. A
       *  party:"customer" commitment is NOT a confirmed customer commitment
       *  unless at least one of these resolves to customer_stated or
       *  seller_provided evidence. */
      supportingEvidenceIds?: string[];
      stateEvidence?: CommitmentStateEvidence;
    }
  | { kind: "deal_posture"; posture: DealPosture }
  | { kind: "open_question"; topic: string };

/** The comparable (value-diffable) form of a payload — typed, never prose. */
export function comparableValue(p: EvidencePayload): string {
  switch (p.kind) {
    case "opportunity_value":
      return p.value;
    case "next_action":
      return p.value;
    case "intel_fact":
      return p.value;
    case "stakeholder":
      return p.value;
    case "risk":
      return p.severity;
    case "commitment":
      return p.state;
    case "deal_posture":
      return p.posture;
    case "open_question":
      return "Not confirmed";
    case "transcript_statement":
      return p.segmentId; // transcript statements are diffed by presence, not value
  }
}

export interface EvidenceItem {
  /** Occurrence identity — snapshot-specific (see evidenceId). */
  evidenceId: string;
  /** Logical-fact identity — stable across snapshots (see sourceFactKey). */
  sourceFactKey: string;
  tenantId: string;
  dealId: string;
  /** Semantic grouping key — snapshot-independent; may span multiple sources
   *  (e.g. deal:nextAction) so change detection can surface conflicts. */
  logicalKey: string;
  /** Immutable field coordinate within the source record (e.g. "stage",
   *  "risk/r_x", "segment/1200"). Never array position or prose. */
  fieldPath: string;
  /** Human-readable claim/value. Display only — NOT used for diffing. */
  claim: string;
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  /** Immutable version of the source record when relevant (artifact version). */
  sourceVersion?: string;
  /** ISO date of the source record / call. Null when genuinely unknown. */
  sourceDate: string | null;
  origin: string | null;
  support: { excerpt?: string; value?: string };
  provenance: Provenance;
  confidence: EvidenceConfidence;
  confidenceNote?: string;
  payload: EvidencePayload;
  status: EvidenceStatus;
}

export interface EvidencePacket {
  tenantId: string;
  dealId: string;
  snapshotId: string;
  capturedAt: string;
  sequence?: number;
  version: {
    intelligenceVersionId?: string;
    prepVersionId?: string;
    latestTranscriptId?: string;
    latestCallDate?: string | null;
  };
  items: EvidenceItem[];
  gaps: string[];
}

// ── Focused source inputs (the adapter maps real artifacts → these) ─────────

export interface OpportunityFields {
  recordId: string;
  name: string;
  stageLabel?: string | null;
  amountUsd?: number | null;
  currency?: string | null;
  closeDate?: string | null; // ISO
  nextStep?: string | null;
  origin?: "seller_entered" | "crm_import" | "unknown";
}

export interface TranscriptExcerpt {
  transcriptId: string;
  /** Immutable segment identity within the transcript. NEVER an array index. */
  segmentId: string;
  callDate: string | null; // ISO
  speaker: string | null;
  /** The ONLY thing that earns customer_stated — an explicit buyer speaker,
   *  AND only when the statement is a directly-traceable transcript segment. */
  speakerSide?: SpeakerSide;
  /** Provenance of the statement's SOURCE. A "transcript_segment" is a directly
   *  traceable segment (buyer side ⇒ customer_stated). A "meeting_quote" was
   *  extracted into a GENERATED intelligence artifact with no immutable segment
   *  reference, so it can NEVER be independently customer_stated — it is
   *  recorded as system_recorded regardless of speaker side. Default:
   *  "transcript_segment". */
  sourceKind?: "transcript_segment" | "meeting_quote";
  text: string;
  topicKey?: string;
}

export interface IntelFactInput {
  key: string;
  value: string;
  source: IntelligenceSource;
  sourceUrl?: string;
  capturedAt?: string | null;
  confidence: Confidence;
  confidenceNote?: string;
}

export interface IntelStakeholderInput {
  stakeholderId: string;
  name: string;
  title?: string | null;
  roleInDeal?: { value: string; confidence: Confidence; rationale?: string };
}

export interface IntelInput {
  versionId: string;
  generatedAt: string; // ISO
  facts: IntelFactInput[];
  stakeholders: IntelStakeholderInput[];
  gaps?: string[];
}

export interface PrepRiskInput {
  id: string;
  title: string;
  description?: string;
  severity: RiskSeverity;
  evidenceIds?: string[];
}

export interface PrepStakeholderStateInput {
  stakeholderId: string;
  name: string;
  role?: string;
  disposition?: StakeholderDisposition;
  dispositionRationale?: string;
  engagementLevel?: string | null;
  evidenceIds?: string[];
}

export interface PrepCommitmentInput {
  id: string;
  label: string;
  /** Raw recorded state. "done"/"missed" require a source that actually asserts
   *  it — a bare disappearance is NOT a state (see brief-change-detection). */
  state: "open" | "done" | "missed";
  expectedBy?: string | null; // ISO
  /** Whose commitment (customer vs seller). */
  party?: "customer" | "seller";
  /** Named owner/speaker on the committing side. */
  owner?: string;
  /** References to underlying evidence that proves this commitment, resolved
   *  against the packet at build time into payload.supportingEvidenceIds. */
  supportingRefs?: Array<{ transcriptId: string; segmentId: string } | { sourceFactKey: string }>;
  /** Proof of the done/missed state (activity record, confirmation). When
   *  present, a completion/miss is observed rather than merely inferred. */
  stateEvidence?: CommitmentStateEvidence;
  route?: string | null;
  evidenceIds?: string[];
}

export interface PrepInput {
  versionId: string;
  generatedAt: string; // ISO
  posture?: DealPosture;
  topLine?: string;
  criticalRisks: PrepRiskInput[];
  stakeholderStates: PrepStakeholderStateInput[];
  commitments: PrepCommitmentInput[];
  /** The current next action, ONLY when an explicit, semantically-correct
   *  source field supplies it. The adapter leaves this undefined because the
   *  real PrepArtifact has no such field (see brief-artifact-adapter). */
  nextAction?: string | null;
}

export interface DealSnapshot {
  tenantId: string;
  dealId: string;
  snapshotId: string;
  capturedAt: string; // ISO
  sequence?: number;
  opportunity: OpportunityFields;
  intelligence?: IntelInput;
  prep?: PrepInput;
  transcripts: TranscriptExcerpt[];
}

// ── Source → provenance mapping ─────────────────────────────────────────────

export function intelSourceToProvenance(src: IntelligenceSource): Provenance {
  if (src === "manual") return "seller_provided";
  return "system_recorded";
}

export function transcriptSideToProvenance(side: SpeakerSide | undefined): Provenance {
  if (side === "buyer") return "customer_stated";
  if (side === "seller") return "seller_provided";
  return "system_recorded";
}

export function oppOriginToProvenance(origin: OpportunityFields["origin"]): Provenance {
  if (origin === "seller_entered" || origin === "crm_import") return "seller_provided";
  return "system_recorded";
}

export function normalizeConfidence(c?: Confidence | null): EvidenceConfidence {
  if (c === "high" || c === "medium" || c === "low") return c;
  return "none";
}

// ── Collision-resistant identifiers ─────────────────────────────────────────

/** Length-prefixed (netstring-style) packing: each component is emitted as
 *  `<byteLen>:<value>`, so a delimiter or ":" inside a value can never forge a
 *  component boundary. Deterministic; no randomness or time. Shared by the
 *  evidence ids AND the ChangeSet changeIds. */
export function packComponents(parts: string[]): string {
  return parts.map((p) => `${p.length}:${p}`).join("");
}
const packKey = packComponents;

export interface EvidenceCoordinates {
  tenantId: string;
  dealId: string;
  snapshotId: string;
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  fieldPath: string;
  sourceVersion?: string;
}

/** Snapshot-specific occurrence id. */
export function evidenceId(c: EvidenceCoordinates): string {
  const parts = [c.tenantId, c.dealId, c.snapshotId, c.sourceType, c.sourceRecordId, c.fieldPath];
  if (c.sourceVersion != null) parts.push(c.sourceVersion);
  return "ev:" + packKey(parts);
}

export interface SourceFactCoordinates {
  tenantId: string;
  dealId: string;
  sourceType: EvidenceSourceType;
  /** Immutable record id: the opportunity/transcript id, or a stable per-deal
   *  stream key ("intelligence"/"prep") — never an artifact VERSION id. */
  factRecordId: string;
  fieldPath: string;
}

/** Cross-snapshot logical-fact key. Excludes the snapshot/version. */
export function sourceFactKey(c: SourceFactCoordinates): string {
  return "sf:" + packKey([c.tenantId, c.dealId, c.sourceType, c.factRecordId, c.fieldPath]);
}

// ── Assembly ────────────────────────────────────────────────────────────────

function fmtUsd(amount: number, currency = "USD"): string {
  return `${currency === "USD" ? "$" : currency + " "}${amount.toLocaleString("en-US")}`;
}

export function buildEvidencePacket(snapshot: DealSnapshot): EvidencePacket {
  const { tenantId, dealId, snapshotId } = snapshot;
  const items: EvidenceItem[] = [];

  const add = (args: {
    logicalKey: string;
    fieldPath: string;
    /** Stable record id for the sourceFactKey (defaults to sourceRecordId). */
    factRecordId?: string;
    claim: string;
    sourceType: EvidenceSourceType;
    sourceRecordId: string;
    sourceVersion?: string;
    sourceDate: string | null;
    origin: string | null;
    support: { excerpt?: string; value?: string };
    provenance: Provenance;
    confidence: EvidenceConfidence;
    confidenceNote?: string;
    payload: EvidencePayload;
  }) => {
    const { factRecordId, ...rest } = args;
    items.push({
      evidenceId: evidenceId({
        tenantId, dealId, snapshotId,
        sourceType: args.sourceType, sourceRecordId: args.sourceRecordId,
        fieldPath: args.fieldPath, sourceVersion: args.sourceVersion,
      }),
      sourceFactKey: sourceFactKey({
        tenantId, dealId, sourceType: args.sourceType,
        factRecordId: factRecordId ?? args.sourceRecordId, fieldPath: args.fieldPath,
      }),
      tenantId, dealId, status: "current", ...rest,
    });
  };

  // ── Opportunity fields ──
  const opp = snapshot.opportunity;
  const oppProv = oppOriginToProvenance(opp.origin);
  const oppOrigin =
    opp.origin === "crm_import" ? "CRM import" : opp.origin === "seller_entered" ? "Seller" : "System";

  if (opp.stageLabel != null) {
    add({
      logicalKey: "opp:stage", fieldPath: "stage", claim: `Stage: ${opp.stageLabel}`,
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceVersion: snapshotId,
      sourceDate: null, origin: oppOrigin, support: { value: opp.stageLabel }, provenance: oppProv,
      confidence: "none", payload: { kind: "opportunity_value", field: "stage", value: opp.stageLabel },
    });
  }
  if (opp.amountUsd != null) {
    add({
      logicalKey: "opp:amount", fieldPath: "amount", claim: `Amount: ${fmtUsd(opp.amountUsd, opp.currency ?? "USD")}`,
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceVersion: snapshotId,
      sourceDate: null, origin: oppOrigin, support: { value: String(opp.amountUsd) }, provenance: oppProv,
      confidence: "none", payload: { kind: "opportunity_value", field: "amount", value: String(opp.amountUsd) },
    });
  } else {
    add({
      logicalKey: "opp:amount", fieldPath: "amount", claim: "Deal amount — Not confirmed",
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceVersion: snapshotId,
      sourceDate: null, origin: null, support: {}, provenance: "open_question", confidence: "none",
      payload: { kind: "open_question", topic: "deal amount" },
    });
  }
  if (opp.closeDate != null) {
    add({
      logicalKey: "opp:closeDate", fieldPath: "closeDate", claim: `Close date: ${opp.closeDate}`,
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceVersion: snapshotId,
      sourceDate: null, origin: oppOrigin, support: { value: opp.closeDate }, provenance: oppProv,
      confidence: "none", payload: { kind: "opportunity_value", field: "closeDate", value: opp.closeDate },
    });
  }

  // ── Next action: only from explicit sources; else "Not confirmed" ──
  let hasNextAction = false;
  if (opp.nextStep != null) {
    hasNextAction = true;
    add({
      logicalKey: "deal:nextAction", fieldPath: "nextStep", claim: `Next step: ${opp.nextStep}`,
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceVersion: snapshotId,
      sourceDate: null, origin: oppOrigin, support: { value: opp.nextStep }, provenance: oppProv,
      confidence: "none", payload: { kind: "next_action", origin: "opportunity", value: opp.nextStep },
    });
  }
  if (snapshot.prep?.nextAction != null) {
    hasNextAction = true;
    const prep = snapshot.prep;
    add({
      logicalKey: "deal:nextAction", fieldPath: "nextAction", factRecordId: "prep",
      claim: `Recommended next action: ${prep.nextAction}`, sourceType: "prep_artifact",
      sourceRecordId: prep.versionId, sourceVersion: prep.versionId, sourceDate: prep.generatedAt,
      origin: "Mallín", support: { value: prep.nextAction! }, provenance: "mallin_inference",
      confidence: "none", payload: { kind: "next_action", origin: "prep", value: prep.nextAction! },
    });
  }
  if (!hasNextAction) {
    // No explicit next-action source → surface it, do not fabricate one.
    add({
      logicalKey: "deal:nextAction", fieldPath: "nextAction", factRecordId: "prep",
      claim: "Next action — Not confirmed", sourceType: "opportunity", sourceRecordId: opp.recordId,
      sourceVersion: snapshotId, sourceDate: null, origin: null, support: {}, provenance: "open_question",
      confidence: "none", payload: { kind: "open_question", topic: "next action" },
    });
  }

  // ── Transcript statements ──
  for (const t of snapshot.transcripts) {
    const side: SpeakerSide = t.speakerSide ?? "unknown";
    // A meeting_quote passed through a GENERATED artifact with no immutable
    // segment reference → never independently customer_stated. Only a directly
    // traceable transcript_segment can earn customer_stated (buyer side).
    const provenance: Provenance = t.sourceKind === "meeting_quote" ? "system_recorded" : transcriptSideToProvenance(side);
    add({
      logicalKey: t.topicKey ?? `txn:${t.transcriptId}:${t.segmentId}`,
      fieldPath: `segment/${t.segmentId}`, claim: t.text,
      sourceType: "transcript", sourceRecordId: t.transcriptId, sourceDate: t.callDate,
      origin: t.speaker, support: { excerpt: t.text }, provenance,
      confidence: "none",
      payload: { kind: "transcript_statement", transcriptId: t.transcriptId, segmentId: t.segmentId, side, text: t.text },
    });
  }

  // ── Intelligence facts + stakeholder role reads + gaps ──
  const intel = snapshot.intelligence;
  if (intel) {
    for (const f of intel.facts) {
      add({
        logicalKey: `intel:${f.key}`, fieldPath: `fact/${f.key}`, factRecordId: "intelligence", claim: f.value,
        sourceType: "intelligence_artifact", sourceRecordId: intel.versionId, sourceVersion: intel.versionId,
        sourceDate: f.capturedAt ?? intel.generatedAt, origin: f.source, support: { value: f.value },
        provenance: intelSourceToProvenance(f.source), confidence: normalizeConfidence(f.confidence),
        confidenceNote: f.confidenceNote, payload: { kind: "intel_fact", factKey: f.key, value: f.value },
      });
    }
    for (const sh of intel.stakeholders) {
      if (sh.roleInDeal) {
        add({
          logicalKey: `stk:${sh.stakeholderId}:role`, fieldPath: `stakeholder/${sh.stakeholderId}/role`,
          factRecordId: "intelligence", claim: `${sh.name} — role read: ${sh.roleInDeal.value}`,
          sourceType: "intelligence_artifact", sourceRecordId: intel.versionId, sourceVersion: intel.versionId,
          sourceDate: intel.generatedAt, origin: "Mallín",
          support: { value: sh.roleInDeal.value, excerpt: sh.roleInDeal.rationale },
          provenance: "mallin_inference", confidence: normalizeConfidence(sh.roleInDeal.confidence),
          payload: { kind: "stakeholder", stakeholderId: sh.stakeholderId, name: sh.name, aspect: "role", value: sh.roleInDeal.value },
        });
      }
    }
    for (const g of intel.gaps ?? []) {
      const s = slug(g);
      add({
        logicalKey: `gap:${s}`, fieldPath: `gap/${s}`, factRecordId: "intelligence", claim: `${g} — Not confirmed`,
        sourceType: "intelligence_artifact", sourceRecordId: intel.versionId, sourceVersion: intel.versionId,
        sourceDate: intel.generatedAt, origin: null, support: {}, provenance: "open_question",
        confidence: "none", payload: { kind: "open_question", topic: g },
      });
    }
  }

  // ── Prep: posture, risks, dispositions, commitments ──
  const prep = snapshot.prep;
  if (prep) {
    if (prep.posture) {
      add({
        logicalKey: "deal:posture", fieldPath: "posture", factRecordId: "prep",
        claim: `Deal posture: ${prep.posture}`, sourceType: "prep_artifact", sourceRecordId: prep.versionId,
        sourceVersion: prep.versionId, sourceDate: prep.generatedAt, origin: "Mallín",
        support: { value: prep.posture, excerpt: prep.topLine }, provenance: "mallin_inference",
        confidence: "none", payload: { kind: "deal_posture", posture: prep.posture },
      });
    }
    for (const r of prep.criticalRisks) {
      add({
        logicalKey: `risk:${r.id}`, fieldPath: `risk/${r.id}`, factRecordId: "prep",
        claim: `${r.title} (${r.severity})`, sourceType: "prep_artifact", sourceRecordId: prep.versionId,
        sourceVersion: prep.versionId, sourceDate: prep.generatedAt, origin: "Mallín",
        support: { value: r.severity, excerpt: r.description ?? r.title }, provenance: "mallin_inference",
        confidence: "none", payload: { kind: "risk", riskId: r.id, severity: r.severity, title: r.title },
      });
    }
    for (const s of prep.stakeholderStates) {
      if (s.disposition) {
        add({
          logicalKey: `stk:${s.stakeholderId}:disposition`, fieldPath: `stakeholder/${s.stakeholderId}/disposition`,
          factRecordId: "prep", claim: `${s.name} — disposition: ${s.disposition}`, sourceType: "prep_artifact",
          sourceRecordId: prep.versionId, sourceVersion: prep.versionId, sourceDate: prep.generatedAt,
          origin: "Mallín", support: { value: s.disposition, excerpt: s.dispositionRationale },
          provenance: "mallin_inference", confidence: "none",
          payload: { kind: "stakeholder", stakeholderId: s.stakeholderId, name: s.name, aspect: "disposition", value: s.disposition },
        });
      }
    }
    for (const c of prep.commitments) {
      // Resolve supporting refs against evidence already built (transcripts and
      // intelligence are added before prep). Unresolved refs are dropped, which
      // keeps an under-supported commitment from qualifying as confirmed.
      const supportingEvidenceIds = (c.supportingRefs ?? [])
        .map((ref) =>
          "sourceFactKey" in ref
            ? items.find((i) => i.sourceFactKey === ref.sourceFactKey)?.evidenceId
            : items.find(
                (i) => i.payload.kind === "transcript_statement" && i.payload.transcriptId === ref.transcriptId && i.payload.segmentId === ref.segmentId,
              )?.evidenceId,
        )
        .filter((x): x is string => !!x);
      add({
        logicalKey: `commit:${c.id}`, fieldPath: `commitment/${c.id}`, factRecordId: "prep",
        claim: `${c.label} — ${c.state}${c.expectedBy ? ` (expected by ${c.expectedBy})` : ""}`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceVersion: prep.versionId,
        sourceDate: prep.generatedAt, origin: "Mallín", support: { value: c.state, excerpt: c.label },
        provenance: "mallin_inference", confidence: "none",
        payload: {
          kind: "commitment", commitmentId: c.id, state: c.state, expectedBy: c.expectedBy ?? null,
          label: c.label,
          ...(c.party ? { party: c.party } : {}),
          ...(c.owner ? { owner: c.owner } : {}),
          ...(supportingEvidenceIds.length ? { supportingEvidenceIds } : {}),
          ...(c.stateEvidence ? { stateEvidence: c.stateEvidence } : {}),
        },
      });
    }
  }

  items.sort((a, b) => (a.logicalKey === b.logicalKey ? cmp(a.evidenceId, b.evidenceId) : cmp(a.logicalKey, b.logicalKey)));

  const gaps = items.filter((i) => i.provenance === "open_question").map((i) => i.claim);

  const latestTranscript = [...snapshot.transcripts]
    .filter((t) => t.callDate)
    .sort((a, b) => cmp(b.callDate ?? "", a.callDate ?? ""))[0];

  return {
    tenantId, dealId, snapshotId, capturedAt: snapshot.capturedAt, sequence: snapshot.sequence,
    version: {
      intelligenceVersionId: intel?.versionId,
      prepVersionId: prep?.versionId,
      latestTranscriptId: latestTranscript?.transcriptId,
      latestCallDate: latestTranscript?.callDate ?? null,
    },
    items, gaps,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}
