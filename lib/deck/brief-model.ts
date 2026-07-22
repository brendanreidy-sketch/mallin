/**
 * brief-model — the structured internal executive deal-brief content model
 * (Commit 2). Pure types + deterministic derivation/assembly helpers. No LLM,
 * no rendering, no I/O.
 *
 * The model NEVER assigns provenance or confidence independently: every factual
 * content item INHERITS provenance/confidence/assurance from the deterministic
 * EvidencePacket / ChangeSet it cites (see the derive* helpers, which the
 * validator uses as the source of truth). Recommendations are always labeled
 * `mallin_recommendation` and are never customer commitments or sourced facts.
 */

import { comparableValue, type EvidenceConfidence, type EvidenceItem, type Provenance } from "@/lib/deck/brief-evidence";

export type BriefAssurance = "observed" | "inferred" | "conflicting" | "unresolved";

export type BriefSection =
  | "cover"
  | "executive_summary"
  | "what_changed"
  | "priorities"
  | "stakeholders"
  | "decision_process"
  | "risks"
  | "action_plan"
  | "appendix";

export type BriefContentType =
  | "executive_conclusion"
  | "what_changed"
  | "customer_priority"
  | "stakeholder_assessment"
  | "decision_process"
  | "risk"
  | "customer_commitment"
  | "seller_action"
  | "mallin_recommendation"
  | "unresolved_action"
  | "headline"
  | "decorative";

/** Types whose text asserts a factual conclusion → require ≥1 evidence id.
 *  Only "decorative" (labels like INTERNAL & CONFIDENTIAL) is exempt. */
export const FACTUAL_CONTENT_TYPES: ReadonlySet<BriefContentType> = new Set<BriefContentType>([
  "executive_conclusion",
  "what_changed",
  "customer_priority",
  "stakeholder_assessment",
  "decision_process",
  "risk",
  "customer_commitment",
  "seller_action",
  "mallin_recommendation",
  "unresolved_action",
  "headline",
]);

/** A commitment status a content item may assert — the validator holds it to
 *  the deterministic evidence (e.g. "completed" needs explicit proof). */
export interface CommitmentClaim {
  sourceFactKey: string;
  status: "completed" | "missed" | "open" | "removed";
}

export interface BriefContentItem {
  /** Unique content-item id (author-assigned; validator enforces uniqueness). */
  id: string;
  contentType: BriefContentType;
  /** Concise rendered text. Display only; never the basis for provenance. */
  text: string;
  section: BriefSection;
  evidenceIds: string[];
  sourceFactKeys: string[];
  /** Inherited from the cited evidence — never assigned independently. */
  provenance: Provenance[];
  /** Inherited; no higher than the lowest material supporting evidence. */
  confidence: EvidenceConfidence;
  assurance: BriefAssurance;
  appendixEligible: boolean;
  /** Set when the item asserts a commitment's status (validated vs evidence). */
  commitmentClaim?: CommitmentClaim;
  /** Set when the item presents THE deal next action (validated vs evidence). */
  nextActionClaim?: boolean;
}

export interface CoverMetadata {
  /** Trusted deterministic metadata from the opportunity record — NOT a model
   *  claim, so not subject to per-item evidence checks. */
  dealName: string;
  preparedFor?: string;
  asOf: string;
  classification: string;
  tenantId: string;
  dealId: string;
  snapshotId: string;
}

export interface ActionPlan {
  customerCommitments: BriefContentItem[];
  sellerActions: BriefContentItem[];
  mallinRecommendations: BriefContentItem[];
  unresolvedActions: BriefContentItem[];
}

export interface ExecutiveBrief {
  cover: CoverMetadata;
  executiveSummary: BriefContentItem[];
  /** Omitted entirely when there is no reliable prior state / no material change. */
  whatChanged?: BriefContentItem[];
  customerPriorities: BriefContentItem[];
  stakeholders: BriefContentItem[];
  decisionProcess: BriefContentItem[];
  risks: BriefContentItem[];
  actionPlan: ActionPlan;
  appendix: BriefContentItem[];
}

/** The model's pre-validation output — same item shape, grouped by section. */
export interface BriefDraft {
  executiveSummary: BriefContentItem[];
  whatChanged: BriefContentItem[];
  customerPriorities: BriefContentItem[];
  stakeholders: BriefContentItem[];
  decisionProcess: BriefContentItem[];
  risks: BriefContentItem[];
  actionPlan: ActionPlan;
  appendix: BriefContentItem[];
}

export interface BriefBudgets {
  executiveSummary: number;
  whatChanged: number;
  priorities: number;
  stakeholders: number;
  decisionProcess: number;
  risks: number;
  actions: number; // total across the four action buckets
}

