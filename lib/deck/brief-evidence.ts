/**
 * brief-evidence — deterministic evidence packet for the INTERNAL executive
 * deal brief (Commit 1 foundation).
 *
 * Pure TypeScript. No LLM, no rendering, no I/O. Given a point-in-time
 * `DealSnapshot` (the deterministic source-of-truth for one deal), it produces
 * a normalized, provenance-classified `EvidencePacket`.
 *
 * Design boundary: this layer consumes a FOCUSED input model (`DealSnapshot`)
 * rather than the full 480-line `PrepArtifact` / `AccountIntelligenceArtifact`.
 * A later commit (the authenticated route) will adapt the real artifacts into
 * these inputs. The input types deliberately reuse the REAL provenance
 * vocabularies (`Confidence`, `IntelligenceSource`, `RiskSeverity`,
 * `StakeholderDisposition`, `DealPosture`) so the mapping is faithful.
 *
 * Rules honored (see the source-to-provenance table below):
 *   - Never auto-classify a fact as customer_stated. Only an explicit customer
 *     speaker / customer-authored source earns it.
 *   - Opportunity fields (stage/amount/close date/next step) are seller/system,
 *     never customer_confirmed, unless separate customer evidence supports it.
 *   - Confidence is preserved from the source and NEVER raised during
 *     normalization (it may only fall to "none" when unknown).
 *   - Missing / unsupported information becomes an `open_question` item whose
 *     claim reads "Not confirmed".
 */

import type { Confidence, IntelligenceSource } from "@/lib/intelligence/types";
import type {
  DealPosture,
  RiskSeverity,
  StakeholderDisposition,
} from "@/lib/contracts/execution-agent-output";

// ── Provenance / confidence / status vocabularies ──────────────────────────

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
  | "stakeholder_record"
  | "intelligence_artifact"
  | "prep_artifact"
  | "email";

/** One normalized, sourced, provenance-classified fact — the atomic unit the
 *  model layer will summarize (never re-classify). */
export interface EvidenceItem {
  /** Stable, deterministic id (same input → same id). */
  id: string;
  tenantId: string;
  dealId: string;
  /** What the fact is ABOUT, stable across snapshots (drives change detection).
   *  e.g. "opp:stage", "stk:sh_dana:disposition", "risk:r_pricing". */
  logicalKey: string;
  /** Normalized human-readable claim or value. */
  claim: string;
  sourceType: EvidenceSourceType;
  sourceRecordId: string;
  /** ISO date of the source record / call. Null when genuinely unknown. */
  sourceDate: string | null;
  /** Speaker or system origin when available. */
  origin: string | null;
  /** Exact supporting excerpt and/or the structured value. */
  support: { excerpt?: string; value?: string };
  provenance: Provenance;
  /** Original source confidence — never raised here. */
  confidence: EvidenceConfidence;
  confidenceNote?: string;
  /** Structured fields change-detection needs without parsing `claim`
   *  (e.g. risk severity, commitment state/expectedBy). */
  meta?: Record<string, string>;
  status: EvidenceStatus;
}

export interface EvidencePacket {
  tenantId: string;
  dealId: string;
  /** ISO timestamp of the snapshot's newest artifact (canonical ordering key). */
  capturedAt: string;
  version: {
    intelligenceVersionId?: string;
    prepVersionId?: string;
    latestTranscriptId?: string;
    latestCallDate?: string | null;
  };
  items: EvidenceItem[];
  /** Convenience view of the open questions / "Not confirmed" seeds. */
  gaps: string[];
}

// ── Focused source inputs (a later adapter maps real artifacts → these) ─────

export interface OpportunityFields {
  recordId: string;
  name: string;
  stageLabel?: string | null;
  amountUsd?: number | null;
  currency?: string | null;
  closeDate?: string | null; // ISO
  nextStep?: string | null;
  /** How these fields got here — drives seller_provided vs system_recorded. */
  origin?: "seller_entered" | "crm_import" | "unknown";
}

export interface TranscriptExcerpt {
  transcriptId: string;
  callDate: string | null; // ISO
  speaker: string | null;
  /** Whose side the speaker is on — the ONLY thing that earns customer_stated. */
  speakerSide?: "buyer" | "seller" | "unknown";
  excerpt: string;
  /** When this excerpt is evidence for a shared topic (e.g. "opp:closeDate"),
   *  set the shared logicalKey so it can conflict with / change other sources. */
  topicKey?: string;
}

export interface IntelFactInput {
  /** Logical key WITHOUT the "intel:" prefix, e.g. "priority:reduce-close-time". */
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
  /** Mallín's read of their role — an inference, carries its own confidence. */
  roleInDeal?: { value: string; confidence: Confidence; rationale?: string };
}

export interface IntelInput {
  versionId: string;
  generatedAt: string; // ISO — canonical ordering key
  facts: IntelFactInput[];
  stakeholders: IntelStakeholderInput[];
  /** Known gaps → each becomes an open_question "Not confirmed" item. */
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
  /** Raw recorded state. "done" vs "open" + `expectedBy` lets change-detection
   *  derive completed/missed deterministically — no LLM. */
  state: "open" | "done";
  expectedBy?: string | null; // ISO
  route?: string | null;
  evidenceIds?: string[];
}

