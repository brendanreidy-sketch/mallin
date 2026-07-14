/**
 * Evidence resolver: substrate intelligence units -> display-ready evidence.
 *
 * The PrepArtifact references evidence by id only (e.g. "int_023"). The actual
 * quoted line, channel, and strength live in the substrate's `intelligence[]`.
 * This builds the id -> EvidenceUnit lookup the cockpit needs to answer "why
 * does Mallin believe this?" with the verbatim source — reasoning from
 * evidence, not asserting a summary.
 *
 * Dates are provenance (when the quote was said/sent), resolved by joining each
 * unit's source_span to the substrate calls/emails. This is NOT change-tracking
 * (that's the temporal layer) — it just stamps each quote with its origin.
 */

import type { EvidenceUnit } from './render-model';

interface RawIntelligence {
  id: string;
  source_channel?: string;
  summary?: string;
  quote?: string;
  strength?: string;
  source_span?: { call_id?: string; email_id?: string };
}

interface RawSubstrate {
  intelligence?: RawIntelligence[];
  calls?: Array<{ id: string; started_at?: string }>;
  emails?: Array<{ id: string; sent_at?: string }>;
}

export type EvidenceIndex = Record<string, EvidenceUnit>;

export function buildEvidenceIndex(substrate: RawSubstrate): EvidenceIndex {
  const callDate = new Map((substrate.calls ?? []).map((c) => [c.id, c.started_at]));
  const emailDate = new Map((substrate.emails ?? []).map((e) => [e.id, e.sent_at]));

  const index: EvidenceIndex = {};
  for (const unit of substrate.intelligence ?? []) {
    if (!unit.id) continue;
    const span = unit.source_span ?? {};
    const date =
      (span.call_id && callDate.get(span.call_id)) ||
      (span.email_id && emailDate.get(span.email_id)) ||
      undefined;

    index[unit.id] = {
      id: unit.id,
      channel: unit.source_channel ?? 'unknown',
      quote: unit.quote?.trim() || undefined,
      summary: unit.summary?.trim() || undefined,
      strength: unit.strength,
      date: date ?? undefined,
    };
  }
  return index;
}

/** Resolve a field's evidence ids to units, dropping any that don't resolve. */
export function resolveEvidence(
  ids: string[] | undefined,
  index: EvidenceIndex | undefined,
): EvidenceUnit[] | undefined {
  if (!ids?.length || !index) return undefined;
  const seen = new Set<string>();
  const units: EvidenceUnit[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const u = index[id];
    if (u) units.push(u);
  }
  return units.length ? units : undefined;
}
