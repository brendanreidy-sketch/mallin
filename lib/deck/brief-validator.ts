/**
 * brief-validator — deterministic, fail-closed validation of an UNTRUSTED model
 * response against the deterministic EvidencePacket + ChangeSet (Commit 2, 2A).
 *
 * Pure TypeScript. No LLM, no second-model judge. Layers (primary controls
 * first; the entity heuristic is defense-in-depth only):
 *   1. STRICT RUNTIME SCHEMA (brief-schema) — shape, enums, id formats, budgets,
 *      unknown-field rejection, duplicate ids. Untrusted JSON is not typed.
 *   2. TYPED FACT BINDINGS — every bound value must equal the exact typed value
 *      in the cited evidence payload (selectTypedValue); claim prose is never
 *      the source of truth.
 *   3. EVIDENCE/VALUE CORRESPONDENCE — evidenceIds ↔ sourceFactKeys ↔ bindings.
 *   4. EXACT CHANGE REFERENCES — every what_changed item cites real changeIds
 *      whose before/after evidence and assurance match; text may not strengthen
 *      an unresolved/inferred change.
 *   5. PROVENANCE + CONFIDENCE INHERITANCE — never upgraded, never raised.
 *   6. ASSERTION MODES — sourced_fact / supported_synthesis / mallin_recommendation
 *      / unresolved, each with its own rules.
 *   7. ENTITY HEURISTIC (defense in depth) — detected people/dates/amounts in the
 *      text must be covered by a binding value. Known limits are documented in
 *      the packet: false positives (an evidence-supported phrase the heuristic
 *      misreads as an entity) and false negatives (a fabricated claim carrying no
 *      name/date/amount is not detected here — bindings + correspondence are the
 *      real control).
 *
 * A failure returns structured errors and NEVER silently drops content.
 */

import { comparableValue, type EvidenceItem, type EvidencePacket, type Provenance } from "@/lib/deck/brief-evidence";
import type { BriefChange, ChangeSet } from "@/lib/deck/brief-change-detection";
import {
  deriveAssurance,
  deriveConfidenceCeiling,
  deriveProvenanceUnion,
  confidenceRank,
  selectTypedValue,
  FACTUAL_CONTENT_TYPES,
  type BriefContentItem,
  type BriefDraft,
  type BriefSection,
  type CoverMetadata,
} from "@/lib/deck/brief-model";
import { parseBriefDraftStrict } from "@/lib/deck/brief-schema";

export type ValidationErrorCode =
  | "schema_invalid"
  | "duplicate_content_id"
  | "evidence_id_not_found"
  | "source_fact_key_not_found"
  | "evidence_key_mismatch"
  | "factual_item_missing_evidence"
  | "binding_evidence_mismatch"
  | "binding_value_mismatch"
  | "unbound_fact"
  | "assertion_mode_invalid"
  | "change_id_not_found"
  | "change_reference_mismatch"
  | "provenance_upgraded"
  | "confidence_raised"
  | "unresolved_written_as_certain"
  | "conflict_unlabeled"
  | "assurance_mismatch"
  | "customer_commitment_not_typed"
  | "customer_commitment_unsupported"
  | "commitment_support_invalid"
  | "action_category_mismatch"
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

type ActionBucket =
  | "customerCommitments"
  | "inferredCustomerCommitments"
  | "sellerActions"
  | "mallinRecommendations"
  | "unresolvedActions";

/** The single content type allowed in each action bucket — categories may not
 *  collapse into one another. */
const BUCKET_CONTENT_TYPE: Record<ActionBucket, string> = {
  customerCommitments: "customer_commitment",
  inferredCustomerCommitments: "inferred_customer_commitment",
  sellerActions: "seller_action",
  mallinRecommendations: "mallin_recommendation",
  unresolvedActions: "unresolved_action",
};

interface Located {
  item: BriefContentItem;
  section: BriefSection;
  bucket?: ActionBucket;
  isWhatChanged: boolean;
}

