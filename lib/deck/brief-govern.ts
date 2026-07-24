/**
 * brief-govern — deterministic governance derivation.
 *
 * The model authors JUDGMENT (which items, their text, contentType/section, and
 * which evidence to cite); the SYSTEM fills the governance metadata so it matches
 * the deterministic evidence by construction, instead of asking the model to
 * guess it (which it can't do reliably — see binding_value_mismatch /
 * assurance_mismatch). For every packet-backed item this:
 *   - sets sourceFactKeys to the cited evidence's keys (evidence_key_mismatch),
 *   - sets provenance / confidence / assurance from the SAME derive* helpers the
 *     validator uses (provenance_upgraded / confidence_raised / assurance_mismatch),
 *   - corrects each factBinding's value to the exact typed value, remapping an
 *     invalid fieldPath to the payload's primary field and dropping bindings that
 *     still don't resolve (binding_value_mismatch / binding_evidence_mismatch),
 *   - aligns assertionMode with contentType + derived assurance.
 * whatChanged items are dropped when there is no reliable prior state (they can
 * never validate then). Items with no resolvable cited evidence are left as-is
 * for the constrained repair.
 */

import {
  deriveAssurance,
  deriveConfidenceCeiling,
  deriveProvenanceUnion,
  selectTypedValue,
  type ActionPlan,
  type AssertionMode,
  type BriefContentItem,
  type BriefDraft,
  type FactBinding,
} from "@/lib/deck/brief-model";
import type { EvidenceItem, EvidencePacket } from "@/lib/deck/brief-evidence";
import type { ChangeSet } from "@/lib/deck/brief-change-detection";

// Typed fields readable per payload kind (mirrors selectTypedValue in
// brief-model). deriveGovernance scans these for values the item's text
// references, and binds exactly those — guaranteeing entity coverage with
// correct typed values, without the model having to pick fieldPaths.
const READABLE_FIELDS: Record<string, string[]> = {
  opportunity_value: ["value", "field"],
  next_action: ["value", "origin"],
  transcript_statement: ["transcriptId", "segmentId", "side", "text"],
  intel_fact: ["value", "factKey"],
  stakeholder: ["value", "aspect", "stakeholderId", "name"],
  risk: ["severity", "title", "riskId"],
  commitment: ["state", "label", "expectedBy", "commitmentId", "party", "owner"],
  deal_posture: ["posture"],
  open_question: ["topic"],
};

const MAX_BINDINGS = 8;
// The "primary" typed field per payload kind — used to recover when the model
// picks a fieldPath that doesn't resolve for that payload.
const PRIMARY_FIELD: Record<string, string> = {
  opportunity_value: "value", next_action: "value", intel_fact: "value", stakeholder: "value",
  risk: "title", commitment: "label", deal_posture: "posture", open_question: "topic", transcript_statement: "text",
};

/** True when the cited chain contains a typed customer-party commitment record. */
function hasTypedCustomerCommitment(cited: EvidenceItem[]): boolean {
  return cited.some((c) => c.payload.kind === "commitment" && (c.payload as { party?: string }).party === "customer");
}

/** Correct a model binding to its cited evidence — fix value/keys, remap an
 *  invalid fieldPath to the payload's primary field, or drop if unresolvable. */
function fixBinding(b: FactBinding, ev: EvidenceItem): FactBinding | null {
  let fieldPath = b.fieldPath;
  let value = selectTypedValue(ev.payload, fieldPath);
  if (value === undefined) {
    const primary = PRIMARY_FIELD[ev.payload.kind];
    const v = primary ? selectTypedValue(ev.payload, primary) : undefined;
    if (v === undefined) return null;
    fieldPath = primary;
    value = v;
  }
  return { evidenceId: ev.evidenceId, sourceFactKey: ev.sourceFactKey, payloadKind: ev.payload.kind, fieldPath, value, ...(b.entityId ? { entityId: b.entityId } : {}), ...(b.changeId ? { changeId: b.changeId } : {}) };
}

// The same entity shapes the validator's checkEntityCoverage flags — dates,
// $amounts, and Multi-Word Capitalized names.
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

