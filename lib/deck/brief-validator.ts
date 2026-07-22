/**
 * brief-validator — deterministic, fail-closed validation of a model-generated
 * BriefDraft against the deterministic EvidencePacket + ChangeSet (Commit 2).
 *
 * Pure TypeScript. No LLM. It rejects the WHOLE draft when any factual claim is
 * unsupported, provenance was upgraded, confidence was raised, an unresolved
 * item is written as certain, a conflict is unlabeled, a completed commitment
 * lacks proof, a removed commitment is claimed completed, an unsupported next
 * action appears, a "what changed" item is absent from the ChangeSet, or a real
 * person/company/date/amount appears without supporting evidence.
 *
 * It NEVER silently drops content and continues — a failure returns structured
 * errors; the agent decides on the single constrained repair.
 */

import { comparableValue, type EvidenceItem, type EvidencePacket, type Provenance } from "@/lib/deck/brief-evidence";
import type { BriefChange, ChangeSet } from "@/lib/deck/brief-change-detection";
import {
  deriveAssurance,
  deriveConfidenceCeiling,
  deriveProvenanceUnion,
  confidenceRank,
  FACTUAL_CONTENT_TYPES,
  type BriefContentItem,
  type BriefDraft,
  type BriefSection,
  type CoverMetadata,
} from "@/lib/deck/brief-model";

export type ValidationErrorCode =
  | "duplicate_content_id"
  | "evidence_id_not_found"
  | "source_fact_key_not_found"
  | "evidence_key_mismatch"
  | "factual_item_missing_evidence"
  | "provenance_upgraded"
  | "confidence_raised"
  | "unresolved_written_as_certain"
  | "conflict_unlabeled"
  | "assurance_mismatch"
  | "customer_commitment_unsupported"
  | "completed_commitment_without_evidence"
  | "unsupported_next_action"
  | "what_changed_not_in_changeset"
  | "what_changed_without_prior_state"
  | "unsupported_entity"
  | "recommendation_as_commitment";

export interface ValidationError {
  code: ValidationErrorCode;
  itemId?: string;
  section?: BriefSection;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidatorContext {
  packet: EvidencePacket;
  changeSet: ChangeSet;
  cover: CoverMetadata;
}

interface Located {
  item: BriefContentItem;
  section: BriefSection;
  bucket?: "customerCommitments" | "sellerActions" | "mallinRecommendations" | "unresolvedActions";
  isWhatChanged: boolean;
}

export function validateBriefDraft(draft: BriefDraft, ctx: ValidatorContext): ValidationResult {
  const errors: ValidationError[] = [];
  const { packet, changeSet } = ctx;

  const evidenceById = new Map(packet.items.map((i) => [i.evidenceId, i]));
  const packetFactKeys = new Set(packet.items.map((i) => i.sourceFactKey));
  const changeEvidenceIds = new Set<string>();
  const changeFactKeys = new Set<string>();
  for (const c of changeSet.changes) {
    for (const id of [...c.previousEvidenceIds, ...c.currentEvidenceIds]) changeEvidenceIds.add(id);
    for (const k of c.sourceFactKeys) changeFactKeys.add(k);
  }
  const allFactKeys = new Set<string>([...packetFactKeys, ...changeFactKeys]);
  const nextAction = describeNextAction(packet);

  const located = locate(draft);

  // Global: unique content ids.
  const seen = new Set<string>();
  for (const { item, section } of located) {
    if (seen.has(item.id)) {
      errors.push({ code: "duplicate_content_id", itemId: item.id, section, message: `Duplicate content id "${item.id}".` });
    }
    seen.add(item.id);
  }

  for (const loc of located) {
    validateItem(loc, { evidenceById, packetFactKeys, changeEvidenceIds, changeFactKeys, allFactKeys, changeSet, cover: ctx.cover, nextAction }, errors);
  }

  return { valid: errors.length === 0, errors };
}

// ── per-item validation ──────────────────────────────────────────────────────

interface Maps {
  evidenceById: Map<string, EvidenceItem>;
  packetFactKeys: Set<string>;
  changeEvidenceIds: Set<string>;
  changeFactKeys: Set<string>;
  allFactKeys: Set<string>;
  changeSet: ChangeSet;
  cover: CoverMetadata;
  nextAction: NextActionState;
}

function validateItem(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section, bucket, isWhatChanged } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (item.contentType === "decorative") return; // labels need no evidence