interface Maps {
  evidenceById: Map<string, EvidenceItem>;
  allFactKeys: Set<string>;
  changeEvidenceIds: Set<string>;
  changeFactKeys: Set<string>;
  changeById: Map<string, BriefChange>;
  changeSet: ChangeSet;
  cover: CoverMetadata;
  nextAction: NextActionState;
}

export function validateBriefDraft(input: unknown, ctx: ValidatorContext): ValidationResult {
  // 1. Strict runtime schema — untrusted JSON is not typed.
  const parsed = parseBriefDraftStrict(input);
  if (!parsed.ok) {
    return { valid: false, errors: parsed.errors.map((e) => ({ code: "schema_invalid" as const, message: `${e.path || "<root>"}: ${e.message}` })) };
  }
  const draft = parsed.draft as unknown as BriefDraft;
  const { packet, changeSet } = ctx;

  const maps: Maps = {
    evidenceById: new Map(packet.items.map((i) => [i.evidenceId, i])),
    allFactKeys: new Set<string>(),
    changeEvidenceIds: new Set<string>(),
    changeFactKeys: new Set<string>(),
    changeById: new Map<string, BriefChange>(),
    changeSet,
    cover: ctx.cover,
    nextAction: describeNextAction(packet),
  };
  for (const i of packet.items) maps.allFactKeys.add(i.sourceFactKey);
  for (const c of changeSet.changes) {
    maps.changeById.set(c.changeId, c);
    for (const id of [...c.previousEvidenceIds, ...c.currentEvidenceIds]) maps.changeEvidenceIds.add(id);
    for (const k of c.sourceFactKeys) {
      maps.changeFactKeys.add(k);
      maps.allFactKeys.add(k);
    }
  }

  const errors: ValidationError[] = [];
  for (const loc of locate(draft)) validateItem(loc, maps, errors);
  return { valid: errors.length === 0, errors };
}

// ── per-item ─────────────────────────────────────────────────────────────────

function validateItem(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section, bucket, isWhatChanged } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (item.contentType === "decorative") return;

  const factual = FACTUAL_CONTENT_TYPES.has(item.contentType);
  if (factual && item.evidenceIds.length === 0) {
    push("factual_item_missing_evidence", `"${item.contentType}" item has no supporting evidence.`);
    return;
  }

  // Assertion mode ⇔ recommendation label.
  const isRec = item.contentType === "mallin_recommendation";
  if (isRec !== (item.assertionMode === "mallin_recommendation")) {
    push("assertion_mode_invalid", "mallin_recommendation content and assertion mode must agree.");
  }
  if (bucket === "customerCommitments" && isRec) {
    push("recommendation_as_commitment", "A mallin_recommendation cannot be a customer commitment.");
  }
  // Each action bucket admits exactly one content type — categories can't collapse.
  if (bucket && item.contentType !== BUCKET_CONTENT_TYPE[bucket]) {
    push("action_category_mismatch", `Bucket "${bucket}" requires contentType "${BUCKET_CONTENT_TYPE[bucket]}", got "${item.contentType}".`);
  }
  // An inferred possible commitment must never be presented as an agreed fact.
  if (item.contentType === "inferred_customer_commitment" && item.assertionMode === "sourced_fact") {
    push("assertion_mode_invalid", "An inferred_customer_commitment cannot be a sourced_fact.");
  }
  if (item.assertionMode === "sourced_fact" && item.factBindings.length === 0) {
    push("assertion_mode_invalid", "A sourced_fact must carry at least one typed fact binding.");
  }

  validateBindings(loc, maps, errors);

  if (isWhatChanged) validateWhatChanged(loc, maps, errors);
  else validatePacketBacked(loc, maps, errors);

  checkEntityCoverage(loc, maps, errors);

  if (item.nextActionClaim) {
    const na = maps.nextAction;
    const uncertain = na.notConfirmed || na.conflicting;
    const allowedType = isRec || item.contentType === "unresolved_action";
    const labeledUncertain = item.assurance === "unresolved" || item.assurance === "conflicting";
    if (uncertain && (!allowedType || !labeledUncertain)) {
      push("unsupported_next_action", `Next action is ${na.notConfirmed ? "Not confirmed" : "conflicting"}; cannot be presented as confirmed.`);
    }
  }
}