export interface PrepInput {
  versionId: string;
  generatedAt: string; // ISO — canonical ordering key
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
  /** ISO — when this snapshot's artifacts were generated (canonical order). */
  capturedAt: string;
  opportunity: OpportunityFields;
  intelligence?: IntelInput;
  prep?: PrepInput;
  transcripts: TranscriptExcerpt[];
}

// ── Source → provenance mapping (see packet doc for the table) ──────────────

const RESEARCH_SOURCES: ReadonlySet<IntelligenceSource> = new Set<IntelligenceSource>([
  "web_search",
  "company_website",
  "crunchbase",
  "apollo",
  "people_data_labs",
  "contify",
  "newsapi",
  "calendar_invite",
  "linkedin_url_provided",
]);

/** Intelligence SourcedFact.source → provenance. Only `customer_input` earns
 *  customer_stated; rep-entered `manual` research is seller_provided; automated
 *  external sources are system_recorded. */
export function intelSourceToProvenance(src: IntelligenceSource): Provenance {
  if (src === "customer_input") return "customer_stated";
  if (src === "manual") return "seller_provided";
  if (RESEARCH_SOURCES.has(src)) return "system_recorded";
  return "system_recorded";
}

/** Transcript speaker side → provenance. Unknown side never earns customer_stated. */
export function transcriptSideToProvenance(
  side: TranscriptExcerpt["speakerSide"],
): Provenance {
  if (side === "buyer") return "customer_stated";
  if (side === "seller") return "seller_provided";
  return "system_recorded";
}

/** Opportunity field origin → provenance. Never customer_stated on its own. */
export function oppOriginToProvenance(
  origin: OpportunityFields["origin"],
): Provenance {
  if (origin === "seller_entered" || origin === "crm_import") return "seller_provided";
  return "system_recorded";
}

/** Preserve confidence; only degrade unknown → "none". Never raise. */
export function normalizeConfidence(c?: Confidence | null): EvidenceConfidence {
  if (c === "high" || c === "medium" || c === "low") return c;
  return "none";
}

// ── Assembly ────────────────────────────────────────────────────────────────

function fmtUsd(amount: number, currency = "USD"): string {
  return `${currency === "USD" ? "$" : currency + " "}${amount.toLocaleString("en-US")}`;
}

/** Build a single-snapshot evidence packet. All items are status "current"
 *  relative to this snapshot. Pure + deterministic. */