  const factual = FACTUAL_CONTENT_TYPES.has(item.contentType);
  if (factual && item.evidenceIds.length === 0) {
    push("factual_item_missing_evidence", `"${item.contentType}" item has no supporting evidence.`);
    return;
  }

  // Recommendations are never customer commitments.
  if (bucket === "customerCommitments" && item.contentType === "mallin_recommendation") {
    push("recommendation_as_commitment", "A mallin_recommendation cannot be a customer commitment.");
  }

  if (isWhatChanged) {
    validateWhatChanged(loc, maps, errors);
  } else {
    validatePacketBacked(loc, maps, errors);
  }

  // Next-action guard (applies regardless of domain).
  if (item.nextActionClaim) {
    const na = maps.nextAction;
    const uncertain = na.notConfirmed || na.conflicting;
    const allowedType = item.contentType === "mallin_recommendation" || item.contentType === "unresolved_action";
    const labeledUncertain = item.assurance === "unresolved" || item.assurance === "conflicting";
    if (uncertain && (!allowedType || !labeledUncertain)) {
      push(
        "unsupported_next_action",
        `Next action is ${na.notConfirmed ? "Not confirmed" : "conflicting"}; it cannot be presented as a confirmed action.`,
      );
    }
  }
}

function validatePacketBacked(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  const cited: EvidenceItem[] = [];
  for (const id of item.evidenceIds) {
    const found = maps.evidenceById.get(id);
    if (!found) push("evidence_id_not_found", `Evidence id "${id}" does not exist in the packet.`);
    else cited.push(found);
  }
  for (const k of item.sourceFactKeys) {
    if (!maps.allFactKeys.has(k)) push("source_fact_key_not_found", `Source-fact key "${k}" does not exist.`);
  }
  if (cited.length !== item.evidenceIds.length) return; // can't derive from missing evidence

  // Correspondence: the cited evidence's fact keys must equal the item's.
  const citedKeys = new Set(cited.map((c) => c.sourceFactKey));
  const claimedKeys = new Set(item.sourceFactKeys);
  if (!setsEqual(citedKeys, claimedKeys)) {
    push("evidence_key_mismatch", "Cited evidenceIds and sourceFactKeys do not correspond.");
  }

  checkProvenanceConfidenceAssurance(loc, cited, deriveAssurance(cited), errors);
  checkEntities(loc, corpusFor(cited, maps.cover), errors);
  checkTypeRules(loc, cited, maps, errors);
}