/** Each binding must reference cited evidence AND its value must equal the
 *  exact TYPED value in that evidence payload. */
function validateBindings(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });
  const cited = new Set(item.evidenceIds);
  const citedKeys = new Set(item.sourceFactKeys);

  for (const b of item.factBindings) {
    if (!cited.has(b.evidenceId)) push("binding_evidence_mismatch", `Binding references uncited evidence "${b.evidenceId}".`);
    if (!citedKeys.has(b.sourceFactKey)) push("binding_evidence_mismatch", `Binding references uncited sourceFactKey "${b.sourceFactKey}".`);

    const ev = maps.evidenceById.get(b.evidenceId);
    if (ev) {
      if (ev.sourceFactKey !== b.sourceFactKey) push("binding_evidence_mismatch", `Binding sourceFactKey ≠ evidence for "${b.evidenceId}".`);
      if (ev.payload.kind !== b.payloadKind) push("binding_evidence_mismatch", `Binding payloadKind "${b.payloadKind}" ≠ evidence "${ev.payload.kind}".`);
      const typed = selectTypedValue(ev.payload, b.fieldPath);
      if (typed !== b.value) push("binding_value_mismatch", `Bound value "${b.value}" ≠ typed ${b.payloadKind}.${b.fieldPath} = "${typed ?? "∅"}".`);
    } else if (maps.changeEvidenceIds.has(b.evidenceId)) {
      // Prior-snapshot (change-side) evidence has no live payload — require a
      // change reference instead of a typed-value check.
      if (!b.changeId || !maps.changeById.has(b.changeId)) push("change_id_not_found", `Change-side binding "${b.evidenceId}" lacks a valid changeId.`);
    } else {
      push("evidence_id_not_found", `Binding evidence id "${b.evidenceId}" does not exist.`);
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
  for (const k of item.sourceFactKeys) if (!maps.allFactKeys.has(k)) push("source_fact_key_not_found", `Source-fact key "${k}" does not exist.`);
  if (cited.length !== item.evidenceIds.length) return;

  if (!setsEqual(new Set(cited.map((c) => c.sourceFactKey)), new Set(item.sourceFactKeys))) {
    push("evidence_key_mismatch", "Cited evidenceIds and sourceFactKeys do not correspond.");
  }

  const derived = deriveAssurance(cited);
  checkProvenanceConfidence(loc, cited, errors);
  checkAssuranceAndMode(loc, derived, errors);
  checkTypeRules(loc, cited, maps, errors);
}

function validateWhatChanged(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (!maps.changeSet.hasPriorState) {
    push("what_changed_without_prior_state", "A 'what changed' item is not allowed without a reliable prior state.");
    return;
  }
  for (const k of item.sourceFactKeys) if (!maps.changeFactKeys.has(k)) push("source_fact_key_not_found", `"${k}" is not part of any ChangeSet change.`);

  const changeIds = [...new Set(item.factBindings.map((b) => b.changeId).filter((c): c is string => !!c))];
  if (changeIds.length === 0) {
    push("what_changed_not_in_changeset", "A 'what changed' item must reference at least one changeId.");
    return;
  }
  const changes: BriefChange[] = [];
  for (const cid of changeIds) {
    const c = maps.changeById.get(cid);
    if (!c) push("change_id_not_found", `changeId "${cid}" does not exist.`);
    else changes.push(c);
  }
  if (changes.length === 0) return;

  const allowedEvidence = new Set(changes.flatMap((c) => [...c.previousEvidenceIds, ...c.currentEvidenceIds]));
  for (const id of item.evidenceIds) if (!allowedEvidence.has(id)) push("change_reference_mismatch", `Evidence "${id}" is not part of the referenced change(s).`);

  const assurances = new Set(changes.map((c) => c.assurance));
  if (assurances.size === 1) {
    const a = [...assurances][0];
    if (item.assurance !== a) {
      if (a === "unresolved") push("unresolved_written_as_certain", "Change is unresolved but the item is more certain.");
      else if (a === "conflicting") push("conflict_unlabeled", "Change is conflicting but the item is not labeled conflicting.");
      else push("assurance_mismatch", `Assurance "${item.assurance}" ≠ change "${a}".`);
    }
    // Text may not strengthen an unresolved/inferred change into a sourced fact.
    if ((a === "unresolved" || a === "inferred") && item.assertionMode === "sourced_fact") {
      push("assertion_mode_invalid", `A ${a} change cannot be asserted as a sourced_fact.`);
    }
  }

  const resolvable = item.evidenceIds.map((id) => maps.evidenceById.get(id)).filter((x): x is EvidenceItem => !!x);
  const allowedProv: Provenance[] = resolvable.length
    ? deriveProvenanceUnion(resolvable)
    : assurances.has("unresolved")
      ? ["open_question"]
      : ["mallin_inference"];
  for (const p of item.provenance) if (!allowedProv.includes(p)) push("provenance_upgraded", `Provenance "${p}" is not supported by the change evidence.`);
  if (item.provenance.includes("customer_stated") && !resolvable.some((r) => r.provenance === "customer_stated")) {
    push("provenance_upgraded", "customer_stated claimed without a customer-stated source.");
  }
  const ceiling = deriveConfidenceCeiling(resolvable);
  if (confidenceRank(item.confidence) > confidenceRank(ceiling)) push("confidence_raised", `Confidence "${item.confidence}" exceeds ceiling "${ceiling}".`);
}

function checkProvenanceConfidence(loc: Located, cited: EvidenceItem[], errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });
  const union = deriveProvenanceUnion(cited);
  if (item.provenance.length === 0) push("provenance_upgraded", "Item has no inherited provenance.");
  for (const p of item.provenance) if (!union.includes(p)) push("provenance_upgraded", `Provenance "${p}" is not present in the supporting evidence.`);
  const ceiling = deriveConfidenceCeiling(cited);
  if (confidenceRank(item.confidence) > confidenceRank(ceiling)) push("confidence_raised", `Confidence "${item.confidence}" exceeds "${ceiling}".`);
}