export function buildEvidencePacket(snapshot: DealSnapshot): EvidencePacket {
  const { tenantId, dealId } = snapshot;
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();

  const push = (
    partial: Omit<EvidenceItem, "id" | "tenantId" | "dealId" | "status"> & { idSeed?: string },
  ) => {
    const base = partial.idSeed ?? `${partial.sourceType}:${partial.sourceRecordId}:${partial.logicalKey}`;
    let id = base;
    let n = 1;
    while (seen.has(id)) id = `${base}#${++n}`; // deterministic disambiguation
    seen.add(id);
    const { idSeed: _drop, ...rest } = partial;
    items.push({ id, tenantId, dealId, status: "current", ...rest });
  };

  // ── Opportunity fields (seller/system; never customer_confirmed) ──
  const opp = snapshot.opportunity;
  const oppProv = oppOriginToProvenance(opp.origin);
  const oppOrigin = opp.origin === "crm_import" ? "CRM import" : opp.origin === "seller_entered" ? "Seller" : "System";
  if (opp.stageLabel != null) {
    push({
      logicalKey: "opp:stage", claim: `Stage: ${opp.stageLabel}`, sourceType: "opportunity",
      sourceRecordId: opp.recordId, sourceDate: null, origin: oppOrigin,
      support: { value: opp.stageLabel }, provenance: oppProv, confidence: "none",
    });
  }
  if (opp.amountUsd != null) {
    push({
      logicalKey: "opp:amount", claim: `Amount: ${fmtUsd(opp.amountUsd, opp.currency ?? "USD")}`,
      sourceType: "opportunity", sourceRecordId: opp.recordId, sourceDate: null, origin: oppOrigin,
      support: { value: String(opp.amountUsd) }, provenance: oppProv, confidence: "none",
    });
  } else {
    push({
      logicalKey: "opp:amount", claim: "Deal amount — Not confirmed", sourceType: "opportunity",
      sourceRecordId: opp.recordId, sourceDate: null, origin: null, support: {},
      provenance: "open_question", confidence: "none",
    });
  }
  if (opp.closeDate != null) {
    push({
      logicalKey: "opp:closeDate", claim: `Close date: ${opp.closeDate}`, sourceType: "opportunity",
      sourceRecordId: opp.recordId, sourceDate: null, origin: oppOrigin,
      support: { value: opp.closeDate }, provenance: oppProv, confidence: "none",
    });
  }
  if (opp.nextStep != null) {
    push({
      logicalKey: "deal:nextAction", claim: `Next step: ${opp.nextStep}`, sourceType: "opportunity",
      sourceRecordId: opp.recordId, sourceDate: null, origin: oppOrigin,
      support: { value: opp.nextStep }, provenance: oppProv, confidence: "none",
    });
  }

  // ── Transcript excerpts ──
  for (let i = 0; i < snapshot.transcripts.length; i++) {
    const t = snapshot.transcripts[i];
    push({
      logicalKey: t.topicKey ?? `txn:${t.transcriptId}:${i}`,
      claim: t.excerpt,
      sourceType: "transcript", sourceRecordId: t.transcriptId, sourceDate: t.callDate,
      origin: t.speaker, support: { excerpt: t.excerpt },
      provenance: transcriptSideToProvenance(t.speakerSide), confidence: "none",
      idSeed: `transcript:${t.transcriptId}:${i}`,
    });
  }

  // ── Intelligence facts + stakeholder role reads ──
  const intel = snapshot.intelligence;
  if (intel) {
    for (const f of intel.facts) {
      push({
        logicalKey: `intel:${f.key}`, claim: f.value, sourceType: "intelligence_artifact",
        sourceRecordId: intel.versionId, sourceDate: f.capturedAt ?? intel.generatedAt,
        origin: f.source, support: { value: f.value },
        provenance: intelSourceToProvenance(f.source), confidence: normalizeConfidence(f.confidence),
        confidenceNote: f.confidenceNote,
        idSeed: `intelligence_artifact:${intel.versionId}:intel:${f.key}`,
      });
    }
    for (const sh of intel.stakeholders) {
      if (sh.roleInDeal) {
        push({
          logicalKey: `stk:${sh.stakeholderId}:role`,
          claim: `${sh.name} — role read: ${sh.roleInDeal.value}`, sourceType: "intelligence_artifact",
          sourceRecordId: intel.versionId, sourceDate: intel.generatedAt, origin: "Mallín",
          support: { value: sh.roleInDeal.value, excerpt: sh.roleInDeal.rationale },
          provenance: "mallin_inference", confidence: normalizeConfidence(sh.roleInDeal.confidence),
        });
      }
    }
    for (const g of intel.gaps ?? []) {
      push({
        logicalKey: `gap:${slug(g)}`, claim: `${g} — Not confirmed`, sourceType: "intelligence_artifact",
        sourceRecordId: intel.versionId, sourceDate: intel.generatedAt, origin: null, support: {},
        provenance: "open_question", confidence: "none",
      });
    }
  }

  // ── Prep artifact: posture, risks, stakeholder dispositions, commitments ──
  const prep = snapshot.prep;
  if (prep) {
    if (prep.posture) {
      push({
        logicalKey: "deal:posture", claim: `Deal posture: ${prep.posture}`, sourceType: "prep_artifact",
        sourceRecordId: prep.versionId, sourceDate: prep.generatedAt, origin: "Mallín",
        support: { value: prep.posture, excerpt: prep.topLine }, provenance: "mallin_inference",
        confidence: "none",
      });
    }
    if (prep.nextAction != null) {
      push({
        logicalKey: "deal:nextAction", claim: `Recommended next action: ${prep.nextAction}`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceDate: prep.generatedAt,
        origin: "Mallín", support: { value: prep.nextAction }, provenance: "mallin_inference",
        confidence: "none",
      });
    }
    for (const r of prep.criticalRisks) {
      push({
        logicalKey: `risk:${r.id}`, claim: `${r.title} (${r.severity})`, sourceType: "prep_artifact",
        sourceRecordId: prep.versionId, sourceDate: prep.generatedAt, origin: "Mallín",
        support: { value: r.severity, excerpt: r.description ?? r.title }, provenance: "mallin_inference",
        confidence: "none", meta: { severity: r.severity },
      });
    }
    for (const s of prep.stakeholderStates) {
      if (s.disposition) {
        push({
          logicalKey: `stk:${s.stakeholderId}:disposition`,
          claim: `${s.name} — disposition: ${s.disposition}`, sourceType: "prep_artifact",
          sourceRecordId: prep.versionId, sourceDate: prep.generatedAt, origin: "Mallín",
          support: { value: s.disposition, excerpt: s.dispositionRationale }, provenance: "mallin_inference",
          confidence: "none",
        });
      }
    }
    for (const c of prep.commitments) {
      push({
        logicalKey: `commit:${c.id}`,
        claim: `${c.label} — ${c.state}${c.expectedBy ? ` (expected by ${c.expectedBy})` : ""}`,
        sourceType: "prep_artifact", sourceRecordId: prep.versionId, sourceDate: prep.generatedAt,
        origin: "Mallín", support: { value: c.state, excerpt: c.label }, provenance: "mallin_inference",
        confidence: "none",
        meta: { state: c.state, ...(c.expectedBy ? { expectedBy: c.expectedBy } : {}) },
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
    tenantId, dealId, capturedAt: snapshot.capturedAt,
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
