/**
 * DEFAULT governance template — the current PrepArtifact field set expressed as
 * a firm-agnostic vocabulary. This makes the view layer work today while the
 * firm-specific governance_template.json story is still deferred.
 *
 * Every firm template (Northwind, Acme, ...) is just a different selection /
 * ordering / required-flagging of data points over the same artifact, consumed
 * by the same views.
 */

import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';
import type { GovernanceTemplate, Tone } from '../render-model';

function postureTone(posture: string): Tone {
  switch (posture) {
    case 'advancing':
      return 'positive';
    case 'stalled':
      return 'caution';
    case 'at_risk':
      return 'critical';
    default:
      return 'neutral';
  }
}

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

function severityTone(s?: string): Tone {
  switch (s) {
    case 'blocking':
      return 'critical';
    case 'high':
      return 'caution';
    default:
      return 'neutral';
  }
}

export const defaultTemplate: GovernanceTemplate = {
  orgId: 'default',
  label: 'Default (PrepArtifact)',
  sections: [
    {
      key: 'decision_focus',
      title: 'Decision Focus',
      primary: true,
      descriptor: 'The decision this deal turns on',
      fields: [
        {
          key: 'decision_frame',
          label: 'Controlling decision frame',
          kind: 'text',
          required: true,
          derive: (a: PrepArtifact) =>
            a.deal_thesis.status === 'formed'
              ? { kind: 'text', text: a.deal_thesis.decision_frame }
              : { kind: 'text', text: a.deal_thesis.indeterminate_reason },
          evidence: (a) =>
            a.deal_thesis.status === 'formed' ? a.deal_thesis.evidence_ids : undefined,
        },
        {
          key: 'why_this_matters',
          label: 'Why it matters',
          kind: 'text',
          derive: (a: PrepArtifact) =>
            a.deal_thesis.status === 'formed'
              ? { kind: 'text', text: a.deal_thesis.why_this_matters }
              : { kind: 'list', items: a.deal_thesis.required_evidence_to_form_thesis },
        },
      ],
    },
    {
      key: 'deal_state',
      title: 'Deal State',
      tier: 2,
      countFrom: () => undefined,
      fields: [
        {
          key: 'posture',
          label: 'Posture',
          kind: 'pairs',
          required: true,
          derive: (a: PrepArtifact) => ({
            kind: 'pairs',
            pairs: [
              { label: 'Posture', value: a.top_line.posture, tone: postureTone(a.top_line.posture) },
            ],
          }),
        },
        {
          key: 'top_line',
          label: 'Read',
          kind: 'text',
          derive: (a: PrepArtifact) => ({ kind: 'text', text: a.top_line.text }),
          evidence: (a) => a.top_line.evidence_ids,
        },
      ],
    },
    {
      key: 'critical_risks',
      title: 'Critical Risks',
      tier: 2,
      countFrom: (a) => a.critical_risks?.length,
      fields: [
        {
          key: 'risks',
          label: 'Risks',
          kind: 'flags',
          required: true,
          derive: (a: PrepArtifact) => ({
            kind: 'flags',
            flags: (a.critical_risks ?? []).map((r) => ({
              title: r.title,
              detail: r.recommended_posture,
              severity: r.severity,
              tone: severityTone(r.severity),
            })),
          }),
          evidence: (a) => (a.critical_risks ?? []).flatMap((r) => r.evidence_ids ?? []),
        },
      ],
    },
    {
      key: 'stakeholders',
      title: 'Stakeholders',
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
        {
          key: 'asks',
          label: 'Open asks',
          kind: 'list',
          derive: (a: PrepArtifact) =>
            a.commercial_reality
              ? {
                  kind: 'list',
                  items: a.commercial_reality.asks.map(
                    (ask) => `${ask.category}: ${ask.customer_position} (${ask.firmness})`,
                  ),
                }
              : null,
        },
      ],
    },
    {
      key: 'talk_track',
      title: 'Talk Track',
      tier: 3,
      countFrom: (a) => a.talk_track?.key_questions?.length,
      fields: [
        {
          key: 'opening',
          label: 'Opening angle',
          kind: 'text',
          required: true,
          derive: (a: PrepArtifact) => ({ kind: 'text', text: a.talk_track.opening_angle }),
        },
        {
          key: 'questions',
          label: 'Key questions',
          kind: 'list',
          derive: (a: PrepArtifact) => ({
            kind: 'list',
            items: (a.talk_track.key_questions ?? []).map((q) => q.question),
          }),
        },
      ],
    },
    {
      key: 'open_questions',
      title: 'Open Questions',
      tier: 3,
      countFrom: (a) => a.open_questions?.length,
      fields: [
        {
          key: 'open_questions',
          label: 'Open questions',
          kind: 'flags',
          derive: (a: PrepArtifact) => ({
            kind: 'flags',
            flags: (a.open_questions ?? []).map((q) => ({
              title: q.question,
              detail: q.why_it_matters,
              severity: q.urgency,
              tone: q.blocks_decision ? 'critical' : severityTone(q.urgency),
            })),
          }),
          evidence: (a) => (a.open_questions ?? []).flatMap((q) => q.evidence_ids ?? []),
        },
      ],
    },
    {
      key: 'success',
      title: 'Success Criteria',
      tier: 3,
      fields: [
        {
          key: 'summary',
          label: 'What good looks like',
          kind: 'text',
          derive: (a: PrepArtifact) =>
            a.success_criteria ? { kind: 'text', text: a.success_criteria.summary } : null,
        },
        {
          key: 'outcomes',
          label: 'Target outcomes',
          kind: 'list',
          derive: (a: PrepArtifact) =>
            a.success_criteria
              ? { kind: 'list', items: a.success_criteria.outcomes.map((o) => o.outcome) }
              : null,
        },
      ],
    },
  ],
};