function checkAssuranceAndMode(loc: Located, derived: ReturnType<typeof deriveAssurance>, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (item.assurance !== derived) {
    if (derived === "unresolved") push("unresolved_written_as_certain", "Evidence is unresolved but the item is more certain.");
    else if (derived === "conflicting") push("conflict_unlabeled", "Evidence conflicts but the item is not labeled conflicting.");
    else push("assurance_mismatch", `Assurance "${item.assurance}" ≠ derived "${derived}".`);
  }
  // Unresolved/conflicting evidence cannot be asserted as a plain sourced fact.
  if ((derived === "unresolved" || derived === "conflicting") && item.assertionMode === "sourced_fact") {
    push("assertion_mode_invalid", `${derived} evidence cannot be a sourced_fact.`);
  }
}

function checkTypeRules(loc: Located, cited: EvidenceItem[], maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const push = (code: ValidationErrorCode, message: string) => errors.push({ code, itemId: item.id, section, message });

  if (item.contentType === "customer_commitment" || item.contentType === "inferred_customer_commitment") {
    // Both require a typed customer-party commitment record in the cited chain.
    const commit = cited.find((c) => c.payload.kind === "commitment" && c.payload.party === "customer");
    if (!commit || commit.payload.kind !== "commitment") {
      push("customer_commitment_not_typed", "Requires a typed customer-party commitment record.");
    } else {
      const supportIds = commit.payload.supportingEvidenceIds ?? [];
      const supportItems: EvidenceItem[] = [];
      for (const sid of supportIds) {
        const s = maps.evidenceById.get(sid);
        if (!s) push("commitment_support_invalid", `Commitment support id "${sid}" does not resolve to a real EvidenceItem.`);
        else if (s.tenantId !== commit.tenantId || s.dealId !== commit.dealId) push("commitment_support_invalid", `Commitment support "${sid}" is from a different tenant/deal.`);
        else supportItems.push(s);
      }
      // Explicit-origin proof: a buyer-stated OR seller-recorded source.
      const qualifying = supportItems.filter((s) => s.provenance === "customer_stated" || s.provenance === "seller_provided");

      if (item.contentType === "customer_commitment") {
        // A CONFIRMED commitment cannot rest on Mallín inference alone: it needs
        // an explicit-origin supporting source that the item also cites (so the
        // source's provenance is inherited).
        if (qualifying.length === 0) {
          push("customer_commitment_unsupported", "A confirmed customer commitment needs explicit buyer-stated or seller-recorded evidence, not Mallín inference alone.");
        } else if (!qualifying.some((q) => item.evidenceIds.includes(q.evidenceId))) {
          push("customer_commitment_unsupported", "The item must cite the explicit-origin supporting evidence so its provenance is inherited.");
        }
      }
    }
  }

  const claim = item.commitmentClaim;
  if (claim && claim.status === "completed") {
    const provenByPacket = cited.some(
      (c) => c.payload.kind === "commitment" && c.sourceFactKey === claim.sourceFactKey && c.payload.state === "done" && !!c.payload.stateEvidence,
    );
    const removed = maps.changeSet.changes.some((c) => c.type === "commitment_removed" && c.sourceFactKeys.includes(claim.sourceFactKey));
    const provenByChange = maps.changeSet.changes.some((c) => c.type === "commitment_completed" && c.assurance === "observed" && c.sourceFactKeys.includes(claim.sourceFactKey));
    if (removed || !(provenByPacket || provenByChange)) {
      push("completed_commitment_without_evidence", `Commitment ${claim.sourceFactKey} claimed completed without explicit completion evidence.`);
    }
  }
}