function governItem(item: BriefContentItem, byId: Map<string, EvidenceItem>, allEvidence: EvidenceItem[]): BriefContentItem | null {
  if (item.contentType === "decorative") return item; // exempt from evidence checks

  const evidenceIds = new Set(item.evidenceIds.filter((id) => byId.has(id)));
  if (evidenceIds.size === 0) return item; // nothing to derive from — leave for repair

  const factBindings: FactBinding[] = [];
  const boundValues = new Set<string>();
  const addBinding = (ev: EvidenceItem, fieldPath: string, value: string, base?: FactBinding) => {
    factBindings.push({ evidenceId: ev.evidenceId, sourceFactKey: ev.sourceFactKey, payloadKind: ev.payload.kind, fieldPath, value, ...(base?.entityId ? { entityId: base.entityId } : {}), ...(base?.changeId ? { changeId: base.changeId } : {}) });
    boundValues.add(value);
    evidenceIds.add(ev.evidenceId);
  };

  // 1. Keep + FIX the model's cited bindings (idempotent on a valid draft).
  for (const b of item.factBindings) {
    const ev = byId.get(b.evidenceId);
    if (!ev || !evidenceIds.has(b.evidenceId)) continue;
    const fixed = fixBinding(b, ev);
    if (fixed && !boundValues.has(fixed.value)) addBinding(ev, fixed.fieldPath, fixed.value, b);
  }
  // 2. Bind any CITED-evidence value that appears in the text but isn't bound yet.
  const textLower = item.text.toLowerCase();
  for (const ev of [...evidenceIds].map((id) => byId.get(id)!).filter(Boolean)) {
    for (const fp of READABLE_FIELDS[ev.payload.kind] ?? []) {
      if (factBindings.length >= MAX_BINDINGS) break;
      const v = selectTypedValue(ev.payload, fp);
      if (v === undefined || boundValues.has(v)) continue;
      if (textLower.includes(v.toLowerCase())) addBinding(ev, fp, v);
    }
  }
  // 3. Cover any remaining text ENTITY from ANYWHERE in the packet — bind it and
  //    add the backing citation (keeps names/dates evidence-backed).
  const covered = (e: string) => [...boundValues].some((v) => v.toLowerCase().includes(e.toLowerCase()));
  for (const entity of extractEntities(item.text)) {
    if (factBindings.length >= MAX_BINDINGS || covered(entity)) continue;
    for (const ev of allEvidence) {
      let done = false;
      for (const fp of READABLE_FIELDS[ev.payload.kind] ?? []) {
        const v = selectTypedValue(ev.payload, fp);
        if (v && v.toLowerCase().includes(entity.toLowerCase())) { addBinding(ev, fp, v); done = true; break; }
      }
      if (done) break;
    }
  }

  const cited = [...evidenceIds].map((id) => byId.get(id)!).filter(Boolean);

  // A (inferred) customer commitment with no typed customer-party commitment in
  // its cited chain can never satisfy the type rule — drop it rather than fail.
  if ((item.contentType === "customer_commitment" || item.contentType === "inferred_customer_commitment") && !hasTypedCustomerCommitment(cited)) {
    return null;
  }

  const assurance = deriveAssurance(cited);
  let assertionMode: AssertionMode = item.assertionMode;
  if (item.contentType === "mallin_recommendation") assertionMode = "mallin_recommendation";
  else if (assurance === "unresolved" || assurance === "conflicting") assertionMode = "unresolved";
  else if (item.contentType === "inferred_customer_commitment") assertionMode = "supported_synthesis";
  else if (assertionMode === "mallin_recommendation") assertionMode = "sourced_fact"; // only recs use rec mode
  if (assertionMode === "sourced_fact" && factBindings.length === 0) assertionMode = "supported_synthesis";

  return {
    ...item,
    evidenceIds: [...evidenceIds],
    sourceFactKeys: [...new Set(cited.map((c) => c.sourceFactKey))],
    provenance: deriveProvenanceUnion(cited),
    confidence: deriveConfidenceCeiling(cited),
    assurance,
    assertionMode,
    factBindings,
  };
}

/** Deterministically fill governance metadata across the whole draft. Pure. */
export function deriveGovernance(draft: BriefDraft, packet: EvidencePacket, changeSet: ChangeSet): BriefDraft {
  const byId = new Map(packet.items.map((i) => [i.evidenceId, i]));
  const gov = (arr: BriefContentItem[]): BriefContentItem[] => arr.map((i) => governItem(i, byId, packet.items)).filter((i): i is BriefContentItem => i !== null);
  const ap: ActionPlan = {
    customerCommitments: gov(draft.actionPlan.customerCommitments),
    inferredCustomerCommitments: gov(draft.actionPlan.inferredCustomerCommitments),
    sellerActions: gov(draft.actionPlan.sellerActions),
    mallinRecommendations: gov(draft.actionPlan.mallinRecommendations),
    unresolvedActions: gov(draft.actionPlan.unresolvedActions),
  };
  return {
    executiveSummary: gov(draft.executiveSummary),
    // whatChanged can never validate without a reliable prior state — drop it.
    whatChanged: changeSet.hasPriorState ? gov(draft.whatChanged) : [],
    customerPriorities: gov(draft.customerPriorities),
    stakeholders: gov(draft.stakeholders),
    decisionProcess: gov(draft.decisionProcess),
    risks: gov(draft.risks),
    actionPlan: ap,
    appendix: gov(draft.appendix),
  };
}
