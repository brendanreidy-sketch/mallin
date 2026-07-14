/**
 * PROOF template — a different firm's governance vocabulary over the SAME
 * artifact and the SAME views. Demonstrates two things with zero React change:
 *   1. field selection + ordering differ from the default (relationship-first,
 *      property/lease framing instead of MEDDPICC framing)
 *   2. a REQUIRED data point the source can't supply (lease counterpart,
 *      investment-committee status) surfaces as a visible GAP rather than being
 *      silently dropped — the governance boundary in action.
 *
 * This is illustrative scaffolding for the abstraction proof, NOT a real
 * Macerich governance spec.
 */

import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';
import type { GovernanceTemplate, Tone } from '../render-model';

function dispositionTone(d?: string): Tone {
  switch (d) {
    case 'champion':
    case 'supporter':
      return 'positive';
    case 'skeptic':
      return 'caution';
    case 'blocker':
      return 'critical';
    default:
      return 'neutral';
  }
}

export const macerichTemplate: GovernanceTemplate = {
  orgId: 'macerich',
  label: 'Macerich (proof — relationship/property)',
  sections: [
    {
      key: 'relationship',
      title: 'Relationship Context',
      primary: true,
      descriptor: 'Where the relationship stands',
      fields: [
        {
          key: 'read',
          label: 'Where we stand',
          kind: 'text',
          required: true,
          derive: (a: PrepArtifact) => ({ kind: 'text', text: a.top_line.text }),
          evidence: (a) => a.top_line.evidence_ids,
        },
      ],
    },
    {
      key: 'property_lease',
      title: 'Property & Lease',
      tier: 2,
      fields: [
        {
          // REQUIRED but PrepArtifact has no such data point -> renders as a gap.
          key: 'lease_counterpart',
          label: 'Lease counterpart',
          kind: 'text',
          required: true,
          derive: () => null,
        },
        {
          key: 'asset',
          label: 'Property / asset',
          kind: 'text',
          required: true,
          derive: () => null,
        },
      ],
    },
    {
      key: 'property_stakeholders',
      title: 'Property Stakeholders',
      tier: 2,
      countFrom: (a) => a.stakeholder_strategy?.length,
      fields: [
        {
          key: 'stakeholders',
          label: 'Stakeholders',
          kind: 'people',
          required: true,
          derive: (a: PrepArtifact) => ({
            kind: 'people',
            people: (a.stakeholder_strategy ?? []).map((s) => ({
              name: s.stakeholder_name,
              role: s.role,
              disposition: s.current_state?.disposition,
              tone: dispositionTone(s.current_state?.disposition),
              note: s.call_strategy,
            })),
          }),
          evidence: (a) => (a.stakeholder_strategy ?? []).flatMap((s) => s.evidence_ids ?? []),
        },
      ],
    },
    {
      key: 'internal_approval',
      title: 'Internal Approval',
      tier: 3,
      fields: [
        {
          // REQUIRED, no source -> gap.
          key: 'ic_status',
          label: 'Investment-committee status',
          kind: 'text',
          required: true,
          derive: () => null,
        },
        {
          key: 'open_items',
          label: 'Open approval questions',
          kind: 'list',
          derive: (a: PrepArtifact) => ({
            kind: 'list',
            items: (a.open_questions ?? []).map((q) => q.question),
          }),
        },
      ],
    },
    {
      key: 'commercial',
      title: 'Commercial',
      tier: 3,
      fields: [
        {
          key: 'situation',
          label: 'Situation',
          kind: 'text',
          derive: (a: PrepArtifact) =>
            a.commercial_reality
              ? { kind: 'text', text: a.commercial_reality.situation_summary }
              : null,
        },
      ],
    },
  ],
};