export const DEFAULT_BUDGETS: BriefBudgets = {
  executiveSummary: 4,
  whatChanged: 5,
  priorities: 4,
  stakeholders: 6,
  decisionProcess: 6,
  risks: 5,
  actions: 6,
};

// ── Deterministic inheritance helpers (the validator's source of truth) ─────

const CONF_RANK: Record<EvidenceConfidence, number> = { none: 0, low: 1, medium: 2, high: 3 };

export function confidenceRank(c: EvidenceConfidence): number {
  return CONF_RANK[c];
}

/** Ceiling = the LOWEST material supporting confidence (never higher). */
export function deriveConfidenceCeiling(items: EvidenceItem[]): EvidenceConfidence {
  if (items.length === 0) return "none";
  return items.reduce<EvidenceConfidence>(
    (lo, i) => (CONF_RANK[i.confidence] < CONF_RANK[lo] ? i.confidence : lo),
    "high",
  );
}

/** Union of the supporting evidence's provenances — preserved, never flattened. */
export function deriveProvenanceUnion(items: EvidenceItem[]): Provenance[] {
  return [...new Set(items.map((i) => i.provenance))].sort();
}

/** Conservative assurance from the supporting evidence:
 *  conflicting > unresolved > inferred > observed (most cautious wins). */
export function deriveAssurance(items: EvidenceItem[]): BriefAssurance {
  if (items.length === 0) return "unresolved";
  // Conflict: two cited items share a logical key but differ in value.
  const byKey = new Map<string, Set<string>>();
  for (const i of items) {
    const set = byKey.get(i.logicalKey) ?? new Set<string>();
    set.add(comparableValue(i.payload));
    byKey.set(i.logicalKey, set);
  }
  if ([...byKey.values()].some((s) => s.size > 1)) return "conflicting";
  const provs = items.map((i) => i.provenance);
  if (provs.includes("open_question")) return "unresolved";
  if (provs.some((p) => p === "mallin_inference")) return "inferred";
  return "observed";
}

// ── Deterministic assembly (budgets → supported overflow to appendix) ───────

export interface AssembledBrief {
  brief: ExecutiveBrief;
  movedToAppendix: string[];
}

export function assembleBrief(
  draft: BriefDraft,
  cover: CoverMetadata,
  budgets: BriefBudgets = DEFAULT_BUDGETS,
): AssembledBrief {
  const moved: string[] = [];
  const overflow: BriefContentItem[] = [];

  const cap = (items: BriefContentItem[], max: number): BriefContentItem[] => {
    const kept = items.slice(0, max);
    for (const extra of items.slice(max)) {
      overflow.push({ ...extra, section: "appendix" });
      moved.push(extra.id);
    }
    return kept;
  };

  const executiveSummary = cap(draft.executiveSummary, budgets.executiveSummary);
  const whatChangedKept = cap(draft.whatChanged, budgets.whatChanged);
  const customerPriorities = cap(draft.customerPriorities, budgets.priorities);
  const stakeholders = cap(draft.stakeholders, budgets.stakeholders);
  const decisionProcess = cap(draft.decisionProcess, budgets.decisionProcess);
  const risks = cap(draft.risks, budgets.risks);

  // Action plan: cap the TOTAL across buckets, trimming least-critical last.
  const actionPlan = capActionPlan(draft.actionPlan, budgets.actions, overflow, moved);

  const appendix = [...draft.appendix, ...overflow];

  const brief: ExecutiveBrief = {
    cover,
    executiveSummary,
    ...(whatChangedKept.length ? { whatChanged: whatChangedKept } : {}),
    customerPriorities,
    stakeholders,
    decisionProcess,
    risks,
    actionPlan,
    appendix,
  };
  return { brief, movedToAppendix: moved };
}

function capActionPlan(
  plan: ActionPlan,
  max: number,
  overflow: BriefContentItem[],
  moved: string[],
): ActionPlan {
  // Keep in priority order; once the total budget is spent, the rest overflow.
  const order: Array<keyof ActionPlan> = [
    "customerCommitments",
    "sellerActions",
    "mallinRecommendations",
    "unresolvedActions",
  ];
  let remaining = max;
  const out: ActionPlan = { customerCommitments: [], sellerActions: [], mallinRecommendations: [], unresolvedActions: [] };
  for (const bucket of order) {
    for (const item of plan[bucket]) {
      if (remaining > 0) {
        out[bucket].push(item);
        remaining--;
      } else {
        overflow.push({ ...item, section: "appendix" });
        moved.push(item.id);
      }
    }
  }
  return out;
}