/** Defense-in-depth: every detected entity in the text must be covered by a
 *  binding value, or by trusted (deterministic) cover metadata. */
function checkEntityCoverage(loc: Located, maps: Maps, errors: ValidationError[]): void {
  const { item, section } = loc;
  const covered = [
    ...item.factBindings.map((b) => b.value),
    maps.cover.dealName,
    maps.cover.preparedFor ?? "",
    maps.cover.classification,
    maps.cover.asOf, // trusted deterministic cover metadata (the generation date)
  ]
    .join(" \n ")
    .toLowerCase();
  for (const e of extractEntities(item.text)) {
    if (!covered.includes(e.toLowerCase())) {
      errors.push({ code: "unbound_fact", itemId: item.id, section, message: `Entity "${e}" in text is not bound to typed evidence.` });
    }
  }
}

function extractEntities(text: string): string[] {
  const out = new Set<string>();
  const res = [
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s+\d{4})?\b/g,
    /\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b/g,
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
  ];
  for (const re of res) for (const m of text.matchAll(re)) out.add(m[0].trim());
  return [...out];
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
  add(draft.actionPlan.inferredCustomerCommitments, "action_plan", false, "inferredCustomerCommitments");
  add(draft.actionPlan.sellerActions, "action_plan", false, "sellerActions");
  add(draft.actionPlan.mallinRecommendations, "action_plan", false, "mallinRecommendations");
  add(draft.actionPlan.unresolvedActions, "action_plan", false, "unresolvedActions");
  add(draft.appendix, "appendix");
  return out;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
