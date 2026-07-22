/**
 * brief-change-detection — deterministic "what changed since last time" for the
 * INTERNAL executive deal brief (Commit 1 foundation; hardened 1A; finalized 1B).
 *
 * Pure TypeScript. No LLM, no clock. It diffs two `EvidencePacket`s (current vs
 * the immediately-prior snapshot) by LOGICAL KEY using the items' TYPED payloads
 * (never claim prose), matching the same fact across snapshots via a stable key,
 * and emits a typed `ChangeSet`.
 *
 * ── Change ASSURANCE (separate axis from provenance) ───────────────────────
 *   observed    — a recorded observation moved (seller/system/customer record),
 *                 or a done/missed state carries explicit proof.
 *   inferred    — a Mallín conclusion moved (posture, risk, disposition, or a
 *                 done/missed state recorded without external proof).
 *   conflicting — sources disagree on the value.
 *   unresolved  — value missing / Not-confirmed, or a commitment merely
 *                 disappeared (disappearance is NOT proof of completion).
 *
 * ── Commitments ────────────────────────────────────────────────────────────
 * A deliverable vanishing does NOT prove completion (could be deleted,
 * reworded, consolidated, superseded, or omitted). So:
 *   - present → absent          ⇒ commitment_removed, assurance unresolved.
 *   - state → "done"            ⇒ commitment_completed (observed iff stateEvidence).
 *   - state → "missed"          ⇒ commitment_missed  (observed iff stateEvidence).
 *   - open past `expectedBy`    ⇒ commitment_missed (inferred) ONLY when an
 *                                 explicit `asOf` date is passed in.
 *
 * ── Ordering ───────────────────────────────────────────────────────────────
 * current must be provably newer: strict capturedAt, else an immutable
 * `sequence` tie-breaker on equal timestamps. Otherwise an explicit unresolved
 * `ordering` diagnostic + empty changes — never a silent "nothing changed".
 */

import {
  comparableValue,
  packComponents,
  type EvidenceItem,
  type EvidencePacket,
  type EvidencePayload,
  type Provenance,
} from "@/lib/deck/brief-evidence";

export type BriefChangeType =
  | "new_transcript_evidence"
  | "stage_change"
  | "amount_change"
  | "close_date_change"
  | "next_action_change"
  | "posture_change"
  | "stakeholder_position_change"
  | "stakeholder_role_change"
  | "risk_new"
  | "risk_resolved"
  | "risk_worsened"
  | "commitment_completed"
  | "commitment_missed"
  | "commitment_removed";

export type ChangeAssurance = "observed" | "inferred" | "conflicting" | "unresolved";

export interface BriefChange {
  /** Deterministic id — a pure function of the (unique) logicalKey. */
  changeId: string;
  type: BriefChangeType;
  logicalKey: string;
  /** Stable cross-snapshot keys of the source fact(s) behind this change. */
  sourceFactKeys: string[];
  previousValue: string | null;
  currentValue: string | null;
  previousEvidenceIds: string[];
  currentEvidenceIds: string[];
  effectiveDate: string | null;
  assurance: ChangeAssurance;
}

export interface OrderingDiagnostic {
  resolved: boolean;
  basis: "timestamp" | "sequence" | "none";
  detail: string;
}

export interface ChangeSet {
  tenantId: string;
  dealId: string;
  ordering: OrderingDiagnostic;
  hasPriorState: boolean;
  changes: BriefChange[];
  superseded: EvidenceItem[];
}

/** Options for the pure diff. `asOf` is the explicit current date used for
 *  date-based miss inference — never read from the system clock. */
export interface DetectChangesOptions {
  asOf?: string; // ISO
}

const SEVERITY_RANK: Record<string, number> = { medium: 1, high: 2, blocking: 3 };

/** Deterministic, collision-safe change id from immutable change coordinates.
 *  Fact-key groups are sorted (reorder-invariant) and length-prefix packed
 *  (delimiter-safe); it never depends on display prose. The prev-group length
 *  is packed too, so the prev/current boundary is unambiguous. */
export function changeIdFor(
  tenantId: string,
  dealId: string,
  logicalKey: string,
  previousFactKeys: string[],
  currentFactKeys: string[],
): string {
  const prev = [...new Set(previousFactKeys)].sort(cmp);
  const cur = [...new Set(currentFactKeys)].sort(cmp);
  return "chg:" + packComponents([tenantId, dealId, logicalKey, String(prev.length), ...prev, ...cur]);
}

