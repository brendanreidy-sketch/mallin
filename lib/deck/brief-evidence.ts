/**
 * brief-evidence — deterministic evidence packet for the INTERNAL executive
 * deal brief (Commit 1 foundation, hardened in Commit 1A).
 *
 * Pure TypeScript. No LLM, no rendering, no I/O, no clock, no randomness.
 * Given a point-in-time `DealSnapshot`, it produces a normalized,
 * provenance-classified `EvidencePacket` whose items carry TYPED payloads
 * (a discriminated union) and STABLE, coordinate-derived ids.
 *
 * ── Source → provenance contract ──────────────────────────────────────────
 * `customer_stated` is earned ONLY by an explicitly identified customer-side
 * speaker (a transcript statement whose speaker resolves to a buyer-side
 * attendee). It is NEVER inferred from a source label alone.
 *
 *   Source                                    → Provenance        Why
 *   transcript, speakerSide = "buyer"         → customer_stated   explicit buyer speaker
 *   transcript, speakerSide = "seller"        → seller_provided   explicit seller speaker
 *   transcript, speakerSide = "unknown"       → system_recorded   recorded, author unverified
 *   opportunity field (seller/CRM origin)     → seller_provided   seller-entered/imported
 *   opportunity field (unknown origin)        → system_recorded   connected system, author unknown
 *   intelligence SourcedFact "manual"         → seller_provided   rep-entered research
 *   intelligence SourcedFact "customer_input" → system_recorded   conservative: no per-fact speaker
 *   intelligence SourcedFact (all others)     → system_recorded   automated/external, author unknown
 *   intelligence role read / prep posture / prep risk / prep disposition
 *                                             → mallin_inference  Mallín conclusion
 *   missing / unsupported field / stated gap  → open_question     "Not confirmed"
 *
 * Confidence is preserved from the source and NEVER raised (it may only fall
 * to "none" when unknown). Provenance is NOT confidence and NOT change
 * assurance — those are separate axes (see brief-change-detection.ts).
 *
 * ── Stable evidence ids ────────────────────────────────────────────────────
 * Ids derive only from immutable source coordinates (tenant, deal, snapshot,
 * source type, source record id, field path, optional source version) — never
 * from array position, claim prose, or mutable display text. See `evidenceId`.
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

// ── Typed evidence payloads (replaces the old free-form `meta`) ─────────────
// Change detection reads these typed fields — it never parses `claim` prose.

export type EvidencePayload =
  | { kind: "opportunity_value"; field: "stage" | "amount" | "closeDate"; value: string }
  | { kind: "next_action"; origin: "opportunity" | "prep"; value: string }
  | { kind: "transcript_statement"; transcriptId: string; segmentId: string; side: SpeakerSide }
  | { kind: "intel_fact"; factKey: string; value: string }
  | { kind: "stakeholder"; stakeholderId: string; aspect: "disposition" | "role"; value: string }
  | { kind: "risk"; riskId: string; severity: RiskSeverity; title: string }
  | { kind: "commitment"; commitmentId: string; state: "open" | "done"; expectedBy: string | null; label: string }
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
  /** Stable id — a pure function of the coordinates below (see evidenceId). */
  id: string;
  tenantId: string;
  dealId: string;
  /** Cross-snapshot key: what the fact is ABOUT, version-independent. */
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
  /** Immutable per-snapshot id (ordering + id coordinate). */
  snapshotId: string;
  /** ISO timestamp of the snapshot (primary ordering key). */
  capturedAt: string;
  /** Immutable monotonic ledger sequence, when available — the ordering
   *  tie-breaker for equal timestamps. */
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
  /** Immutable segment identity within the transcript (e.g. start-ms or a
   *  segment row id). NEVER an array index. */
  segmentId: string;
  callDate: string | null; // ISO
  speaker: string | null;
  /** The ONLY thing that earns customer_stated — an explicit buyer speaker. */
  speakerSide?: SpeakerSide;
  text: string;
  /** Optional shared topic key so a statement can conflict with / change a
   *  structured source (rarely used; most statements diff by presence). */
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
  state: "open" | "done";
  expectedBy?: string | null; // ISO
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
  nextAction?: string | null;
}

