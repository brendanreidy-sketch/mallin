/**
 * brief-schema — strict RUNTIME schema for the untrusted model response
 * (Commit 2A). TypeScript interfaces do not constrain runtime JSON, so every
 * model response (initial AND repair) is parsed through this before any
 * semantic validation.
 *
 * The schema rejects: unknown fields (strictObject everywhere), missing
 * required fields, bad enums, malformed id formats, over-large arrays
 * (structural guardrail — the DISPLAY budgets are applied later by the
 * assembler, which routes supported overflow to the appendix), unexpected
 * nested objects, and duplicate content ids.
 */

import { z } from "zod";

const evidenceIdSchema = z.string().regex(/^ev:/, "evidenceId must start with 'ev:'");
const sourceFactKeySchema = z.string().regex(/^sf:/, "sourceFactKey must start with 'sf:'");
const changeIdSchema = z.string().regex(/^chg:/, "changeId must start with 'chg:'");

const provenanceSchema = z.enum([
  "customer_stated",
  "seller_provided",
  "system_recorded",
  "mallin_inference",
  "open_question",
]);
const confidenceSchema = z.enum(["high", "medium", "low", "none"]);
const assuranceSchema = z.enum(["observed", "inferred", "conflicting", "unresolved"]);
const assertionModeSchema = z.enum(["sourced_fact", "supported_synthesis", "mallin_recommendation", "unresolved"]);
const sectionSchema = z.enum([
  "cover",
  "executive_summary",
  "what_changed",
  "priorities",
  "stakeholders",
  "decision_process",
  "risks",
  "action_plan",
  "appendix",
]);
const contentTypeSchema = z.enum([
  "executive_conclusion",
  "what_changed",
  "customer_priority",
  "stakeholder_assessment",
  "decision_process",
  "risk",
  "customer_commitment",
  "inferred_customer_commitment",
  "seller_action",
  "mallin_recommendation",
  "unresolved_action",
  "headline",
  "decorative",
]);
const payloadKindSchema = z.enum([
  "opportunity_value",
  "next_action",
  "transcript_statement",
  "intel_fact",
  "stakeholder",
  "risk",
  "commitment",
  "deal_posture",
  "open_question",
]);

const factBindingSchema = z
  .strictObject({
    evidenceId: evidenceIdSchema,
    sourceFactKey: sourceFactKeySchema,
    payloadKind: payloadKindSchema,
    fieldPath: z.string().min(1),
    value: z.string(),
    entityId: z.string().optional(),
    changeId: changeIdSchema.optional(),
  });

const commitmentClaimSchema = z.strictObject({
  sourceFactKey: sourceFactKeySchema,
  status: z.enum(["completed", "missed", "open", "removed"]),
});

// Executive-deck HARD LIMITS — enforced structurally so the model cannot
// over-produce. These keep model output well under the token ceiling and yield
// a concise 7–9 slide deck with NO appendix. validateBriefDraft runs this schema
// first (parseBriefDraftStrict), so any violation surfaces as "schema_invalid".
export const BRIEF_CAPS = {
  executiveSummary: 4,
  whatChanged: 3,
  customerPriorities: 4,
  stakeholders: 5,
  decisionProcess: 4,
  risks: 4,
  actionBucket: 3, // max per single action bucket
  actionTotal: 8, // max across all five action buckets combined
  appendix: 0, // no appendix in the executive deck
  // Per-item caps: a tolerance band above the (tight) prompt targets. Sized so a
  // concise item can bind EVERY concrete value it states (avoids unbound_fact)
  // and run 1–2 sentences, without inviting runaway output — section counts stay
  // tight, so total tokens remain bounded well under the 16k ceiling.
  itemText: 400,
  // evidenceIds / sourceFactKeys / factBindings / provenance are finalized by
  // deriveGovernance (it adds evidence-backed coverage bindings + citations and
  // derives the provenance union), so these are coverage ceilings, not
  // model-output budgets. The prompt still asks the model for few (≤3).
  evidenceIds: 8,
  sourceFactKeys: 8,
  factBindings: 8,
  provenance: 5,
} as const;

