/**
 * brief-agent — turns the deterministic EvidencePacket + ChangeSet into a
 * validated internal executive brief (Commit 2).
 *
 * The MODEL call is injected (`BriefModelClient`) so automated tests mock the
 * structured response — this module never imports an SDK and never performs a
 * live call. Flow:
 *   1. build a model-facing input (allowed evidence + changes + budgets + rules)
 *   2. call the client → BriefDraft
 *   3. validate deterministically (brief-validator)
 *   4. on failure, ONE constrained repair using only the errors + evidence
 *   5. validate the repair from scratch; if it still fails, STOP (fail closed)
 *   6. on success, assemble with budgets (supported overflow → appendix)
 *
 * A partially-trusted brief is never returned.
 */

import { comparableValue, type EvidencePacket } from "@/lib/deck/brief-evidence";
import type { ChangeSet, OrderingDiagnostic } from "@/lib/deck/brief-change-detection";
import {
  assembleBrief,
  DEFAULT_BUDGETS,
  type BriefBudgets,
  type BriefDraft,
  type CoverMetadata,
  type ExecutiveBrief,
} from "@/lib/deck/brief-model";
import { validateBriefDraft, type ValidationError, type ValidationResult } from "@/lib/deck/brief-validator";

export interface BriefRequest {
  packet: EvidencePacket;
  changeSet: ChangeSet;
  /** Trusted deterministic cover metadata from the opportunity record. */
  cover: { dealName: string; preparedFor?: string; asOf: string; classification?: string };
  budgets?: Partial<BriefBudgets>;
}

/** Compact, model-facing view of the ONLY facts the model may use. */
export interface BriefAgentInput {
  cover: CoverMetadata;
  evidence: Array<{
    evidenceId: string;
    sourceFactKey: string;
    logicalKey: string;
    payloadKind: string;
    provenance: string;
    confidence: string;
    claim: string;
  }>;
  changes: Array<{
    type: string;
    logicalKey: string;
    sourceFactKeys: string[];
    previousValue: string | null;
    currentValue: string | null;
    previousEvidenceIds: string[];
    currentEvidenceIds: string[];
    assurance: string;
    effectiveDate: string | null;
  }>;
  hasPriorState: boolean;
  ordering: OrderingDiagnostic;
  nextAction: "confirmed" | "conflicting" | "not_confirmed";
  budgets: BriefBudgets;
  rules: string[];
}

export interface RepairContext {
  previousDraft: BriefDraft;
  errors: ValidationError[];
}

export type BriefModelClient = (input: BriefAgentInput, repair?: RepairContext) => Promise<BriefDraft>;

export type GenerateResult =
  | { ok: true; brief: ExecutiveBrief; validation: ValidationResult; movedToAppendix: string[]; attempts: number }
  | { ok: false; errors: ValidationError[]; attempts: number; rejectedDraft: BriefDraft };

const RULES: string[] = [
  "Use ONLY the provided evidence and changes. Never invent facts, dates, amounts, people, roles, commitments, competitors, or outcomes.",
  "Every factual content item must cite evidenceIds and the corresponding sourceFactKeys.",
  "Inherit provenance from the cited evidence; never flatten to customer_stated; never add a provenance the evidence does not have.",
  "Confidence must be no higher than the lowest cited evidence's confidence.",
  "Mark an item conflicting when its evidence conflicts and unresolved when support is missing/ambiguous; never present these as certain.",
  "A 'what changed' item must correspond to a deterministic ChangeSet change; omit the section entirely when there is no reliable prior state.",
  "A removed commitment is NOT completed. Only claim a commitment completed with explicit completion evidence.",
  "When the next action is Not confirmed or conflicting, do not present a confirmed next action; use an unresolved action or a labeled mallin_recommendation.",
  "Recommendations must be labeled mallin_recommendation, cite the evidence explaining why, and are never customer commitments.",
];

export function buildCover(request: BriefRequest): CoverMetadata {
  return {
    dealName: request.cover.dealName,
    preparedFor: request.cover.preparedFor,
    asOf: request.cover.asOf,
    classification: request.cover.classification ?? "INTERNAL & CONFIDENTIAL",
    tenantId: request.packet.tenantId,
    dealId: request.packet.dealId,
    snapshotId: request.packet.snapshotId,
  };
}

