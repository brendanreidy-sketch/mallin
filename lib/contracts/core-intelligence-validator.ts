import { z } from 'zod';

const SourceRefSchema = z.object({
  system: z.enum([
    'salesforce', 'hubspot', 'gong', 'chorus', 'fireflies',
    'google_meet', 'gmail', 'outlook', 'google_calendar',
    'outlook_calendar', 'linkedin', 'sec_edgar', 'crunchbase',
    'news', 'internal', 'manual',
  ]),
  external_id: z.string(),
  object_type: z.string().optional(),
  url: z.string().optional(),
  fetched_at: z.string().optional(),
});

const SupportingIntelligenceSchema = z.object({
  id: z.string(),
  source_channel: z.enum(['call', 'crm', 'email', 'calendar', 'external']),
  derivation: z.enum(['observed', 'inferred']),
  summary: z.string(),
  // Model occasionally emits explicit `null` for quote on crm/inferred items
  // where the prompt asks to omit. Accept both shapes — `null` == absent.
  quote: z.string().nullable().optional(),
  strength: z.enum(['strong', 'moderate', 'weak']).nullable().optional(),
  source_ref: SourceRefSchema.nullable().optional(),
  source_span: z.object({
    call_id: z.string().nullable().optional(),
    email_id: z.string().nullable().optional(),
    activity_id: z.string().nullable().optional(),
    start_ms: z.number().nullable().optional(),
    end_ms: z.number().nullable().optional(),
  }).nullable().optional(),
});

const NormalizedCustomerAskSchema = z.object({
  category: z.enum(['price', 'term', 'payment', 'scope', 'legal', 'other']),
  description: z.string(),
  firmness: z.enum(['hard', 'stated', 'soft']),
  agent_confidence: z.enum(['high', 'medium', 'low']),
  evidence_ids: z.array(z.string()),
  source_activity_id: z.string().optional(),
});

const NormalizedConcessionSchema = z.object({
  description: z.string(),
  conceded_at: z.string(),
  conceded_by: z.enum(['rep', 'deal_desk', 'manager']),
  agent_confidence: z.enum(['high', 'medium', 'low']),
  evidence_ids: z.array(z.string()),
  source_activity_id: z.string().optional(),
});

const PillarEvidenceSchema = z.object({
  pillar_key: z.string(),
  evidence_ids: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  status_override: z.enum([
    'confirmed', 'partial', 'unknown', 'not_applicable', 'conflicted',
  ]).optional(),
});

const StakeholderEnrichmentSchema = z.object({
  stakeholder_id: z.string(),
  disposition: z.enum([
    'champion', 'supporter', 'neutral', 'skeptic', 'blocker', 'unknown',
  ]).optional(),
  engagement_level: z.enum([
    'active', 'passive', 'silent', 'absent',
  ]).optional(),
  influence_level: z.enum(['high', 'medium', 'low']).optional(),
  notes: z.string().optional(),
  evidence_ids: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});

const CommercialEnrichmentSchema = z.object({
  customer_asks: z.array(NormalizedCustomerAskSchema),
  concessions_made: z.array(NormalizedConcessionSchema),
  redline_status: z.string().optional(),
  open_redlines: z.array(z.string()).optional(),
  proposed_in_activity_id: z.string().optional(),
  proposed_at: z.string().optional(),
});

const OpportunityEnrichmentSchema = z.object({
  last_activity_summary: z.object({
    text: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence_ids: z.array(z.string()),
  }).optional(),
  deal_posture: z.object({
    status: z.enum(['advancing', 'stalled', 'at_risk', 'indeterminate']),
    rationale: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence_ids: z.array(z.string()),
  }),
});

const IntelligenceConflictSchema = z.object({
  entity: z.enum([
    'stakeholder', 'commercial', 'methodology', 'timing', 'criteria',
  ]),
  description: z.string(),
  involved_ids: z.array(z.string()).optional(),
  evidence_ids: z.array(z.string()),
  severity: z.enum(['high', 'medium', 'low']),
  confidence: z.enum(['high', 'medium', 'low']),
});

const IntelligenceDiagnosticsSchema = z.object({
  overall_confidence: z.enum([
    'high', 'medium', 'low', 'insufficient_data',
  ]),
  rationale: z.string(),
  insufficiently_evidenced: z.array(
    z.object({
      field_path: z.string(),
      reason: z.string(),
    })
  ),
  generated_at: z.string(),
  model: z.string(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }).optional(),
  latency_ms: z.number().optional(),
  attempts: z.number().optional(),
});

export const CoreIntelligenceEnrichmentsSchema = z.object({
  intelligence: z.array(SupportingIntelligenceSchema),
  methodology_pillar_evidence: z.array(PillarEvidenceSchema),
  stakeholder_enrichments: z.array(StakeholderEnrichmentSchema),
  commercial_enrichments: CommercialEnrichmentSchema.optional(),
  opportunity_enrichments: OpportunityEnrichmentSchema.optional(),
  conflicts: z.array(IntelligenceConflictSchema),
  diagnostics: IntelligenceDiagnosticsSchema,
});

export type ValidationResult =
  | { ok: true; data: z.infer<typeof CoreIntelligenceEnrichmentsSchema> }
  | { ok: false; errors: string[] };

export function validateStructure(data: unknown): ValidationResult {
  const result = CoreIntelligenceEnrichmentsSchema.safeParse(data);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });

  return { ok: false, errors };
}