const contentItemSchema = z.strictObject({
  id: z.string().min(1),
  contentType: contentTypeSchema,
  text: z.string().min(1).max(BRIEF_CAPS.itemText),
  section: sectionSchema,
  assertionMode: assertionModeSchema,
  evidenceIds: z.array(evidenceIdSchema).max(BRIEF_CAPS.evidenceIds),
  sourceFactKeys: z.array(sourceFactKeySchema).max(BRIEF_CAPS.sourceFactKeys),
  factBindings: z.array(factBindingSchema).max(BRIEF_CAPS.factBindings),
  provenance: z.array(provenanceSchema).max(BRIEF_CAPS.provenance),
  confidence: confidenceSchema,
  assurance: assuranceSchema,
  appendixEligible: z.boolean(),
  commitmentClaim: commitmentClaimSchema.optional(),
  nextActionClaim: z.boolean().optional(),
});

const actionPlanSchema = z.strictObject({
  customerCommitments: z.array(contentItemSchema).max(BRIEF_CAPS.actionBucket),
  inferredCustomerCommitments: z.array(contentItemSchema).max(BRIEF_CAPS.actionBucket),
  sellerActions: z.array(contentItemSchema).max(BRIEF_CAPS.actionBucket),
  mallinRecommendations: z.array(contentItemSchema).max(BRIEF_CAPS.actionBucket),
  unresolvedActions: z.array(contentItemSchema).max(BRIEF_CAPS.actionBucket),
});

const ACTION_BUCKETS = ["customerCommitments", "inferredCustomerCommitments", "sellerActions", "mallinRecommendations", "unresolvedActions"] as const;

export const BriefDraftSchema = z
  .strictObject({
    executiveSummary: z.array(contentItemSchema).max(BRIEF_CAPS.executiveSummary),
    whatChanged: z.array(contentItemSchema).max(BRIEF_CAPS.whatChanged),
    customerPriorities: z.array(contentItemSchema).max(BRIEF_CAPS.customerPriorities),
    stakeholders: z.array(contentItemSchema).max(BRIEF_CAPS.stakeholders),
    decisionProcess: z.array(contentItemSchema).max(BRIEF_CAPS.decisionProcess),
    risks: z.array(contentItemSchema).max(BRIEF_CAPS.risks),
    actionPlan: actionPlanSchema,
    appendix: z.array(contentItemSchema).max(BRIEF_CAPS.appendix),
  })
  .superRefine((draft, ctx) => {
    const ids: string[] = [];
    for (const key of ["executiveSummary", "whatChanged", "customerPriorities", "stakeholders", "decisionProcess", "risks", "appendix"] as const) {
      for (const item of draft[key]) ids.push(item.id);
    }
    for (const bucket of ACTION_BUCKETS) {
      for (const item of draft.actionPlan[bucket]) ids.push(item.id);
    }
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate content id "${id}".` });
      seen.add(id);
    }
    // Combined action-plan budget across ALL buckets (per-bucket cap is above).
    const actionTotal = ACTION_BUCKETS.reduce((n, b) => n + draft.actionPlan[b].length, 0);
    if (actionTotal > BRIEF_CAPS.actionTotal) {
      ctx.addIssue({ code: "custom", message: `actionPlan has ${actionTotal} items; the executive deck allows at most ${BRIEF_CAPS.actionTotal} across all buckets.` });
    }
  });

export interface SchemaError {
  path: string;
  message: string;
}

/** Parse untrusted input through the strict schema. */
export function parseBriefDraftStrict(
  input: unknown,
): { ok: true; draft: z.infer<typeof BriefDraftSchema> } | { ok: false; errors: SchemaError[] } {
  const r = BriefDraftSchema.safeParse(input);
  if (r.success) return { ok: true, draft: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
