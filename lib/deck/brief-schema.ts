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

const contentItemSchema = z.strictObject({
  id: z.string().min(1),
  contentType: contentTypeSchema,
  text: z.string().min(1),
  section: sectionSchema,
  assertionMode: assertionModeSchema,
  evidenceIds: z.array(evidenceIdSchema).max(64),
  sourceFactKeys: z.array(sourceFactKeySchema).max(64),
  factBindings: z.array(factBindingSchema).max(64),
  provenance: z.array(provenanceSchema).max(5),
  confidence: confidenceSchema,
  assurance: assuranceSchema,
  appendixEligible: z.boolean(),
  commitmentClaim: commitmentClaimSchema.optional(),
  nextActionClaim: z.boolean().optional(),
});

// Structural guardrail caps (NOT display budgets — overflow → appendix later).
const SECTION_CAP = 40;
const APPENDIX_CAP = 300;

const actionPlanSchema = z.strictObject({
  customerCommitments: z.array(contentItemSchema).max(SECTION_CAP),
  sellerActions: z.array(contentItemSchema).max(SECTION_CAP),
  mallinRecommendations: z.array(contentItemSchema).max(SECTION_CAP),
  unresolvedActions: z.array(contentItemSchema).max(SECTION_CAP),
});

export const BriefDraftSchema = z
  .strictObject({
    executiveSummary: z.array(contentItemSchema).max(SECTION_CAP),
    whatChanged: z.array(contentItemSchema).max(SECTION_CAP),
    customerPriorities: z.array(contentItemSchema).max(SECTION_CAP),
    stakeholders: z.array(contentItemSchema).max(SECTION_CAP),
    decisionProcess: z.array(contentItemSchema).max(SECTION_CAP),
    risks: z.array(contentItemSchema).max(SECTION_CAP),
    actionPlan: actionPlanSchema,
    appendix: z.array(contentItemSchema).max(APPENDIX_CAP),
  })
  .superRefine((draft, ctx) => {
    const ids: string[] = [];
    for (const key of ["executiveSummary", "whatChanged", "customerPriorities", "stakeholders", "decisionProcess", "risks", "appendix"] as const) {
      for (const item of draft[key]) ids.push(item.id);
    }
    for (const bucket of ["customerCommitments", "sellerActions", "mallinRecommendations", "unresolvedActions"] as const) {
      for (const item of draft.actionPlan[bucket]) ids.push(item.id);
    }
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate content id "${id}".` });
      seen.add(id);
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