function validateWhatChanged(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (!maps.changeSet.hasPriorState) {
    push("what_changed_without_prior_state", "A 'what changed' item is not allowed without a reliable prior state.");
    return;
  }
  for (const id of item.evidenceIds) {
    if (!maps.changeEvidenceIds.has(id)) push("evidence_id_not_found", `Evidence id "${id}" is not part of any ChangeSet change.`);
  }
  for (const k of item.sourceFactKeys) {
    if (!maps.changeFactKeys.has(k)) push("source_fact_key_not_found", `Source-fact key "${k}" is not part of any ChangeSet change.`);
  }

  const match = matchChange(item, maps.changeSet.changes);
  if (!match) {
    push("what_changed_not_in_changeset", "This 'what changed' item does not correspond to a deterministic change.");
    return;
  }

  // Assurance must equal the change's assurance.
  if (item.assurance !== match.assurance) {
    if (match.assurance === "unresolved") push("unresolved_written_as_certain", "Change is unresolved but the item is more certain.");
    else if (match.assurance === "conflicting") push("conflict_unlabeled", "Change is conflicting but the item is not labeled conflicting.");
    else push("assurance_mismatch", `Assurance "${item.assurance}" ≠ change assurance "${match.assurance}".`);
  }

  // Provenance/confidence from the resolvable (current-side) evidence.
  const resolvable = item.evidenceIds.map((id) => maps.evidenceById.get(id)).filter((x): x is EvidenceItem => !!x);
  const allowed: Provenance[] = resolvable.length
    ? deriveProvenanceUnion(resolvable)
    : match.assurance === "unresolved"
      ? ["open_question"]
      : ["mallin_inference"];
  for (const p of item.provenance) {
    if (!allowed.includes(p)) push("provenance_upgraded", `Provenance "${p}" is not supported by the change's evidence.`);
  }
  if (item.provenance.includes("customer_stated") && !resolvable.some((r) => r.provenance === "customer_stated")) {
    push("provenance_upgraded", "customer_stated claimed without a customer-stated source.");
  }
  const ceiling = deriveConfidenceCeiling(resolvable);
  if (confidenceRank(item.confidence) > confidenceRank(ceiling)) {
    push("confidence_raised", `Confidence "${item.confidence}" exceeds ceiling "${ceiling}".`);
  }

  checkEntities(loc, corpusForChange(match, maps.cover), errors);
  checkTypeRules(loc, resolvable, maps, errors);
}

function checkProvenanceConfidenceAssurance(
  loc: Located,
  cited: EvidenceItem[],
  derivedAssurance: ReturnType<typeof deriveAssurance>,
  errors: ValidationError[],
): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  const union = deriveProvenanceUnion(cited);
  if (item.provenance.length === 0) push("provenance_upgraded", "Item has no inherited provenance.");
  for (const p of item.provenance) {
    if (!union.includes(p)) push("provenance_upgraded", `Provenance "${p}" is not present in the supporting evidence.`);
  }

  const ceiling = deriveConfidenceCeiling(cited);
  if (confidenceRank(item.confidence) > confidenceRank(ceiling)) {
    push("confidence_raised", `Confidence "${item.confidence}" exceeds the lowest supporting confidence "${ceiling}".`);
  }

  if (item.assurance !== derivedAssurance) {
    if (derivedAssurance === "unresolved") push("unresolved_written_as_certain", "Supporting evidence is unresolved but the item is more certain.");
    else if (derivedAssurance === "conflicting") push("conflict_unlabeled", "Supporting evidence conflicts but the item is not labeled conflicting.");
    else push("assurance_mismatch", `Assurance "${item.assurance}" ≠ derived "${derivedAssurance}".`);
  }
}

function checkTypeRules(loc: Located, cited: EvidenceItem[], maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (item.contentType === "customer_commitment") {
    const backed =
      cited.some((c) => c.provenance === "customer_stated") ||
      cited.some((c) => c.payload.kind === "commitment" && c.payload.stateEvidence);
    if (!backed) push("customer_commitment_unsupported", "Customer commitment lacks customer-stated / confirmed support.");
  }

  const claim = item.commitmentClaim;
  if (claim && claim.status === "completed") {
    const provenByPacket = cited.some(
      (c) => c.payload.kind === "commitment" && c.sourceFactKey === claim.sourceFactKey && c.payload.state === "done" && !!c.payload.stateEvidence,
    );
    const removed = maps.changeSet.changes.some((c) => c.type === "commitment_removed" && c.sourceFactKeys.includes(claim.sourceFactKey));
    const provenByChange = maps.changeSet.changes.some(
      (c) => c.type === "commitment_completed" && c.assurance === "observed" && c.sourceFactKeys.includes(claim.sourceFactKey),
    );
    if (removed || !(provenByPacket || provenByChange)) {
      push("completed_commitment_without_evidence", `Commitment ${claim.sourceFactKey} claimed completed without explicit completion evidence.`);
    }
  }
}