export function buildBriefAgentInput(request: BriefRequest, cover: CoverMetadata, budgets: BriefBudgets): BriefAgentInput {
  const na = describeNextAction(request.packet);
  return {
    cover,
    evidence: request.packet.items.map((i) => ({
      evidenceId: i.evidenceId,
      sourceFactKey: i.sourceFactKey,
      logicalKey: i.logicalKey,
      payloadKind: i.payload.kind,
      provenance: i.provenance,
      confidence: i.confidence,
      claim: i.claim,
    })),
    changes: request.changeSet.changes.map((c) => ({
      type: c.type,
      logicalKey: c.logicalKey,
      sourceFactKeys: c.sourceFactKeys,
      previousValue: c.previousValue,
      currentValue: c.currentValue,
      previousEvidenceIds: c.previousEvidenceIds,
      currentEvidenceIds: c.currentEvidenceIds,
      assurance: c.assurance,
      effectiveDate: c.effectiveDate,
    })),
    hasPriorState: request.changeSet.hasPriorState,
    ordering: request.changeSet.ordering,
    nextAction: na,
    budgets,
    rules: RULES,
  };
}

export function buildBriefPrompt(input: BriefAgentInput, repair?: RepairContext): { system: string; user: string } {
  const system = [
    "You produce an INTERNAL executive deal brief as STRUCTURED JSON (a BriefDraft), never free-form prose.",
    "Sections: executiveSummary, whatChanged, customerPriorities, stakeholders, decisionProcess, risks, actionPlan{customerCommitments,sellerActions,mallinRecommendations,unresolvedActions}, appendix.",
    "Each content item: {id, contentType, text, section, evidenceIds, sourceFactKeys, provenance[], confidence, assurance, appendixEligible, commitmentClaim?, nextActionClaim?}.",
    "RULES:",
    ...input.rules.map((r, n) => `${n + 1}. ${r}`),
  ].join("\n");

  const user = [
    `COVER: ${JSON.stringify(input.cover)}`,
    `NEXT_ACTION_STATE: ${input.nextAction}`,
    `ORDERING: ${JSON.stringify(input.ordering)} hasPriorState=${input.hasPriorState}`,
    `BUDGETS: ${JSON.stringify(input.budgets)}`,
    `EVIDENCE:\n${JSON.stringify(input.evidence, null, 2)}`,
    `CHANGES:\n${JSON.stringify(input.changes, null, 2)}`,
    repair
      ? `\nYOUR PREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these errors using only the evidence above:\n${JSON.stringify(repair.errors, null, 2)}`
      : "",
  ].join("\n\n");

  return { system, user };
}

export async function generateExecutiveBrief(request: BriefRequest, client: BriefModelClient): Promise<GenerateResult> {
  const cover = buildCover(request);
  const budgets: BriefBudgets = { ...DEFAULT_BUDGETS, ...request.budgets };
  const input = buildBriefAgentInput(request, cover, budgets);
  const ctx = { packet: request.packet, changeSet: request.changeSet, cover };

  let draft = await client(input);
  let result = validateBriefDraft(draft, ctx);
  let attempts = 1;

  if (!result.valid) {
    // Exactly one constrained repair attempt.
    draft = await client(input, { previousDraft: draft, errors: result.errors });
    attempts = 2;
    result = validateBriefDraft(draft, ctx); // validate from scratch
    if (!result.valid) {
      return { ok: false, attempts, errors: result.errors, rejectedDraft: draft };
    }
  }

  const { brief, movedToAppendix } = assembleBrief(draft, cover, budgets);
  return { ok: true, attempts, brief, validation: result, movedToAppendix };
}

/** Wrap a raw text-completion function as a BriefModelClient. The future route
 *  supplies `callModel`; no SDK is imported here. */
export function createJsonBriefClient(callModel: (system: string, user: string) => Promise<string>): BriefModelClient {
  return async (input, repair) => {
    const { system, user } = buildBriefPrompt(input, repair);
    return parseBriefDraft(await callModel(system, user));
  };
}

export function parseBriefDraft(raw: string): BriefDraft {
  const j = JSON.parse(raw) as Partial<BriefDraft>;
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  return {
    executiveSummary: arr(j.executiveSummary),
    whatChanged: arr(j.whatChanged),
    customerPriorities: arr(j.customerPriorities),
    stakeholders: arr(j.stakeholders),
    decisionProcess: arr(j.decisionProcess),
    risks: arr(j.risks),
    actionPlan: {
      customerCommitments: arr(j.actionPlan?.customerCommitments),
      sellerActions: arr(j.actionPlan?.sellerActions),
      mallinRecommendations: arr(j.actionPlan?.mallinRecommendations),
      unresolvedActions: arr(j.actionPlan?.unresolvedActions),
    },
    appendix: arr(j.appendix),
  } as BriefDraft;
}

function describeNextAction(packet: EvidencePacket): "confirmed" | "conflicting" | "not_confirmed" {
  const items = packet.items.filter((i) => i.logicalKey === "deal:nextAction");
  if (items.some((i) => i.provenance === "open_question")) return "not_confirmed";
  const values = new Set(items.filter((i) => i.provenance !== "open_question").map((i) => comparableValue(i.payload)));
  return values.size > 1 ? "conflicting" : "confirmed";
}
