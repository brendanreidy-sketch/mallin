/**
 * The mapper: (PrepArtifact, GovernanceTemplate) -> RenderModel.
 *
 * This is the single seam where source data meets a firm's governance
 * vocabulary. Views never run this — they consume the RenderModel it produces.
 * Swapping the template changes which fields appear and which are flagged as
 * gaps, with zero change to any view.
 */

import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';
import type {
  GovernanceTemplate,
  RenderField,
  RenderModel,
  RenderSection,
  DerivedValue,
} from './render-model';
import { resolveEvidence, type EvidenceIndex } from './evidence-index';

function materialize(
  field: { key: string; label: string; kind: RenderField['kind']; required?: boolean },
  derived: DerivedValue,
  evidenceIds: string[] | undefined,
  evidenceIndex: EvidenceIndex | undefined,
): RenderField {
  const base: RenderField = {
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: Boolean(field.required),
    present: false,
    evidenceIds,
    evidence: resolveEvidence(evidenceIds, evidenceIndex),
  };

  if (!derived) return base;

  switch (derived.kind) {
    case 'text':
      if (!derived.text.trim()) return base;
      return { ...base, present: true, text: derived.text };
    case 'list':
      if (derived.items.length === 0) return base;
      return { ...base, present: true, items: derived.items };
    case 'pairs':
      if (derived.pairs.length === 0) return base;
      return { ...base, present: true, pairs: derived.pairs };
    case 'people':
      if (derived.people.length === 0) return base;
      return { ...base, present: true, people: derived.people };
    case 'flags':
      if (derived.flags.length === 0) return base;
      return { ...base, present: true, flags: derived.flags };
    default:
      return base;
  }
}

export function deriveRenderModel(
  artifact: PrepArtifact,
  template: GovernanceTemplate,
  dealName?: string,
  evidenceIndex?: EvidenceIndex,
): RenderModel {
  const sections: RenderSection[] = template.sections.map((sec) => {
    const fields = sec.fields.map((f) =>
      materialize(f, f.derive(artifact), f.evidence?.(artifact), evidenceIndex),
    );
    const present = fields.some((f) => f.present);
    const hasGap = fields.some((f) => f.required && !f.present);
    const primary = Boolean(sec.primary);
    return {
      key: sec.key,
      title: sec.title,
      primary,
      tier: primary ? 1 : (sec.tier ?? 2),
      descriptor: sec.descriptor,
      fields,
      present,
      hasGap,
    };
  });

  const coverage = template.sections.map((sec, i) => {
    const required = sec.fields.some((f) => f.required);
    return {
      key: sec.key,
      title: sec.title,
      required,
      present: sections[i].present,
      count: sec.countFrom?.(artifact),
    };
  });

  return {
    dealName,
    templateLabel: template.label,
    sections,
    coverage,
  };
}