// ── entity extraction (dates / amounts / multi-word proper nouns) ────────────

function checkEntities(loc: Located, corpus: string, errors: ValidationError[]): void {
  const { item, section } = loc;
  const entities = extractEntities(item.text);
  const hay = corpus.toLowerCase();
  for (const e of entities) {
    if (!hay.includes(e.toLowerCase())) {
      errors.push({ code: "unsupported_entity", itemId: item.id, section, message: `Unsupported entity "${e}" not found in supporting evidence.` });
    }
  }
}

function extractEntities(text: string): string[] {
  const out = new Set<string>();
  const dateRe = /\b\d{4}-\d{2}-\d{2}\b/g;
  const monthRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/g;
  const amountRe = /\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b/g;
  const namesRe = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  for (const re of [dateRe, monthRe, amountRe, namesRe]) {
    for (const m of text.matchAll(re)) out.add(m[0].trim());
  }
  return [...out];
}

function corpusFor(cited: EvidenceItem[], cover: CoverMetadata): string {
  const parts: string[] = [cover.dealName, cover.preparedFor ?? "", cover.classification];
  for (const c of cited) {
    parts.push(c.claim, c.support.excerpt ?? "", c.support.value ?? "", comparableValue(c.payload));
  }
  return parts.join(" \n ");
}

function corpusForChange(change: BriefChange, cover: CoverMetadata): string {
  return [cover.dealName, cover.preparedFor ?? "", cover.classification, change.previousValue ?? "", change.currentValue ?? "", change.logicalKey].join(" \n ");
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface NextActionState {
  notConfirmed: boolean;
  conflicting: boolean;
  confirmed: boolean;
}
function describeNextAction(packet: EvidencePacket): NextActionState {
  const items = packet.items.filter((i) => i.logicalKey === "deal:nextAction");
  const notConfirmed = items.some((i) => i.provenance === "open_question");
  const values = new Set(items.filter((i) => i.provenance !== "open_question").map((i) => comparableValue(i.payload)));
  return { notConfirmed, conflicting: values.size > 1, confirmed: !notConfirmed && values.size === 1 };
}

function matchChange(item: BriefContentItem, changes: BriefChange[]): BriefChange | undefined {
  const itemKeys = new Set(item.sourceFactKeys);
  const itemIds = new Set(item.evidenceIds);
  return changes.find((c) => {
    const cKeys = new Set(c.sourceFactKeys);
    const cIds = new Set([...c.previousEvidenceIds, ...c.currentEvidenceIds]);
    return isSubset(itemKeys, cKeys) && isSubset(itemIds, cIds) && itemKeys.size > 0;
  });
}

function locate(draft: BriefDraft): Located[] {
  const out: Located[] = [];
  const add = (items: BriefContentItem[], section: BriefSection, isWhatChanged = false, bucket?: Located["bucket"]) => {
    for (const item of items) out.push({ item, section, isWhatChanged, bucket });
  };
  add(draft.executiveSummary, "executive_summary");
  add(draft.whatChanged, "what_changed", true);
  add(draft.customerPriorities, "priorities");
  add(draft.stakeholders, "stakeholders");
  add(draft.decisionProcess, "decision_process");
  add(draft.risks, "risks");
  add(draft.actionPlan.customerCommitments, "action_plan", false, "customerCommitments");
  add(draft.actionPlan.sellerActions, "action_plan", false, "sellerActions");
  add(draft.actionPlan.mallinRecommendations, "action_plan", false, "mallinRecommendations");
  add(draft.actionPlan.unresolvedActions, "action_plan", false, "unresolvedActions");
  add(draft.appendix, "appendix");
  return out;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
function isSubset(a: Set<string>, b: Set<string>): boolean {
  return [...a].every((x) => b.has(x));
}
