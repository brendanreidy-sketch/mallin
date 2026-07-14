/**
 * Cockpit render model — the view-agnostic layer between a firm's governance
 * template and a rep's chosen view.
 *
 * Pipeline (see memory: governance_template_schema "Build abstraction"):
 *   template-defined data points -> normalized render model -> selected view
 *
 * Firm governance defines the data VOCABULARY (which sections/fields exist and
 * which are REQUIRED). Rep preference defines the VIEW (Cards, Doc, ...).
 * Views consume `RenderModel` ONLY — never PrepArtifact directly — so a firm
 * can swap its template (different fields/order) without any view rewrite.
 *
 * SCOPE (locked May 31 2026): this is the view-layer abstraction only. The
 * deeper derivation/scoring engine (governance JSON interpreter, deal-health
 * score) is deliberately deferred. The default template is authored in TS with
 * `derive` functions; a future firm-specific governance_template.json maps onto
 * the same shape via a derivation registry — not built yet.
 */

import type { PrepArtifact } from '@/lib/contracts/execution-agent-output';

/** Semantic tone for a value — drives color in any view, monochrome + accent. */
export type Tone =
  | 'neutral'
  | 'positive' // advancing / champion / supporter
  | 'caution'  // stalled / pending / soft
  | 'critical' // at_risk / blocker / blocking
  | 'accent';

/** The normalized value forms a view knows how to render. A view switches on
 *  `kind` and reads exactly one payload field. Keep this set small. */
export type RenderValueKind =
  | 'text'        // single block of prose -> `text`
  | 'list'        // bullet items -> `items`
  | 'pairs'       // label/value rows -> `pairs`
  | 'people'      // stakeholders -> `people`
  | 'flags';      // risk/question flags w/ severity -> `flags`

export interface RenderPair {
  label: string;
  value: string;
  tone?: Tone;
}

export interface RenderPerson {
  name: string;
  role?: string;
  disposition?: string;
  tone?: Tone;
  note?: string;
}

export interface RenderFlag {
  title: string;
  detail?: string;
  severity?: string;
  tone?: Tone;
}

/** A resolved piece of provenance — the verbatim source behind a claim. Built
 *  by resolving a field's evidence ids against the substrate (see
 *  evidence-index.ts). This is what makes a card explainable: "why Mallin
 *  believes this" = the channel + date + quoted line, not a paraphrase. */
export interface EvidenceUnit {
  id: string;
  /** call | email | crm | ... */
  channel: string;
  /** Verbatim line from the source. */
  quote?: string;
  /** Mallin's one-line read of that source. */
  summary?: string;
  /** strong | moderate | weak — drives the card confidence label. */
  strength?: string;
  /** ISO timestamp of the originating call/email, when resolvable. */
  date?: string;
}

/** One governance data point, normalized for rendering. */
export interface RenderField {
  key: string;
  label: string;
  kind: RenderValueKind;

  /** Declared REQUIRED by the firm's governance template. A required field with
   *  no data renders as a visible GAP — the governance boundary: a rep's view
   *  choice can change presentation but cannot silently erase required data. */
  required: boolean;
  /** Did the source artifact actually supply a value? */
  present: boolean;

  // Exactly one of these is populated, per `kind`:
  text?: string;
  items?: string[];
  pairs?: RenderPair[];
  people?: RenderPerson[];
  flags?: RenderFlag[];

  /** Provenance — evidence ids backing the value, when the source carries them. */
  evidenceIds?: string[];
  /** Resolved provenance — the quoted source units behind the value. Populated
   *  when an evidence index is supplied to the mapper. Drives the evidence chip. */
  evidence?: EvidenceUnit[];
}

/** Importance band — breaks the "every card equal" democracy. 1 = the one
 *  dominant card (primary), 2 = supporting actors (risks, stakeholders), 3 =
 *  quiet reference (commercial, prep material). Evidence proves truth; tier
 *  proves importance. Firm-authored, so a firm can re-rank what matters. */
export type Tier = 1 | 2 | 3;

export interface RenderSection {
  key: string;
  title: string;
  /** The ONE primary thing. At most one section per model is primary. Views
   *  give it dominant visual weight; one-primary-thing discipline preserved. */
  primary: boolean;
  /** Importance band (1 dominant / 2 supporting / 3 reference). */
  tier: Tier;
  /** Optional one-line framing shown under a primary section's title. */
  descriptor?: string;
  fields: RenderField[];
  /** True if any field in the section has data. */
  present: boolean;
  /** True if the section has a required field that is missing (a governance gap). */
  hasGap: boolean;
}

/** A single entry in the coverage spine — the at-a-glance "Mallin holds this"
 *  index. It is the governance template rendered, not a generic index. */
export interface CoverageEntry {
  key: string;
  title: string;
  required: boolean;
  present: boolean;
  /** Optional count badge (e.g. "5" stakeholders, "3" risks). */
  count?: number;
}

export interface RenderModel {
  dealName?: string;
  templateLabel: string;
  sections: RenderSection[];
  coverage: CoverageEntry[];
}

// ────────────────────────────────────────────────────────────────────────────
// Template types — a firm's governance vocabulary, authored against the artifact
// ────────────────────────────────────────────────────────────────────────────

/** What a field derivation returns. `null`/absence => the field is not present.
 *  For list/people/flags an empty array also counts as not present. */
export type DerivedValue =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'pairs'; pairs: RenderPair[] }
  | { kind: 'people'; people: RenderPerson[] }
  | { kind: 'flags'; flags: RenderFlag[] }
  | null;

export interface TemplateField {
  key: string;
  label: string;
  kind: RenderValueKind;
  /** Firm declares this data point mandatory. Absent value -> rendered gap. */
  required?: boolean;
  /** Pull + normalize the value from the source artifact. The default template
   *  authors these in TS; a firm JSON template would resolve them via registry. */
  derive: (artifact: PrepArtifact) => DerivedValue;
  /** Optional evidence-id extractor for provenance. */
  evidence?: (artifact: PrepArtifact) => string[] | undefined;
}

export interface TemplateSection {
  key: string;
  title: string;
  primary?: boolean;
  /** Importance band (1 dominant / 2 supporting / 3 reference). Defaults to 2;
   *  a primary section is always treated as tier 1. */
  tier?: Tier;
  /** Optional one-line framing rendered under a primary section's title. */
  descriptor?: string;
  /** Show in the coverage spine as a count of these items, when set. */
  countFrom?: (artifact: PrepArtifact) => number | undefined;
  fields: TemplateField[];
}

export interface GovernanceTemplate {
  /** Firm identity — "default" (PrepArtifact vocabulary) or an org id. */
  orgId: string;
  label: string;
  sections: TemplateSection[];
}