export function resolveOrdering(
  current: EvidencePacket,
  previous: EvidencePacket | null,
): OrderingDiagnostic {
  if (!previous) return { resolved: false, basis: "none", detail: "No prior snapshot on record." };
  if (previous.capturedAt < current.capturedAt) {
    return { resolved: true, basis: "timestamp", detail: `previous ${previous.capturedAt} < current ${current.capturedAt}` };
  }
  if (previous.capturedAt > current.capturedAt) {
    return {
      resolved: false, basis: "none",
      detail: `Provided 'previous' (${previous.capturedAt}) is newer than 'current' (${current.capturedAt}); ordering unresolved.`,
    };
  }
  if (previous.sequence != null && current.sequence != null && previous.sequence !== current.sequence) {
    if (previous.sequence < current.sequence) {
      return { resolved: true, basis: "sequence", detail: `equal capturedAt; sequence ${previous.sequence} < ${current.sequence}` };
    }
    return {
      resolved: false, basis: "none",
      detail: `Equal capturedAt; 'previous' sequence (${previous.sequence}) is newer than 'current' (${current.sequence}); ordering unresolved.`,
    };
  }
  return {
    resolved: false, basis: "none",
    detail: `Equal capturedAt (${current.capturedAt}) with no immutable tie-breaker; ordering unresolved.`,
  };
}

export function detectChanges(
  current: EvidencePacket,
  previous: EvidencePacket | null,
  options: DetectChangesOptions = {},
): ChangeSet {
  const ordering = resolveOrdering(current, previous);
  const shell: ChangeSet = {
    tenantId: current.tenantId, dealId: current.dealId, ordering,
    hasPriorState: ordering.resolved, changes: [], superseded: [],
  };
  if (!ordering.resolved || !previous) return shell;

  const curByKey = groupByKey(current.items);
  const prevByKey = groupByKey(previous.items);
  const keys = new Set<string>([...curByKey.keys(), ...prevByKey.keys()]);

  const changes: BriefChange[] = [];
  const superseded: EvidenceItem[] = [];

  for (const key of [...keys].sort(cmp)) {
    if (key.startsWith("txn:")) continue;
    const cur = curByKey.get(key) ?? [];
    const prev = prevByKey.get(key) ?? [];
    const curVal = representativeValue(cur);
    const prevVal = representativeValue(prev);

    const change = classify(key, cur, prev, curVal, prevVal, options.asOf, current.capturedAt, current.tenantId, current.dealId);
    if (!change) continue;
    changes.push(change);
    if (prev.length && curVal.value !== prevVal.value) {
      for (const p of prev) superseded.push({ ...p, status: "superseded" });
    }
  }

  // New transcript evidence.
  const prevTxn = new Set(previous.items.filter((i) => i.sourceType === "transcript").map((i) => i.sourceRecordId));
  const newTxnIds = new Set<string>();
  for (const i of current.items) {
    if (i.sourceType === "transcript" && !prevTxn.has(i.sourceRecordId)) newTxnIds.add(i.sourceRecordId);
  }
  for (const txnId of [...newTxnIds].sort(cmp)) {
    const backing = current.items.filter((i) => i.sourceType === "transcript" && i.sourceRecordId === txnId);
    changes.push({
      changeId: changeIdFor(current.tenantId, current.dealId, `txn:${txnId}`, [], backing.map((b) => b.sourceFactKey)),
      type: "new_transcript_evidence",
      logicalKey: `txn:${txnId}`,
      sourceFactKeys: uniq(backing.map((b) => b.sourceFactKey)),
      previousValue: null,
      currentValue: `${backing.length} new statement${backing.length === 1 ? "" : "s"} on record`,
      previousEvidenceIds: [],
      currentEvidenceIds: backing.map((b) => b.evidenceId).sort(cmp),
      effectiveDate: backing.map((b) => b.sourceDate).filter((d): d is string => !!d).sort(cmp).slice(-1)[0] ?? current.capturedAt,
      assurance: assuranceForItems(backing),
    });
  }

  changes.sort((a, b) => (a.type === b.type ? cmp(a.logicalKey, b.logicalKey) : cmp(a.type, b.type)));
  superseded.sort((a, b) => cmp(a.evidenceId, b.evidenceId));
  return { ...shell, changes, superseded };
}

// ── classification ──────────────────────────────────────────────────────────

interface RepValue {
  value: string | null;
  ids: string[];
  factKeys: string[];
  provenances: Provenance[];
  conflicting: boolean;
}

function representativeValue(items: EvidenceItem[]): RepValue {
  if (items.length === 0) return { value: null, ids: [], factKeys: [], provenances: [], conflicting: false };
  const distinct = [...new Set(items.map((i) => comparableValue(i.payload)))].sort(cmp);
  const ids = items.map((i) => i.evidenceId).sort(cmp);
  const factKeys = uniq(items.map((i) => i.sourceFactKey));
  const provenances = [...new Set(items.map((i) => i.provenance))];
  if (distinct.length > 1) return { value: `CONFLICT: ${distinct.join(" | ")}`, ids, factKeys, provenances, conflicting: true };
  return { value: distinct[0], ids, factKeys, provenances, conflicting: false };
}

function payloadKind(cur: EvidenceItem[], prev: EvidenceItem[]): EvidencePayload["kind"] | null {
  return cur[0]?.payload.kind ?? prev[0]?.payload.kind ?? null;
}

