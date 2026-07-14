/**
 * ============================================================================
 *  Time-slicer — "substrate as it stood at call N"
 * ============================================================================
 *
 *  Component [1] of the drift-detection harness (docs/drift-detection-harness.md
 *  §5). Given a substrate-full.json and a call boundary, emit the substrate as
 *  it existed at the moment of that call — the temporal slice the pipeline then
 *  turns into "what Mallin believed at call N."
 *
 *  This authors NO new substrate (intake_primitive_doctrine). It is a PURE
 *  FILTER over an existing fixture: keep every call / email / activity / meeting
 *  whose timestamp is <= the cutoff call's started_at; drop everything after.
 *
 *  LEAKAGE GUARD (the whole point):
 *    opportunity.{stage_label, stage_position, deal_posture, last_activity_at}
 *    in the full fixture encode the FINAL CRM state. Carrying them into an
 *    early slice would leak the future (e.g. Clenera's stage_label is
 *    "Late-stage / Best-and-final + competitive eval (vs GTreasury)" — that
 *    reveals the competitor AND that the deal reached best-and-final).
 *
 *    For Form A (temporal drift), the model must form its thesis BLIND from the
 *    calls/emails present at call N — so these fields are NEUTRALIZED by
 *    default: stage_label/stage_position/deal_posture -> null, and
 *    last_activity_at -> the slice cutoff. The historical stage is not
 *    recoverable from the fixture anyway; the canonical stage classifier infers
 *    it from the call content, which is correct.
 *
 *    --preserve-crm-belief turns neutralization OFF. That is the Form B
 *    (CRM-belief drift) setting — "CRM stage IS what you believed" — and must
 *    only ever be used with the LATEST slice, never an early one. Off by default.
 *
 *  Usage:
 *    npx tsx scripts/slice-substrate.ts <substrate-full.json> --at <call_id> [--out <path>]
 *    npx tsx scripts/slice-substrate.ts <substrate-full.json> --at <call_id> --verify
 *    npx tsx scripts/slice-substrate.ts <substrate-full.json> --list
 *
 *  Flags:
 *    --at <call_id>          cutoff call (inclusive). Slice = events <= its started_at.
 *    --out <path>            write sliced substrate JSON here (default: stdout summary only)
 *    --verify                assert no retained event post-dates the cutoff; print a leak report
 *    --preserve-crm-belief   do NOT neutralize opportunity CRM fields (Form B only)
 *    --list                  print the call boundaries (id + date) and exit
 * ============================================================================
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Dated {
  id: string;
  [k: string]: unknown;
}
interface Substrate {
  opportunity?: Record<string, unknown>;
  account?: Record<string, unknown>;
  calls?: Array<Dated & { started_at?: string }>;
  emails?: Array<Dated & { sent_at?: string }>;
  activities?: Array<Dated & { occurred_at?: string }>;
  meetings?: Array<Dated & { started_at?: string; occurred_at?: string }>;
  [k: string]: unknown;
}

function ts(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = Date.parse(v);
  return Number.isNaN(n) ? null : n;
}

// ── arg parse ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const inputPath = argv.find((a) => !a.startsWith("--"));
function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const has = (name: string) => argv.includes(name);

if (!inputPath) {
  console.error(
    "Usage: npx tsx scripts/slice-substrate.ts <substrate-full.json> --at <call_id> [--out <path>] [--verify] [--preserve-crm-belief]\n" +
      "       npx tsx scripts/slice-substrate.ts <substrate-full.json> --list"
  );
  process.exit(1);
}

const sub = JSON.parse(readFileSync(resolve(inputPath), "utf-8")) as Substrate;
const calls = (sub.calls ?? [])
  .slice()
  .sort((a, b) => (ts(a.started_at) ?? 0) - (ts(b.started_at) ?? 0));

if (has("--list")) {
  console.log(`Call boundaries in ${inputPath}:`);
  for (const c of calls) console.log(`  ${c.id}\t${c.started_at ?? "(no date)"}`);
  process.exit(0);
}

const atCall = flag("--at");
if (!atCall) {
  console.error("Missing --at <call_id>. Use --list to see boundaries.");
  process.exit(1);
}
const cutoffCall = calls.find((c) => c.id === atCall);
if (!cutoffCall) {
  console.error(
    `Call '${atCall}' not found. Boundaries: ${calls.map((c) => c.id).join(", ")}`
  );
  process.exit(1);
}
const cutoffRaw = ts(cutoffCall.started_at);
if (cutoffRaw === null) {
  console.error(`Cutoff call '${atCall}' has no parseable started_at.`);
  process.exit(1);
}
// Narrowed binding: TS doesn't carry the null-guard into the closures below.
const cutoff: number = cutoffRaw;
const cutoffISO = new Date(cutoff).toISOString();

// ── filter: keep events at-or-before the cutoff ───────────────────────────
function keepBy<T extends Dated>(
  rows: T[] | undefined,
  field: (r: T) => unknown
): { kept: T[]; dropped: T[] } {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const r of rows ?? []) {
    const t = ts(field(r));
    // No timestamp -> conservatively DROP (cannot prove it predates cutoff).
    if (t !== null && t <= cutoff) kept.push(r);
    else dropped.push(r);
  }
  return { kept, dropped };
}

const callRes = keepBy(calls, (c) => c.started_at);
const emailRes = keepBy(sub.emails, (e) => e.sent_at);
const actRes = keepBy(sub.activities, (a) => a.occurred_at);
const meetRes = keepBy(sub.meetings, (m) => m.started_at ?? m.occurred_at);

// ── neutralize forward-looking CRM-belief fields (Form A default) ─────────
const preserveCrm = has("--preserve-crm-belief");
const opp = { ...(sub.opportunity ?? {}) } as Record<string, unknown>;
const neutralized: string[] = [];
if (!preserveCrm && sub.opportunity) {
  for (const f of ["stage_label", "stage_position", "deal_posture"]) {
    if (opp[f] !== null && opp[f] !== undefined) {
      opp[f] = null;
      neutralized.push(f);
    }
  }
  // last_activity_at -> the cutoff (the latest event the slice actually knows).
  opp.last_activity_at = cutoffISO;
  neutralized.push("last_activity_at→cutoff");
}

const sliced: Substrate = {
  ...sub,
  opportunity: opp,
  calls: callRes.kept,
  emails: emailRes.kept,
  activities: actRes.kept,
  meetings: meetRes.kept,
};

// ── verify: no retained event post-dates the cutoff ───────────────────────
if (has("--verify")) {
  const leaks: string[] = [];
  const check = <T extends Dated>(rows: T[], field: (r: T) => unknown, kind: string) => {
    for (const r of rows) {
      const t = ts(field(r));
      if (t === null) leaks.push(`${kind} ${r.id}: no timestamp (retained — review)`);
      else if (t > cutoff)
        leaks.push(`${kind} ${r.id}: ${new Date(t).toISOString()} > cutoff`);
    }
  };
  check(sliced.calls!, (c) => c.started_at, "call");
  check(sliced.emails!, (e) => e.sent_at, "email");
  check(sliced.activities!, (a) => a.occurred_at, "activity");
  check(sliced.meetings!, (m) => m.started_at ?? m.occurred_at, "meeting");

  // CRM-belief leak check (only when we claim to have neutralized).
  if (!preserveCrm) {
    for (const f of ["stage_label", "stage_position", "deal_posture"]) {
      if (opp[f] !== null && opp[f] !== undefined)
        leaks.push(`opportunity.${f} not neutralized: ${JSON.stringify(opp[f])}`);
    }
  }

  console.log(`\nLEAKAGE VERIFY — slice @ ${atCall} (${cutoffISO})`);
  if (leaks.length === 0) {
    console.log("  ✓ clean: every retained event is <= cutoff; CRM-belief fields neutralized.");
  } else {
    console.log(`  ✗ ${leaks.length} leak(s):`);
    for (const l of leaks) console.log(`    - ${l}`);
    process.exitCode = 2;
  }
}

// ── report + write ────────────────────────────────────────────────────────
console.log(`\nSLICE @ ${atCall} (${cutoffISO})  [${preserveCrm ? "CRM-belief preserved (Form B)" : "Form A: CRM-belief neutralized"}]`);
console.log(
  `  calls       ${callRes.kept.length}/${calls.length}   (dropped: ${callRes.dropped.map((c) => c.id).join(", ") || "none"})`
);
console.log(
  `  emails      ${emailRes.kept.length}/${(sub.emails ?? []).length}   (dropped: ${emailRes.dropped.map((e) => e.id).join(", ") || "none"})`
);
console.log(
  `  activities  ${actRes.kept.length}/${(sub.activities ?? []).length}   (dropped: ${actRes.dropped.map((a) => a.id).join(", ") || "none"})`
);
console.log(
  `  meetings    ${meetRes.kept.length}/${(sub.meetings ?? []).length}`
);
if (neutralized.length) console.log(`  neutralized: ${neutralized.join(", ")}`);

const outPath = flag("--out");
if (outPath) {
  writeFileSync(resolve(outPath), JSON.stringify(sliced, null, 2));
  console.log(`  → wrote ${outPath}`);
}