export interface DealSnapshot {
  tenantId: string;
  dealId: string;
  /** Immutable per-snapshot id (ordering + evidence-id coordinate). */
  snapshotId: string;
  /** ISO — when this snapshot's artifacts were generated. */
  capturedAt: string;
  /** Immutable monotonic ledger sequence, when available. */
  sequence?: number;
  opportunity: OpportunityFields;
  intelligence?: IntelInput;
  prep?: PrepInput;
  transcripts: TranscriptExcerpt[];
}

// ── Source → provenance mapping ─────────────────────────────────────────────

/** Intelligence SourcedFact.source → provenance. NEVER customer_stated: a
 *  source label is not an identified speaker. Only rep-entered `manual`
 *  research is seller_provided; everything else is system_recorded. */
export function intelSourceToProvenance(src: IntelligenceSource): Provenance {
  if (src === "manual") return "seller_provided";
  return "system_recorded";
}

/** Transcript speaker side → provenance. Only an explicit buyer speaker earns
 *  customer_stated; unknown side never does. */
export function transcriptSideToProvenance(side: SpeakerSide | undefined): Provenance {
  if (side === "buyer") return "customer_stated";
  if (side === "seller") return "seller_provided";
  return "system_recorded";
}

/** Opportunity field origin → provenance. Never customer_stated on its own. */
export function oppOriginToProvenance(origin: OpportunityFields["origin"]): Provenance {
  if (origin === "seller_entered" || origin === "crm_import") return "seller_provided";
  return "system_recorded";
}

/** Preserve confidence; only degrade unknown → "none". Never raise. */
export function normalizeConfidence(c?: Confidence | null): EvidenceConfidence {
  if (c === "high" || c === "medium" || c === "low") return c;
  return "none";
}

// ── Stable, coordinate-derived evidence ids ─────────────────────────────────

export interface EvidenceCoordinates {
  tenantId: string;
  dealId: string;
  snapshotId: string;
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  fieldPath: string;
  sourceVersion?: string;
}

/** Deterministic evidence id from immutable coordinates only. Reordering
 *  items or editing display text cannot change it; two distinct source facts
 *  cannot collide because at least one coordinate differs. */
