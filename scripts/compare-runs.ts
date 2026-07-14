/**
 * ============================================================================
 *  Pass 4 Multi-Run Comparator — within-variant + between-variant analysis
 * ============================================================================
 *
 *  Takes 4 PrepArtifact JSON paths (2 runs of each of 2 substrate variants)
 *  and computes:
 *    - within-variant directional agreement (run1 vs run2 of same substrate)
 *      → measures NOISE FLOOR per dimension
 *    - between-variant directional agreement (run1 pair, run2 pair)
 *      → measures SUBSTRATE-DRIVEN SHIFT per dimension
 *    - dimension_reliability (low/medium/high) per dimension
 *      → derived from within-variant agreement + Unknown frequency
 *    - signal verdict per dimension:
 *        - SIGNAL  = high reliability AND consistent between-variant shift
 *        - NOISE   = low reliability (within-variant disagrees)
 *        - STABLE  = high reliability AND no between-variant shift
 *
 *  Use:
 *    npx tsx scripts/compare-runs.ts \
 *      <variant1_run1> <variant1_run2> \
 *      <variant2_run1> <variant2_run2> \
 *      [<variant2_merged_input>]
 *
 *  Pass variant2 (full) merged input as 5th arg to enable
 *  dominant_evidence_alignment checks. Without it, alignment is unknown
 *  and SIGNAL gating treats it as failed (conservative).
 *
 *  Convention:
 *    variant1 = "calls-only"  (the leaner substrate)
 *    variant2 = "full"        (the richer substrate)
 *
 *  Decision rule (formalized from operator guidance):
 *    A shift is SIGNAL only if it appears in BOTH between-variant comparisons
 *    AND the shifted dimension has HIGH within-variant agreement.
 *
 *    If within-variant disagrees on a dimension, you cannot claim a
 *    between-variant shift on that dimension as substrate-driven —
 *    it could just be run-to-run noise.
 *
 *  ANALYSIS-ONLY: this tool does NOT change Pass 4 outputs. It is
 *  exclusively a measurement layer over them.
 * ============================================================================
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrepArtifact } from "../lib/contracts/execution-agent-output";

// ────────────────────────────────────────────────────────────────────────────
// Canonicalization helpers — duplicated from compare-pass4.ts deliberately
// to keep this tool standalone. If you change one, mirror in the other.
// ────────────────────────────────────────────────────────────────────────────

type Controller = "CFO" | "CTO" | "VP Finance" | "Legal" | "Multi" | "Unknown";
type Stage = "discovery" | "evaluation" | "approval" | "execution" | "unknown";
type RiskClass =
  | "economic"
  | "legal"
  | "technical"
  | "operational"
  | "stakeholder"
  | "unknown";

function canonicalController(artifact: PrepArtifact): Controller {
  const thesisText =
    artifact.deal_thesis?.status === "formed" ? artifact.deal_thesis.thesis : "";
  const frameText =
    artifact.deal_thesis?.status === "formed"
      ? artifact.deal_thesis.decision_frame
      : "";
  const corpus = (thesisText + " " + frameText).toLowerCase();
  const matches: Set<Controller> = new Set();
  if (/\bcfo\b|chief financial/i.test(corpus)) matches.add("CFO");
  if (/\bcto\b|chief technology/i.test(corpus)) matches.add("CTO");
  if (/vp\s+(of\s+)?finance|finance\s*(?:and|&)\s*accounting/i.test(corpus))
    matches.add("VP Finance");
  if (/\blegal\b|general counsel|chief legal/i.test(corpus))
    matches.add("Legal");
  if (matches.size === 0) return "Unknown";
  if (matches.size === 1) return [...matches][0];
  return "Multi";
}

function canonicalStage(artifact: PrepArtifact): Stage {
  const thesisText =
    artifact.deal_thesis?.status === "formed" ? artifact.deal_thesis.thesis : "";
  const frameText =
    artifact.deal_thesis?.status === "formed"
      ? artifact.deal_thesis.decision_frame
      : "";
  const riskTexts = (artifact.critical_risks ?? [])
    .map((r) => r.title + " " + r.description)
    .join(" ");
  const corpus = (
    thesisText +
    " " +
    frameText +
    " " +
    riskTexts +
    " " +
    artifact.top_line.text
  ).toLowerCase();
  // Tier 1 — STRONG EXECUTION: requires explicit close-event or post-close
  // markers. Bare "implementation" / "implementation timelines" is NOT enough
  // — that's pre-close SoW discussion. Execution requires the close to have
  // happened OR an explicit post-close artifact (kickoff, welcome, onboarding
  // kickoff, database setup, admin user created, etc.).
  if (/\bwelcome aboard|contract (?:executed|signed|sent for signature)|docusign (?:sent|signed|executed)|post[\s-]?(?:close|signature|signing)|kickoff|go[\s-]?live|deployed|live in production|onboarding kickoff|executed contract|signed (?:by|the contract)|signature (?:received|completed)|onboarding (?:underway|started|initiated|in progress)|admin user (?:setup|created)|database (?:setup|created)/.test(corpus))
    return "execution";
  // Tier 2 — APPROVAL: contract / legal / pricing / SoW negotiation. This
  // is where "implementation timelines" and SoW review land — pre-close.
  if (/\bsignature|signer|docusign|contract.*(?:execut|sign|negotiat|review|redline)|mnda|redline|pricing|approval gate|sign-?off|order form|sow review|sow|statement of work|implementation timeline|implementation plan|implementation scope|implementation methodology/.test(corpus))
    return "approval";
  if (/\bdemo|competitor|vendor selection|criteria|evaluat|comparing|compare against/.test(corpus))
    return "evaluation";
  if (/\bdiscovery|exploring|early[\s-]?stage|initial conversation/.test(corpus))
    return "discovery";
  return "unknown";
}

function classifyRisk(title: string, description: string): RiskClass {
  const corpus = (title + " " + description).toLowerCase();
  if (/\bcfo unengaged|champion|eb (silent|unengaged|absent|never engaged)|stakeholder|disengag|departed|ooo|out of office/.test(corpus))
    return "stakeholder";
  if (/\b(ai indemnit|mnda|redline|legal|contract dispute|liability cap|indemnif|terms)\b/.test(corpus))
    return "legal";
  if (/\b(roi|pricing|cost|budget|economic|headcount|fte|discount|net 30)\b/.test(corpus))
    return "economic";
  if (/\b(integration|api|netsuite|mri|workday|connectivity|technical|d365|sftp|bank matrix|bank connect)/.test(corpus))
    return "technical";
  if (/\b(onboard|implementation|go[\s-]?live|deploy|operational|admin user|setup)/.test(corpus))
    return "operational";
  return "unknown";
}

function dominantRiskClass(artifact: PrepArtifact): RiskClass {
  const counts: Record<string, number> = {};
  for (const r of artifact.critical_risks ?? []) {
    const cls = classifyRisk(r.title, r.description);
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length === 0 ? "unknown" : (sorted[0][0] as RiskClass);
}

interface CanonicalView {
  controller: Controller;
  stage: Stage;
  dominant_risk_class: RiskClass;
}

function canonicalize(artifact: PrepArtifact): CanonicalView {
  return {
    controller: canonicalController(artifact),
    stage: canonicalStage(artifact),
    dominant_risk_class: dominantRiskClass(artifact),
  };
}

function isUnknown(v: string): boolean {
  return v === "Unknown" || v === "unknown";
}

function dimensionAgrees(a: string, b: string): boolean {
  if (isUnknown(a) && isUnknown(b)) return true;
  if (isUnknown(a) || isUnknown(b)) return true;
  return a === b;
}

// ────────────────────────────────────────────────────────────────────────────
// Reliability computation — based on within-variant agreement + Unknown freq
// ────────────────────────────────────────────────────────────────────────────

type Reliability = "low" | "medium" | "high";

function dimensionReliability(
  variant1Run1: string,
  variant1Run2: string,
  variant2Run1: string,
  variant2Run2: string
): { reliability: Reliability; rationale: string } {
  const v1Agrees = dimensionAgrees(variant1Run1, variant1Run2);
  const v2Agrees = dimensionAgrees(variant2Run1, variant2Run2);
  const unknownCount = [variant1Run1, variant1Run2, variant2Run1, variant2Run2].filter(
    isUnknown
  ).length;

  // High: both within-variant pairs agree on concrete (Unknown not dominant)
  if (v1Agrees && v2Agrees && unknownCount <= 1) {
    return {
      reliability: "high",
      rationale: "both within-variant pairs agree, observations are concrete",
    };
  }

  // High-with-caveat: both agree but lots of Unknowns
  if (v1Agrees && v2Agrees && unknownCount >= 2) {
    return {
      reliability: "medium",
      rationale: `both within-variant pairs agree but ${unknownCount}/4 Unknown — observation thin`,
    };
  }

  // Medium: one within-variant pair agrees, other doesn't (Unknown-tolerant)
  if (v1Agrees !== v2Agrees) {
    return {
      reliability: "medium",
      rationale: "one variant stable across runs, other unstable",
    };
  }

  // Low: neither within-variant pair agrees concretely
  return {
    reliability: "low",
    rationale: "within-variant disagreement on both variants — model unstable on this axis",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CLI + main
// ────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 4) {
  console.error(
    "Usage: npx tsx scripts/compare-runs.ts \\\n" +
      "  <variant1_run1> <variant1_run2> \\\n" +
      "  <variant2_run1> <variant2_run2> \\\n" +
      "  [<variant2_merged_input>]\n\n" +
      "Convention: variant1 = calls-only, variant2 = full"
  );
  process.exit(1);
}

const [v1r1Path, v1r2Path, v2r1Path, v2r2Path, v2MergedPath] = args;

function load(p: string): PrepArtifact {
  return JSON.parse(readFileSync(resolve(p), "utf8")) as PrepArtifact;
}

const v1r1Raw = load(v1r1Path);
const v1r2Raw = load(v1r2Path);
const v2r1Raw = load(v2r1Path);
const v2r2Raw = load(v2r2Path);

const v1r1 = canonicalize(v1r1Raw);
const v1r2 = canonicalize(v1r2Raw);
const v2r1 = canonicalize(v2r1Raw);
const v2r2 = canonicalize(v2r2Raw);

interface IntelligenceRecord {
  id: string;
  source_channel?: string;
  summary?: string;
  quote?: string;
}
interface MergedInputForAlignment {
  intelligence?: IntelligenceRecord[];
}
let v2MergedInput: MergedInputForAlignment | null = null;
if (v2MergedPath) {
  v2MergedInput = JSON.parse(
    readFileSync(resolve(v2MergedPath), "utf8")
  ) as MergedInputForAlignment;
}

const HR = "━".repeat(72);
const SUB = "─".repeat(72);

function header(t: string): void {
  console.log(HR);
  console.log(`  ${t}`);
  console.log(HR);
}
function section(t: string): void {
  console.log(`\n${SUB}\n  ${t}\n${SUB}`);
}

header("Pass 4 Multi-Run Analysis");
console.log(`  variant1 (calls-only) run1:   ${v1r1Path}`);
console.log(`  variant1 (calls-only) run2:   ${v1r2Path}`);
console.log(`  variant2 (full)        run1:  ${v2r1Path}`);
console.log(`  variant2 (full)        run2:  ${v2r2Path}`);

// ── Canonical buckets, all 4 ─────────────────────────────────────────────
section("Canonical buckets (per run)");
function row(label: string, c: CanonicalView): void {
  console.log(
    `  ${label.padEnd(22)}  controller: ${c.controller.padEnd(11)}  stage: ${c.stage.padEnd(11)}  risk: ${c.dominant_risk_class}`
  );
}
row("variant1 (calls) run1", v1r1);
row("variant1 (calls) run2", v1r2);
row("variant2 (full)  run1", v2r1);
row("variant2 (full)  run2", v2r2);

// ── Within-variant agreement (NOISE FLOOR per dimension) ─────────────────
section("Within-variant directional agreement (noise floor)");
const v1Within = {
  controller: dimensionAgrees(v1r1.controller, v1r2.controller),
  stage: dimensionAgrees(v1r1.stage, v1r2.stage),
  risk: dimensionAgrees(v1r1.dominant_risk_class, v1r2.dominant_risk_class),
};
const v2Within = {
  controller: dimensionAgrees(v2r1.controller, v2r2.controller),
  stage: dimensionAgrees(v2r1.stage, v2r2.stage),
  risk: dimensionAgrees(v2r1.dominant_risk_class, v2r2.dominant_risk_class),
};

console.log(`\n  variant1 (calls-only) — run1 vs run2:`);
console.log(`    controller: ${v1Within.controller}  (${v1r1.controller} vs ${v1r2.controller})`);
console.log(`    stage:      ${v1Within.stage}  (${v1r1.stage} vs ${v1r2.stage})`);
console.log(`    risk_class: ${v1Within.risk}  (${v1r1.dominant_risk_class} vs ${v1r2.dominant_risk_class})`);

console.log(`\n  variant2 (full) — run1 vs run2:`);
console.log(`    controller: ${v2Within.controller}  (${v2r1.controller} vs ${v2r2.controller})`);
console.log(`    stage:      ${v2Within.stage}  (${v2r1.stage} vs ${v2r2.stage})`);
console.log(`    risk_class: ${v2Within.risk}  (${v2r1.dominant_risk_class} vs ${v2r2.dominant_risk_class})`);

// ── Between-variant agreement (potential signal per dimension) ───────────
section("Between-variant directional agreement (potential signal)");
const between = {
  pair1: {
    controller: dimensionAgrees(v1r1.controller, v2r1.controller),
    stage: dimensionAgrees(v1r1.stage, v2r1.stage),
    risk: dimensionAgrees(v1r1.dominant_risk_class, v2r1.dominant_risk_class),
  },
  pair2: {
    controller: dimensionAgrees(v1r2.controller, v2r2.controller),
    stage: dimensionAgrees(v1r2.stage, v2r2.stage),
    risk: dimensionAgrees(v1r2.dominant_risk_class, v2r2.dominant_risk_class),
  },
};

console.log(`\n  pair1 (calls run1 vs full run1):`);
console.log(`    controller: ${between.pair1.controller}  (${v1r1.controller} vs ${v2r1.controller})`);
console.log(`    stage:      ${between.pair1.stage}  (${v1r1.stage} vs ${v2r1.stage})`);
console.log(`    risk_class: ${between.pair1.risk}  (${v1r1.dominant_risk_class} vs ${v2r1.dominant_risk_class})`);

console.log(`\n  pair2 (calls run2 vs full run2):`);
console.log(`    controller: ${between.pair2.controller}  (${v1r2.controller} vs ${v2r2.controller})`);
console.log(`    stage:      ${between.pair2.stage}  (${v1r2.stage} vs ${v2r2.stage})`);
console.log(`    risk_class: ${between.pair2.risk}  (${v1r2.dominant_risk_class} vs ${v2r2.dominant_risk_class})`);

// ── Dimension reliability ────────────────────────────────────────────────
section("Dimension reliability");
const ctrlRel = dimensionReliability(
  v1r1.controller,
  v1r2.controller,
  v2r1.controller,
  v2r2.controller
);
const stageRel = dimensionReliability(v1r1.stage, v1r2.stage, v2r1.stage, v2r2.stage);
const riskRel = dimensionReliability(
  v1r1.dominant_risk_class,
  v1r2.dominant_risk_class,
  v2r1.dominant_risk_class,
  v2r2.dominant_risk_class
);

console.log(`\n  controller:           ${ctrlRel.reliability.padEnd(7)}  ${ctrlRel.rationale}`);
console.log(`  stage:                ${stageRel.reliability.padEnd(7)}  ${stageRel.rationale}`);
console.log(`  dominant_risk_class:  ${riskRel.reliability.padEnd(7)}  ${riskRel.rationale}`);

// ── Per-variant consensus (collapses 2 runs into majority view) ──────────
//
// Each variant's two runs vote on each dimension. Unknown is ignored when
// possible — if one run says concrete and the other says Unknown, the
// concrete view wins with support=1. If both runs say Unknown, value is
// Unknown (support=2). If runs disagree on different concretes, the
// dimension goes to no_consensus.
//
// support is the count of votes backing the consensus value. support=2
// means both runs agreed on the concrete value (or both said Unknown).
// support=1 means one run was Unknown and the other was concrete.

type ConsensusValue = string | "no_consensus";
interface Consensus {
  value: ConsensusValue;
  support: 1 | 2;
}

function consensus(run1: string, run2: string): Consensus {
  const u1 = isUnknown(run1);
  const u2 = isUnknown(run2);
  if (u1 && u2) return { value: run1, support: 2 };
  if (u1) return { value: run2, support: 1 };
  if (u2) return { value: run1, support: 1 };
  if (run1 === run2) return { value: run1, support: 2 };
  return { value: "no_consensus", support: 1 };
}

const v1Consensus = {
  controller: consensus(v1r1.controller, v1r2.controller),
  stage: consensus(v1r1.stage, v1r2.stage),
  risk_class: consensus(v1r1.dominant_risk_class, v1r2.dominant_risk_class),
};
const v2Consensus = {
  controller: consensus(v2r1.controller, v2r2.controller),
  stage: consensus(v2r1.stage, v2r2.stage),
  risk_class: consensus(v2r1.dominant_risk_class, v2r2.dominant_risk_class),
};

section("Per-variant consensus (collapses 2 runs into majority view)");
console.log(`\n  variant1 (calls-only):`);
console.log(`    controller:  ${v1Consensus.controller.value.padEnd(15)}  support: ${v1Consensus.controller.support}/2`);
console.log(`    stage:       ${v1Consensus.stage.value.padEnd(15)}  support: ${v1Consensus.stage.support}/2`);
console.log(`    risk_class:  ${v1Consensus.risk_class.value.padEnd(15)}  support: ${v1Consensus.risk_class.support}/2`);
console.log(`\n  variant2 (full):`);
console.log(`    controller:  ${v2Consensus.controller.value.padEnd(15)}  support: ${v2Consensus.controller.support}/2`);
console.log(`    stage:       ${v2Consensus.stage.value.padEnd(15)}  support: ${v2Consensus.stage.support}/2`);
console.log(`    risk_class:  ${v2Consensus.risk_class.value.padEnd(15)}  support: ${v2Consensus.risk_class.support}/2`);

// ── Consensus gap (between-variant view at the consensus level) ──────────
type GapType = "same" | "different" | "no_consensus";

function consensusGap(c1: Consensus, c2: Consensus): GapType {
  if (c1.value === "no_consensus" || c2.value === "no_consensus") return "no_consensus";
  if (c1.value === c2.value) return "same";
  return "different";
}

const gap = {
  controller: consensusGap(v1Consensus.controller, v2Consensus.controller),
  stage: consensusGap(v1Consensus.stage, v2Consensus.stage),
  risk_class: consensusGap(v1Consensus.risk_class, v2Consensus.risk_class),
};

section("Consensus gap (between-variant comparison at consensus level)");
console.log(`\n  controller:  ${gap.controller.padEnd(13)}  (${v1Consensus.controller.value} vs ${v2Consensus.controller.value})`);
console.log(`  stage:       ${gap.stage.padEnd(13)}  (${v1Consensus.stage.value} vs ${v2Consensus.stage.value})`);
console.log(`  risk_class:  ${gap.risk_class.padEnd(13)}  (${v1Consensus.risk_class.value} vs ${v2Consensus.risk_class.value})`);

// ── Consensus fragility (per dimension per variant) ──────────────────────
//
// fragility = high when support < 2 (one run was Unknown). low when both
// runs gave the same concrete observation. SIGNAL gating below requires
// LOW fragility on both variants — single-vote consensus can't drive
// substrate-shift claims.
type Fragility = "low" | "high";

function fragility(c: Consensus): Fragility {
  if (c.value === "no_consensus") return "high";
  if (c.support === 2) return "low";
  return "high";
}

const fragilityV1 = {
  controller: fragility(v1Consensus.controller),
  stage: fragility(v1Consensus.stage),
  risk_class: fragility(v1Consensus.risk_class),
};
const fragilityV2 = {
  controller: fragility(v2Consensus.controller),
  stage: fragility(v2Consensus.stage),
  risk_class: fragility(v2Consensus.risk_class),
};

section("Consensus fragility (per variant per dimension)");
console.log(`\n  variant1 (calls-only):  controller=${fragilityV1.controller}  stage=${fragilityV1.stage}  risk_class=${fragilityV1.risk_class}`);
console.log(`  variant2 (full):        controller=${fragilityV2.controller}  stage=${fragilityV2.stage}  risk_class=${fragilityV2.risk_class}`);
console.log(`\n  SIGNAL gating requires fragility=low on BOTH variants for any dimension.`);

// ── Temporal consistency (does substrate richness move stage forward?) ───
//
// Stage has a natural temporal order: discovery → evaluation → approval
// → execution. Substrate richness should move stage same-or-forward;
// any backward move is a red flag (the model invented a regression).
const STAGE_ORDER: Record<string, number> = {
  discovery: 0,
  evaluation: 1,
  approval: 2,
  execution: 3,
};

function stageIdx(s: string): number | null {
  if (s === "no_consensus" || s === "unknown") return null;
  return STAGE_ORDER[s] ?? null;
}

const v1StageIdx = stageIdx(v1Consensus.stage.value as string);
const v2StageIdx = stageIdx(v2Consensus.stage.value as string);

interface TemporalConsistency {
  moves_forward: boolean | null;
  regression_flag: boolean;
  rationale: string;
}

let temporal: TemporalConsistency;
if (v1StageIdx === null || v2StageIdx === null) {
  temporal = {
    moves_forward: null,
    regression_flag: false,
    rationale: "Stage consensus unavailable on at least one variant — cannot evaluate temporal direction.",
  };
} else if (v2StageIdx < v1StageIdx) {
  temporal = {
    moves_forward: false,
    regression_flag: true,
    rationale: `⚠ REGRESSION: full version went backward in stage (${v1Consensus.stage.value} → ${v2Consensus.stage.value}). Substrate richness should move forward, not back. Inspect for model error.`,
  };
} else if (v2StageIdx > v1StageIdx) {
  temporal = {
    moves_forward: true,
    regression_flag: false,
    rationale: `Full version moved stage forward (${v1Consensus.stage.value} → ${v2Consensus.stage.value}). Consistent with substrate richness adding closing-stage signals.`,
  };
} else {
  temporal = {
    moves_forward: true,
    regression_flag: false,
    rationale: `Full version held same stage as calls-only (${v1Consensus.stage.value}). No temporal movement — substrate richness sharpened lens but didn't advance state.`,
  };
}

section("Temporal consistency (stage direction across variants)");
console.log(`\n  moves_forward:    ${temporal.moves_forward}`);
console.log(`  regression_flag:  ${temporal.regression_flag}`);
console.log(`  ${temporal.rationale}`);

// ── Evidence parity (is the shift driven by more evidence on one side?) ──
//
// If full has 2-3× more cited evidence than calls-only, the apparent
// shift might just be "more substrate = more text" rather than real
// reinterpretation. parity_flag=skewed downgrades delta_strength by
// one level in the verdict.
function collectEvidenceIds(a: PrepArtifact): Set<string> {
  const ids = new Set<string>();
  for (const id of a.top_line.evidence_ids ?? []) ids.add(id);
  for (const id of a.deal_thesis?.evidence_ids ?? []) ids.add(id);
  for (const r of a.critical_risks ?? []) {
    for (const id of r.evidence_ids ?? []) ids.add(id);
  }
  for (const q of a.open_questions ?? []) {
    for (const id of q.evidence_ids ?? []) ids.add(id);
  }
  return ids;
}

const v1AvgCount = Math.round(
  (collectEvidenceIds(v1r1Raw).size + collectEvidenceIds(v1r2Raw).size) / 2
);
const v2AvgCount = Math.round(
  (collectEvidenceIds(v2r1Raw).size + collectEvidenceIds(v2r2Raw).size) / 2
);
const evidenceDelta = v2AvgCount - v1AvgCount;
const evidenceRatio = v1AvgCount > 0 ? v2AvgCount / v1AvgCount : Infinity;
const parityFlag: "balanced" | "skewed" =
  evidenceRatio >= 2 ? "skewed" : "balanced";

section("Evidence parity (substrate richness vs. interpretation richness)");
console.log(`\n  calls_only_count (avg of 2 runs):  ${v1AvgCount}`);
console.log(`  full_count       (avg of 2 runs):  ${v2AvgCount}`);
console.log(`  delta:                              ${evidenceDelta > 0 ? "+" : ""}${evidenceDelta}`);
console.log(`  ratio (full / calls-only):          ${evidenceRatio === Infinity ? "∞" : evidenceRatio.toFixed(2) + "×"}`);
console.log(`  parity_flag:                        ${parityFlag}`);
if (parityFlag === "skewed") {
  console.log(`  ⚠ Skewed: full cites ≥2× as much evidence as calls-only.`);
  console.log(`    Apparent shifts may be "we only saw it because there's more of it"`);
  console.log(`    rather than "same evidence reinterpreted with new context."`);
  console.log(`    SIGNAL delta_strength downgraded by one level.`);
}

// ── Dominant evidence alignment (does new evidence map to the dimension?) ─
//
// When SIGNAL is otherwise eligible, verify the new evidence types align
// with the dimension being claimed:
//   stage     : DocuSign, signer, executed, onboarding, kickoff, go-live, welcome
//   controller: CFO, CTO, approver, signer, EB, VP Finance
//   risk_class: matches the new dominant_risk_class label (legal/operational/etc)
//
// Required true to confirm SIGNAL — prevents claims where the shift is
// numerically supported but the evidence doesn't actually map to the
// dimension being moved.

function newEvidenceIds(): string[] {
  // Union of evidence_ids in v2 (both runs) minus union in v1 (both runs).
  const v1Union = new Set<string>([
    ...collectEvidenceIds(v1r1Raw),
    ...collectEvidenceIds(v1r2Raw),
  ]);
  const v2Union = new Set<string>([
    ...collectEvidenceIds(v2r1Raw),
    ...collectEvidenceIds(v2r2Raw),
  ]);
  return [...v2Union].filter((id) => !v1Union.has(id));
}

function classifyEvidenceText(text: string): {
  stage: boolean;
  controller: boolean;
  legal: boolean;
  operational: boolean;
  technical: boolean;
  economic: boolean;
  stakeholder: boolean;
} {
  const t = text.toLowerCase();
  return {
    stage: /\b(docusign|signer|signed|executed|onboard|kickoff|go[\s-]?live|welcome aboard|implementation start|contract execution)\b/.test(t),
    controller: /\b(cfo|cto|chief financial|chief technology|approver|signer|economic buyer|eb\b|vp\s+(?:of\s+)?finance|treasurer)\b/.test(t),
    legal: /\b(ai indemnit|mnda|redline|legal|liability cap|indemnif|contract dispute|terms)\b/.test(t),
    operational: /\b(onboard|implementation|go[\s-]?live|deploy|admin user|setup|bank matrix|kickoff)\b/.test(t),
    technical: /\b(integration|api|netsuite|mri|workday|connectivity|d365|sftp|bank connect)\b/.test(t),
    economic: /\b(roi|pricing|cost|budget|headcount|fte|discount|net 30)\b/.test(t),
    stakeholder: /\b(champion|silent|absent|disengag|departed|ooo|out of office|never engaged)\b/.test(t),
  };
}

interface DominantAlignment {
  stage: boolean;
  controller: boolean;
  risk_class: boolean;
  rationale: string;
}

function computeAlignment(
  newRiskClass: string
): DominantAlignment {
  if (!v2MergedInput) {
    return {
      stage: false,
      controller: false,
      risk_class: false,
      rationale: "Cannot evaluate — variant2 merged input not provided as 5th arg.",
    };
  }
  const intel = v2MergedInput.intelligence ?? [];
  const idx = new Map<string, IntelligenceRecord>();
  for (const r of intel) idx.set(r.id, r);

  const newIds = newEvidenceIds();
  if (newIds.length === 0) {
    return {
      stage: false,
      controller: false,
      risk_class: false,
      rationale: "No new evidence cited in full vs calls-only.",
    };
  }

  let stageHits = 0;
  let controllerHits = 0;
  const riskClassHits: Record<string, number> = {};

  for (const id of newIds) {
    const rec = idx.get(id);
    if (!rec) continue;
    const text = (rec.summary ?? "") + " " + (rec.quote ?? "");
    const cl = classifyEvidenceText(text);
    if (cl.stage) stageHits++;
    if (cl.controller) controllerHits++;
    for (const k of ["legal", "operational", "technical", "economic", "stakeholder"] as const) {
      if (cl[k]) riskClassHits[k] = (riskClassHits[k] ?? 0) + 1;
    }
  }

  const total = newIds.length;
  // Threshold: at least 50% of resolvable new evidence must hit the
  // dimension's keywords for alignment to be true.
  const stageAlign = stageHits / total >= 0.5;
  const controllerAlign = controllerHits / total >= 0.5;
  const newRiskClassNorm = newRiskClass.toLowerCase();
  const riskClassAlign =
    newRiskClassNorm in riskClassHits &&
    (riskClassHits[newRiskClassNorm] ?? 0) / total >= 0.5;

  return {
    stage: stageAlign,
    controller: controllerAlign,
    risk_class: riskClassAlign,
    rationale: `${total} new evidence ids; stage=${stageHits} controller=${controllerHits} risk_dist=${JSON.stringify(riskClassHits)}`,
  };
}

const alignment = computeAlignment(
  typeof v2Consensus.risk_class.value === "string"
    ? v2Consensus.risk_class.value
    : "unknown"
);

section("Dominant evidence alignment (does new evidence map to the dimension?)");
if (!v2MergedInput) {
  console.log(`\n  (skipped — pass variant2 merged-input as 5th arg to enable)`);
} else {
  console.log(`\n  alignment:  stage=${alignment.stage}  controller=${alignment.controller}  risk_class=${alignment.risk_class}`);
  console.log(`  ${alignment.rationale}`);
  console.log(`\n  SIGNAL gating requires alignment=true on the dimension being claimed.`);
}

// ── Evidence coherence (global directional signal in new evidence) ───────
//
// Beyond per-dimension alignment: does the new evidence as a whole
// point in ONE direction? CCR's case shows new evidence dispersed
// across legal/technical/stakeholder/operational without dominance —
// that's diffuse. WS likely had a coherent dominant bucket.
//
// Gate: if dominance_ratio < 0.4 OR dominant_bucket is "none",
// SIGNAL is blocked on ALL dimensions regardless of per-dimension passes.

interface CoherenceResult {
  dominant_bucket: "stage" | "controller" | "risk_class" | "none";
  dominance_ratio: number;
  total_new_evidence: number;
  bucket_counts: { stage: number; controller: number; risk_class: number };
  classification: "coherent" | "mixed" | "diffuse" | "no_data";
}

function computeCoherence(): CoherenceResult {
  if (!v2MergedInput) {
    return {
      dominant_bucket: "none",
      dominance_ratio: 0,
      total_new_evidence: 0,
      bucket_counts: { stage: 0, controller: 0, risk_class: 0 },
      classification: "no_data",
    };
  }
  const intel = v2MergedInput.intelligence ?? [];
  const idx = new Map<string, IntelligenceRecord>();
  for (const r of intel) idx.set(r.id, r);
  const newIds = newEvidenceIds();
  const total = newIds.filter((id) => idx.has(id)).length;
  if (total === 0) {
    return {
      dominant_bucket: "none",
      dominance_ratio: 0,
      total_new_evidence: 0,
      bucket_counts: { stage: 0, controller: 0, risk_class: 0 },
      classification: "no_data",
    };
  }
  let stageVotes = 0;
  let controllerVotes = 0;
  let riskVotes = 0;
  for (const id of newIds) {
    const rec = idx.get(id);
    if (!rec) continue;
    const text = (rec.summary ?? "") + " " + (rec.quote ?? "");
    const cl = classifyEvidenceText(text);
    if (cl.stage) stageVotes++;
    if (cl.controller) controllerVotes++;
    if (cl.legal || cl.operational || cl.technical || cl.economic || cl.stakeholder)
      riskVotes++;
  }
  const buckets = [
    { name: "stage" as const, count: stageVotes },
    { name: "controller" as const, count: controllerVotes },
    { name: "risk_class" as const, count: riskVotes },
  ];
  buckets.sort((a, b) => b.count - a.count);
  const top = buckets[0];
  if (top.count === 0) {
    return {
      dominant_bucket: "none",
      dominance_ratio: 0,
      total_new_evidence: total,
      bucket_counts: { stage: stageVotes, controller: controllerVotes, risk_class: riskVotes },
      classification: "diffuse",
    };
  }
  const ratio = top.count / total;
  let classification: "coherent" | "mixed" | "diffuse";
  if (ratio >= 0.6) classification = "coherent";
  else if (ratio >= 0.4) classification = "mixed";
  else classification = "diffuse";
  return {
    dominant_bucket: top.name,
    dominance_ratio: ratio,
    total_new_evidence: total,
    bucket_counts: { stage: stageVotes, controller: controllerVotes, risk_class: riskVotes },
    classification,
  };
}

const coherence = computeCoherence();
const coherenceBlocksSignal =
  coherence.classification === "diffuse" ||
  coherence.classification === "no_data" ||
  coherence.dominant_bucket === "none";

section("Evidence coherence (does new evidence point in one direction?)");
console.log(`\n  total new evidence ids:   ${coherence.total_new_evidence}`);
console.log(`  bucket_counts:            stage=${coherence.bucket_counts.stage}  controller=${coherence.bucket_counts.controller}  risk_class=${coherence.bucket_counts.risk_class}`);
console.log(`  dominant_bucket:          ${coherence.dominant_bucket}`);
console.log(`  dominance_ratio:          ${coherence.dominance_ratio.toFixed(2)}`);
console.log(`  classification:           ${coherence.classification}`);
if (coherenceBlocksSignal) {
  console.log(`\n  ⚠ Coherence ${coherence.classification === "no_data" ? "unavailable" : "diffuse/none"} — SIGNAL blocked on ALL dimensions.`);
  console.log(`    New evidence does not point in a single direction; any apparent shift`);
  console.log(`    is suspect because the substrate doesn't support a coherent reframe.`);
} else {
  console.log(`\n  ✓ Coherence is ${coherence.classification} — SIGNAL gating may proceed if other gates pass.`);
}

// ── Counterfactual dependency (does the dimension USE new evidence?) ────
//
// If thesis or risk citations in the v2 artifacts don't actually include
// any new evidence_ids (those that exist in v2 substrate but weren't
// cited in v1 substrate), the shift is sampling variance — same data,
// different sampling — not substrate-driven.

interface CounterfactualResult {
  uses_new_evidence: boolean;
  thesis_uses: boolean;
  risks_use: boolean;
  new_evidence_count: number;
  thesis_overlap: number;
  risk_overlap: number;
}

function computeCounterfactual(): CounterfactualResult {
  const v1Union = new Set<string>([
    ...collectEvidenceIds(v1r1Raw),
    ...collectEvidenceIds(v1r2Raw),
  ]);
  const v2Union = new Set<string>([
    ...collectEvidenceIds(v2r1Raw),
    ...collectEvidenceIds(v2r2Raw),
  ]);
  const newIds = new Set([...v2Union].filter((id) => !v1Union.has(id)));

  const v2ThesisIds = new Set<string>([
    ...(v2r1Raw.deal_thesis?.status === "formed" ? v2r1Raw.deal_thesis.evidence_ids : []),
    ...(v2r2Raw.deal_thesis?.status === "formed" ? v2r2Raw.deal_thesis.evidence_ids : []),
  ]);
  const v2RiskIds = new Set<string>();
  for (const a of [v2r1Raw, v2r2Raw]) {
    for (const r of a.critical_risks ?? []) {
      for (const id of r.evidence_ids ?? []) v2RiskIds.add(id);
    }
  }

  const thesisOverlap = [...v2ThesisIds].filter((id) => newIds.has(id)).length;
  const riskOverlap = [...v2RiskIds].filter((id) => newIds.has(id)).length;

  return {
    uses_new_evidence: thesisOverlap > 0 || riskOverlap > 0,
    thesis_uses: thesisOverlap > 0,
    risks_use: riskOverlap > 0,
    new_evidence_count: newIds.size,
    thesis_overlap: thesisOverlap,
    risk_overlap: riskOverlap,
  };
}

const counterfactual = computeCounterfactual();
const counterfactualBlocksSignal = !counterfactual.uses_new_evidence;

// ── Out-of-schema risk signal (diagnostic flag, not a gate) ─────────────
//
// Distinct failure mode discovered on Cipher: the dominant risk is REAL
// and the model perceives it, but the taxonomy can't represent it. The
// model compresses by oscillating between adjacent buckets (legal,
// economic, technical, operational) — looks like noise but is actually
// schema limitation.
//
// Heuristic: high evidence coherence + alignment false on all dimensions
// + concrete-vs-concrete risk_class disagreement within a variant.
//   - coherent  = the substrate genuinely points in some direction
//   - alignment all false = no dimension cleanly fits the new evidence
//   - within-variant strict-disagree on risk_class = model can't lock
//     on a single bucket even on the same substrate
//
// This is INFORMATIONAL — not a SIGNAL gate. Used to distinguish CCR-class
// (subtype-unstable) from Cipher-class (out-of-schema).
function strictDisagree(a: string, b: string): boolean {
  if (isUnknown(a) || isUnknown(b)) return false;
  return a !== b;
}

const v1RiskOscillates = strictDisagree(
  v1r1.dominant_risk_class,
  v1r2.dominant_risk_class
);
const v2RiskOscillates = strictDisagree(
  v2r1.dominant_risk_class,
  v2r2.dominant_risk_class
);
const anyRiskOscillation = v1RiskOscillates || v2RiskOscillates;

const allAlignmentFalse =
  v2MergedInput !== null &&
  !alignment.stage &&
  !alignment.controller &&
  !alignment.risk_class;

const outOfSchemaRiskSignal =
  coherence.classification === "coherent" &&
  allAlignmentFalse &&
  anyRiskOscillation;

section("Out-of-schema risk signal (diagnostic flag)");
console.log(`\n  conditions:`);
console.log(`    coherence_is_coherent:           ${coherence.classification === "coherent"}`);
console.log(`    all_alignment_false:             ${allAlignmentFalse}${v2MergedInput === null ? "  (n/a — no merged input)" : ""}`);
console.log(`    risk_class_oscillation_concrete: ${anyRiskOscillation}  (v1=${v1RiskOscillates}, v2=${v2RiskOscillates})`);
console.log(`\n  out_of_schema_risk_signal: ${outOfSchemaRiskSignal}`);
if (outOfSchemaRiskSignal) {
  console.log(`\n  ⚠ Dominant risk does not map cleanly to current taxonomy.`);
  console.log(`    The substrate genuinely points in a direction (coherent), but no`);
  console.log(`    dimension's keywords match the new evidence — and within-variant`);
  console.log(`    risk_class oscillates between concrete buckets. Model is compressing`);
  console.log(`    an unrepresented risk class into nearest-available adjacent buckets.`);
  console.log(`    Diagnose risk_class verdict as OUT_OF_SCHEMA, not NOISE.`);
  console.log(`    DO NOT extend taxonomy yet — wait for ≥2 deals showing this signal`);
  console.log(`    before adding new risk_class buckets.`);
} else {
  console.log(`\n  ✓ Risk classification fits within current taxonomy (no compression artifact).`);
}

section("Counterfactual dependency (does the dimension use new evidence?)");
console.log(`\n  total new evidence ids (v2 \\ v1):   ${counterfactual.new_evidence_count}`);
console.log(`  thesis citations using new evidence: ${counterfactual.thesis_overlap} (${counterfactual.thesis_uses ? "yes" : "no"})`);
console.log(`  risk citations using new evidence:   ${counterfactual.risk_overlap} (${counterfactual.risks_use ? "yes" : "no"})`);
console.log(`  uses_new_evidence:                   ${counterfactual.uses_new_evidence}`);
if (counterfactualBlocksSignal) {
  console.log(`\n  ⚠ Counterfactual fails — v2 artifacts cite NO new evidence not present in v1.`);
  console.log(`    Apparent shift is sampling variance, not substrate-driven. SIGNAL blocked on all dimensions.`);
} else {
  console.log(`\n  ✓ V2 artifacts cite new evidence — shift could be substrate-driven if other gates pass.`);
}

// ── Signal verdict per dimension (consensus-gated, fragility-aware) ──────
//
// Consensus + fragility gated rule:
//   SIGNAL if gap=different AND fragility=low on BOTH variants AND reliability=high
//   STABLE if gap=same AND reliability=high
//   NOISE  if reliability=low OR consensus is no_consensus on either side
//   INSUFFICIENT_DATA otherwise (medium reliability, fragile consensus on a shift)
//
// SIGNAL also gets a delta_strength label:
//   strong   = stage shift, OR controller shift between two concrete actors
//   moderate = risk_class shift with low fragility on both
//   weak     = anything else that still met the SIGNAL bar
section("Signal verdict per dimension (consensus-gated, fragility-aware)");

type DeltaStrength = "weak" | "moderate" | "strong";

function deltaStrength(
  dim: "controller" | "stage" | "risk_class",
  c1: Consensus,
  c2: Consensus
): DeltaStrength {
  if (dim === "stage") return "strong";
  if (dim === "controller") {
    // Strong if both sides are concrete distinct actors (not Multi/Unknown/no_consensus).
    // Multi-to-something or something-to-Multi gets moderate — the boundary is fuzzier.
    const isConcreteActor = (v: string): boolean =>
      v !== "Multi" && v !== "Unknown" && v !== "no_consensus";
    if (isConcreteActor(c1.value as string) && isConcreteActor(c2.value as string)) {
      return "strong";
    }
    return "moderate";
  }
  if (dim === "risk_class") return "moderate";
  return "weak";
}

interface DimensionVerdict {
  dimension: "controller" | "stage" | "risk_class";
  reliability: Reliability;
  v1_consensus: Consensus;
  v2_consensus: Consensus;
  v1_fragility: Fragility;
  v2_fragility: Fragility;
  gap: GapType;
  verdict: "SIGNAL" | "NOISE" | "STABLE" | "INSUFFICIENT_DATA";
  delta_strength?: DeltaStrength;
  rationale: string;
}

function downgrade(s: DeltaStrength): DeltaStrength {
  if (s === "strong") return "moderate";
  if (s === "moderate") return "weak";
  return "weak";
}

function verdictFor(
  dim: "controller" | "stage" | "risk_class",
  rel: Reliability,
  c1: Consensus,
  c2: Consensus,
  f1: Fragility,
  f2: Fragility,
  g: GapType,
  alignmentForDim: boolean,
  alignmentAvailable: boolean,
  parity: "balanced" | "skewed",
  coherenceBlocks: boolean,
  counterfactualBlocks: boolean,
  temporalMovesForward: boolean | null
): DimensionVerdict {
  const base = {
    dimension: dim,
    reliability: rel,
    v1_consensus: c1,
    v2_consensus: c2,
    v1_fragility: f1,
    v2_fragility: f2,
    gap: g,
  };

  if (rel === "low") {
    return {
      ...base,
      verdict: "NOISE",
      rationale:
        "Within-variant disagreement makes this dimension unreliable. Cannot claim any between-variant shift as substrate-driven.",
    };
  }
  if (g === "no_consensus") {
    return {
      ...base,
      verdict: "NOISE",
      rationale:
        "At least one variant has runs disagreeing on different concrete values — no consensus to compare against.",
    };
  }

  // SIGNAL eligibility: requires ALL of:
  //   - gap=different
  //   - low fragility on both variants
  //   - high reliability
  //   - dominant_evidence_alignment[dim] = true
  //   - evidence_coherence not blocking (not diffuse/none)
  //   - counterfactual_dependency not blocking (v2 actually uses new evidence)
  // delta_strength is downgraded one level if parity=skewed
  if (g === "different" && f1 === "low" && f2 === "low" && rel === "high") {
    if (coherenceBlocks) {
      return {
        ...base,
        verdict: "INSUFFICIENT_DATA",
        rationale:
          "Otherwise SIGNAL-eligible but evidence_coherence is diffuse/none — new evidence does not point in a single direction. SIGNAL blocked globally.",
      };
    }
    if (counterfactualBlocks) {
      return {
        ...base,
        verdict: "INSUFFICIENT_DATA",
        rationale:
          "Otherwise SIGNAL-eligible but counterfactual fails — v2 artifacts don't cite new evidence (vs v1). Apparent shift is sampling variance, not substrate-driven.",
      };
    }
    if (!alignmentAvailable) {
      return {
        ...base,
        verdict: "INSUFFICIENT_DATA",
        rationale:
          "Otherwise SIGNAL-eligible (gap=different, low fragility, high reliability) but dominant_evidence_alignment is unavailable (no merged input passed). Re-run with variant2 merged input as 5th arg.",
      };
    }
    // Dimension-specific alignment rule.
    //
    // Stage is temporal, not categorical: it's validated by DIRECTION
    // (approval → execution is forward motion in time), not by whether
    // the new evidence is dominantly stage-flavored. Closing emails
    // legitimately carry stage + risk + operational signal together;
    // demanding stage-keyword dominance in those mixed packets misses
    // real transitions. So if temporal.moves_forward=true AND gap=different
    // (we're already inside that branch) AND both variants are 2/2
    // (already required), stage alignment is satisfied — even when the
    // strict keyword-dominance test fails.
    //
    // Controller and risk_class stay on strict alignment. Those are
    // categorical, not temporal — different actor / different bucket
    // requires evidence that explicitly maps to the new value.
    const stageRelaxedPath =
      dim === "stage" && temporalMovesForward === true;
    const alignmentSatisfied = alignmentForDim || stageRelaxedPath;
    if (!alignmentSatisfied) {
      return {
        ...base,
        verdict: "INSUFFICIENT_DATA",
        rationale: `Otherwise SIGNAL-eligible but dominant_evidence_alignment.${dim} = false. New evidence does not map to this dimension — apparent shift may be incidental rather than substrate-driven.`,
      };
    }
    let strength = deltaStrength(dim, c1, c2);
    let parityNote = "";
    if (parity === "skewed") {
      strength = downgrade(strength);
      parityNote = " (delta_strength downgraded: parity_flag=skewed — full has ≥2× evidence)";
    }
    const alignmentNote = alignmentForDim
      ? `evidence aligns to ${dim}`
      : `${dim} alignment satisfied via temporal direction (approval→execution forward, both 2/2)`;
    return {
      ...base,
      verdict: "SIGNAL",
      delta_strength: strength,
      rationale:
        `Passed ALL gates: gap=different, low fragility both sides, high reliability, ${alignmentNote}, coherence ${coherence.classification}, counterfactual passes.${parityNote}`,
    };
  }
  if (g === "same" && rel === "high") {
    return {
      ...base,
      verdict: "STABLE",
      rationale:
        "Same consensus value across variants, high reliability — substrate richness did not move this dimension.",
    };
  }
  // Special case: gap=different but at least one side has high fragility
  if (g === "different" && (f1 === "high" || f2 === "high")) {
    return {
      ...base,
      verdict: "INSUFFICIENT_DATA",
      rationale: `Apparent shift (${c1.value} → ${c2.value}) but consensus is fragile (v1=${f1}, v2=${f2}). Cannot claim SIGNAL until both variants reach 2/2 support.`,
    };
  }
  return {
    ...base,
    verdict: "INSUFFICIENT_DATA",
    rationale:
      "Mixed evidence: gap is " +
      g +
      ", fragility (v1=" +
      f1 +
      ", v2=" +
      f2 +
      "), reliability is " +
      rel +
      ". Need more runs or stronger consensus to disambiguate.",
  };
}

const alignmentAvailable = v2MergedInput !== null;
const ctrlVerdict = verdictFor(
  "controller",
  ctrlRel.reliability,
  v1Consensus.controller,
  v2Consensus.controller,
  fragilityV1.controller,
  fragilityV2.controller,
  gap.controller,
  alignment.controller,
  alignmentAvailable,
  parityFlag,
  coherenceBlocksSignal,
  counterfactualBlocksSignal,
  temporal.moves_forward
);
const stageVerdict = verdictFor(
  "stage",
  stageRel.reliability,
  v1Consensus.stage,
  v2Consensus.stage,
  fragilityV1.stage,
  fragilityV2.stage,
  gap.stage,
  alignment.stage,
  alignmentAvailable,
  parityFlag,
  coherenceBlocksSignal,
  counterfactualBlocksSignal,
  temporal.moves_forward
);
const riskVerdict = verdictFor(
  "risk_class",
  riskRel.reliability,
  v1Consensus.risk_class,
  v2Consensus.risk_class,
  fragilityV1.risk_class,
  fragilityV2.risk_class,
  gap.risk_class,
  alignment.risk_class,
  alignmentAvailable,
  parityFlag,
  coherenceBlocksSignal,
  counterfactualBlocksSignal,
  temporal.moves_forward
);

function badge(v: DimensionVerdict): string {
  if (v.verdict === "SIGNAL") {
    const ds = v.delta_strength ? `  [${v.delta_strength}]` : "";
    return `✓ SIGNAL${ds}`;
  }
  if (v.verdict === "STABLE") return "✓ STABLE";
  if (v.verdict === "NOISE") return "⚠ NOISE";
  return "△ INSUFFICIENT_DATA";
}

for (const v of [ctrlVerdict, stageVerdict, riskVerdict]) {
  console.log(`\n  ${v.dimension}:  ${badge(v)}  (reliability: ${v.reliability}, gap: ${v.gap})`);
  console.log(`    v1 consensus: ${v.v1_consensus.value} (support ${v.v1_consensus.support}/2, fragility ${v.v1_fragility})`);
  console.log(`    v2 consensus: ${v.v2_consensus.value} (support ${v.v2_consensus.support}/2, fragility ${v.v2_fragility})`);
  console.log(`    ${v.rationale}`);
}

// ── Final summary: SIGNAL dimensions need temporal consistency check ────
const signalDimensions = [ctrlVerdict, stageVerdict, riskVerdict].filter(
  (v) => v.verdict === "SIGNAL"
);
if (signalDimensions.length > 0 && temporal.regression_flag) {
  section("⚠ SIGNAL + REGRESSION INCOMPATIBILITY");
  console.log("\n  Dimensions claimed SIGNAL above:");
  for (const v of signalDimensions) {
    console.log(`    - ${v.dimension} (${v.delta_strength ?? "?"})`);
  }
  console.log("\n  But temporal_consistency.regression_flag=true — full version went BACKWARD in stage.");
  console.log("  Suspect: substrate richness is producing a reframe that doesn't match temporal reality.");
  console.log("  → Re-inspect SIGNAL claims; treat them as questionable until regression is explained.");
}

console.log("");
header("Multi-run analysis complete");