function commitmentPayload(item?: EvidenceItem): Extract<EvidencePayload, { kind: "commitment" }> | null {
  return item?.payload.kind === "commitment" ? item.payload : null;
}

function classify(
  key: string,
  cur: EvidenceItem[],
  prev: EvidenceItem[],
  curVal: RepValue,
  prevVal: RepValue,
  asOf: string | undefined,
  capturedAt: string,
  tenantId: string,
  dealId: string,
): BriefChange | null {
  const base = {
    changeId: changeIdFor(tenantId, dealId, key, prevVal.factKeys, curVal.factKeys),
    logicalKey: key,
    sourceFactKeys: uniq([...prevVal.factKeys, ...curVal.factKeys]),
    previousValue: prevVal.value,
    currentValue: curVal.value,
    previousEvidenceIds: prevVal.ids,
    currentEvidenceIds: curVal.ids,
    effectiveDate: effectiveDate(cur, prev, capturedAt),
    assurance: assurance(curVal),
  };
  const kind = payloadKind(cur, prev);

  if (kind === "risk") {
    if (cur.length && !prev.length) return { ...base, type: "risk_new" };
    if (!cur.length && prev.length) return { ...base, type: "risk_resolved" };
    const curRank = SEVERITY_RANK[curVal.value ?? ""] ?? 0;
    const prevRank = SEVERITY_RANK[prevVal.value ?? ""] ?? 0;
    if (curRank > prevRank) return { ...base, type: "risk_worsened" };
    return null;
  }

  if (kind === "commitment") {
    // A bare disappearance is NOT proof of completion.
    if (prev.length && !cur.length) return { ...base, type: "commitment_removed", assurance: "unresolved" };
    if (!prev.length) return null; // newly-appearing commitment: not a tracked change
    const prevP = commitmentPayload(prev[0]);
    const curP = commitmentPayload(cur[0]);
    const prevState = prevP?.state;
    const curState = curP?.state;
    if (curState === "done" && prevState !== "done") {
      return { ...base, type: "commitment_completed", assurance: curP?.stateEvidence ? "observed" : "inferred" };
    }
    if (curState === "missed" && prevState !== "missed") {
      return { ...base, type: "commitment_missed", assurance: curP?.stateEvidence ? "observed" : "inferred" };
    }
    // Date-based miss inference — only with an explicit asOf date.
    if (curState === "open" && asOf && curP?.expectedBy && curP.expectedBy < asOf) {
      return { ...base, type: "commitment_missed", assurance: "inferred" };
    }
    return null;
  }

  if (!cur.length) return null;
  if (curVal.value === prevVal.value) return null;
  const t = typeForKey(key);
  return t ? { ...base, type: t } : null;
}

function typeForKey(key: string): BriefChangeType | null {
  if (key === "opp:stage") return "stage_change";
  if (key === "opp:amount") return "amount_change";
  if (key === "opp:closeDate") return "close_date_change";
  if (key === "deal:nextAction") return "next_action_change";
  if (key === "deal:posture") return "posture_change";
  if (key.startsWith("stk:") && key.endsWith(":disposition")) return "stakeholder_position_change";
  if (key.startsWith("stk:") && key.endsWith(":role")) return "stakeholder_role_change";
  return null;
}

function assurance(curVal: RepValue): ChangeAssurance {
  if (curVal.conflicting) return "conflicting";
  if (curVal.provenances.includes("open_question") || curVal.value == null) return "unresolved";
  if (curVal.provenances.length > 0 && curVal.provenances.every((p) => p === "mallin_inference")) return "inferred";
  return "observed";
}

function assuranceForItems(items: EvidenceItem[]): ChangeAssurance {
  const provs = [...new Set(items.map((i) => i.provenance))];
  if (provs.includes("open_question")) return "unresolved";
  if (provs.length > 0 && provs.every((p) => p === "mallin_inference")) return "inferred";
  return "observed";
}

/** Effective date: newest source date on the moving side (current preferred,
 *  else previous), falling back to the snapshot's capturedAt ("recorded as
 *  of"). Never fabricated beyond a real snapshot/source coordinate. */
function effectiveDate(cur: EvidenceItem[], prev: EvidenceItem[], capturedAt: string): string | null {
  const pick = (items: EvidenceItem[]) =>
    items.map((i) => i.sourceDate).filter((d): d is string => !!d).sort(cmp).slice(-1)[0] ?? null;
  return pick(cur) ?? pick(prev) ?? capturedAt ?? null;
}

function groupByKey(items: EvidenceItem[]): Map<string, EvidenceItem[]> {
  const m = new Map<string, EvidenceItem[]>();
  for (const i of items) {
    const arr = m.get(i.logicalKey);
    if (arr) arr.push(i);
    else m.set(i.logicalKey, [i]);
  }
  return m;
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)].sort(cmp);
}
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