export function evidenceId(c: EvidenceCoordinates): string {
  const parts = [c.tenantId, c.dealId, c.snapshotId, c.sourceType, c.sourceRecordId, c.fieldPath];
  if (c.sourceVersion) parts.push(c.sourceVersion);
  return "ev:" + parts.map((p) => encodeURIComponent(p)).join("|");
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
    const id = evidenceId({
      tenantId,
      dealId,
      snapshotId,
      sourceType: args.sourceType,
      sourceRecordId: args.sourceRecordId,
      fieldPath: args.fieldPath,
      sourceVersion: args.sourceVersion,
    });
    items.push({ id, tenantId, dealId, status: "current", ...args });
  };

  // ── Opportunity fields (seller/system; never customer-confirmed) ──
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
  if (opp.nextStep != null) {
    add({
      logicalKey: "deal:nextAction", fieldPath: "nextStep", claim: `Next step: ${opp.nextStep}`,
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceVersion: snapshotId,
      sourceDate: null, origin: oppOrigin, support: { value: opp.nextStep }, provenance: oppProv,
      confidence: "none", payload: { kind: "next_action", origin: "opportunity", value: opp.nextStep },
    });
  }

  // ── Transcript statements ──
  for (const t of snapshot.transcripts) {
    const side: SpeakerSide = t.speakerSide ?? "unknown";
    add({
      logicalKey: t.topicKey ?? `txn:${t.transcriptId}:${t.segmentId}`,
      fieldPath: `segment/${t.segmentId}`, claim: t.text,
      sourceType: "transcript", sourceRecordId: t.transcriptId, sourceDate: t.callDate,
      origin: t.speaker, support: { excerpt: t.text }, provenance: transcriptSideToProvenance(side),
      confidence: "none",
      payload: { kind: "transcript_statement", transcriptId: t.transcriptId, segmentId: t.segmentId, side },
    });
  }

  // ── Intelligence facts + stakeholder role reads + gaps ──
  const intel = snapshot.intelligence;
  if (intel) {
    for (const f of intel.facts) {
      add({
        logicalKey: `intel:${f.key}`, fieldPath: `fact/${f.key}`, claim: f.value,
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
          claim: `${sh.name} — role read: ${sh.roleInDeal.value}`, sourceType: "intelligence_artifact",
          sourceRecordId: intel.versionId, sourceVersion: intel.versionId, sourceDate: intel.generatedAt,
          origin: "Mallín", support: { value: sh.roleInDeal.value, excerpt: sh.roleInDeal.rationale },
          provenance: "mallin_inference", confidence: normalizeConfidence(sh.roleInDeal.confidence),
          payload: { kind: "stakeholder", stakeholderId: sh.stakeholderId, aspect: "role", value: sh.roleInDeal.value },
        });
      }
    }
    for (const g of intel.gaps ?? []) {
      const s = slug(g);
      add({
        logicalKey: `gap:${s}`, fieldPath: `gap/${s}`, claim: `${g} — Not confirmed`,
        sourceType: "intelligence_artifact", sourceRecordId: intel.versionId, sourceVersion: intel.versionId,
        sourceDate: intel.generatedAt, origin: null, support: {}, provenance: "open_question",
        confidence: "none", payload: { kind: "open_question", topic: g },
      });
    }
  }

  // ── Prep artifact: posture, next action, risks, dispositions, commitments ──
  const prep = snapshot.prep;
  if (prep) {
    if (prep.posture) {
      add({
        logicalKey: "deal:posture", fieldPath: "posture", claim: `Deal posture: ${prep.posture}`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceVersion: prep.versionId,
        sourceDate: prep.generatedAt, origin: "Mallín", support: { value: prep.posture, excerpt: prep.topLine },
        provenance: "mallin_inference", confidence: "none", payload: { kind: "deal_posture", posture: prep.posture },
      });
    }
    if (prep.nextAction != null) {
      add({
        logicalKey: "deal:nextAction", fieldPath: "nextAction", claim: `Recommended next action: ${prep.nextAction}`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceVersion: prep.versionId,
        sourceDate: prep.generatedAt, origin: "Mallín", support: { value: prep.nextAction },
        provenance: "mallin_inference", confidence: "none",
        payload: { kind: "next_action", origin: "prep", value: prep.nextAction },
      });
    }
    for (const r of prep.criticalRisks) {
      add({
        logicalKey: `risk:${r.id}`, fieldPath: `risk/${r.id}`, claim: `${r.title} (${r.severity})`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceVersion: prep.versionId,
        sourceDate: prep.generatedAt, origin: "Mallín", support: { value: r.severity, excerpt: r.description ?? r.title },
        provenance: "mallin_inference", confidence: "none",
        payload: { kind: "risk", riskId: r.id, severity: r.severity, title: r.title },
      });
    }
    for (const s of prep.stakeholderStates) {
      if (s.disposition) {
        add({
          logicalKey: `stk:${s.stakeholderId}:disposition`, fieldPath: `stakeholder/${s.stakeholderId}/disposition`,
          claim: `${s.name} — disposition: ${s.disposition}`, sourceType: "prep_artifact",
          sourceRecordId: prep.versionId, sourceVersion: prep.versionId, sourceDate: prep.generatedAt,
          origin: "Mallín", support: { value: s.disposition, excerpt: s.dispositionRationale },
          provenance: "mallin_inference", confidence: "none",
          payload: { kind: "stakeholder", stakeholderId: s.stakeholderId, aspect: "disposition", value: s.disposition },
        });
      }
    }
    for (const c of prep.commitments) {
      add({
        logicalKey: `commit:${c.id}`, fieldPath: `commitment/${c.id}`,
        claim: `${c.label} — ${c.state}${c.expectedBy ? ` (expected by ${c.expectedBy})` : ""}`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceVersion: prep.versionId,
        sourceDate: prep.generatedAt, origin: "Mallín", support: { value: c.state, excerpt: c.label },
        provenance: "mallin_inference", confidence: "none",
        payload: { kind: "commitment", commitmentId: c.id, state: c.state, expectedBy: c.expectedBy ?? null, label: c.label },
      });
    }
  }

  // Deterministic ordering: by logicalKey, then id.
  items.sort((a, b) => (a.logicalKey === b.logicalKey ? cmp(a.id, b.id) : cmp(a.logicalKey, b.logicalKey)));

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
