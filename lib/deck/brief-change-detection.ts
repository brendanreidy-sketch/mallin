/**
 * brief-change-detection — deterministic "what changed since last time" for the
 * INTERNAL executive deal brief (Commit 1 foundation, hardened in Commit 1A).
 *
 * Pure TypeScript. No LLM. It diffs two `EvidencePacket`s (current vs the
 * immediately-prior snapshot) by LOGICAL KEY using the items' TYPED payloads
 * (never claim prose) and emits a typed `ChangeSet`.
 *
 * ── Change ASSURANCE is a separate axis from provenance ────────────────────
 *   observed    — a recorded observation moved (seller/system/customer record).
 *                 A seller-entered or system-recorded change is observed, NOT
 *                 "customer confirmed".
 *   inferred    — a Mallín conclusion moved (posture, risk, disposition…).
 *   conflicting — sources disagree on the value (kept visibly conflicting).
 *   unresolved  — the value is missing / Not-confirmed / unsupported.
 *
 * ── Ordering ───────────────────────────────────────────────────────────────
 * "current" must be provably newer than "previous":
 *   1. capturedAt strictly greater  → resolved by "timestamp".
 *   2. equal capturedAt, both carry an immutable ledger `sequence` that
 *      differs → resolved by "sequence".
 *   3. otherwise (no prior, equal timestamps without a tie-breaker, or a
 *      mis-ordered pair) → UNRESOLVED. The ChangeSet carries an explicit
 *      `ordering` diagnostic and empty changes — a consumer must check
 *      `ordering.resolved`; it must NOT read empty changes as "nothing
 *      changed".
 *
 * Superseded prior evidence is retained (status "superseded"), never dropped
 * and never treated as current. Conflicts are surfaced, never auto-resolved.
 */

import {
  comparableValue,
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
  | "commitment_missed";

export type ChangeAssurance = "observed" | "inferred" | "conflicting" | "unresolved";

export interface BriefChange {
  type: BriefChangeType;
  logicalKey: string;
  previousValue: string | null;
  currentValue: string | null;
  previousEvidenceIds: string[];
  currentEvidenceIds: string[];
  effectiveDate: string | null;
  assurance: ChangeAssurance;
}

export interface OrderingDiagnostic {
  /** True only when current is provably newer than previous. */
  resolved: boolean;
  basis: "timestamp" | "sequence" | "none";
  detail: string;
}

export interface ChangeSet {
  tenantId: string;
  dealId: string;
  /** Explicit ordering result — consult before interpreting `changes`. */
  ordering: OrderingDiagnostic;
  /** True iff a prior snapshot exists AND ordering resolved. */
  hasPriorState: boolean;
  changes: BriefChange[];
  superseded: EvidenceItem[];
}

const SEVERITY_RANK: Record<string, number> = { medium: 1, high: 2, blocking: 3 };

/** Establish whether `current` is provably newer than `previous`. */
export function resolveOrdering(
  current: EvidencePacket,
  previous: EvidencePacket | null,
): OrderingDiagnostic {
  if (!previous) {
    return { resolved: false, basis: "none", detail: "No prior snapshot on record." };
  }
  if (previous.capturedAt < current.capturedAt) {
    return { resolved: true, basis: "timestamp", detail: `previous ${previous.capturedAt} < current ${current.capturedAt}` };
  }
  if (previous.capturedAt > current.capturedAt) {
    return {
      resolved: false,
      basis: "none",
      detail: `Provided 'previous' (${previous.capturedAt}) is newer than 'current' (${current.capturedAt}); ordering unresolved.`,
    };
  }
  // Equal timestamps — require an immutable tie-breaker.
  if (previous.sequence != null && current.sequence != null && previous.sequence !== current.sequence) {
    if (previous.sequence < current.sequence) {
      return { resolved: true, basis: "sequence", detail: `equal capturedAt; sequence ${previous.sequence} < ${current.sequence}` };
    }
    return {
      resolved: false,
      basis: "none",
      detail: `Equal capturedAt; 'previous' sequence (${previous.sequence}) is newer than 'current' (${current.sequence}); ordering unresolved.`,
    };
  }
  return {
    resolved: false,
    basis: "none",
    detail: `Equal capturedAt (${current.capturedAt}) with no immutable tie-breaker; ordering unresolved.`,
  };
}

export function detectChanges(current: EvidencePacket, previous: EvidencePacket | null): ChangeSet {
  const ordering = resolveOrdering(current, previous);
  const shell: ChangeSet = {
    tenantId: current.tenantId,
    dealId: current.dealId,
    ordering,
    hasPriorState: ordering.resolved,
    changes: [],
    superseded: [],
  };
  if (!ordering.resolved || !previous) return shell;

  const curByKey = groupByKey(current.items);
  const prevByKey = groupByKey(previous.items);
  const keys = new Set<string>([...curByKey.keys(), ...prevByKey.keys()]);

  const changes: BriefChange[] = [];
  const superseded: EvidenceItem[] = [];

  for (const key of [...keys].sort(cmp)) {
    if (key.startsWith("txn:")) continue; // transcript statements handled below
    const cur = curByKey.get(key) ?? [];
    const prev = prevByKey.get(key) ?? [];

    const curVal = representativeValue(cur);
    const prevVal = representativeValue(prev);

    const change = classify(key, cur, prev, curVal, prevVal, current.capturedAt);
    if (!change) continue;

    changes.push(change);
    if (prev.length && curVal.value !== prevVal.value) {
      for (const p of prev) superseded.push({ ...p, status: "superseded" });
    }
  }

  // New transcript evidence: transcript ids present now but not before.
  const prevTxn = new Set(
    previous.items.filter((i) => i.sourceType === "transcript").map((i) => i.sourceRecordId),
  );
  const newTxnIds = new Set<string>();
  for (const i of current.items) {
    if (i.sourceType === "transcript" && !prevTxn.has(i.sourceRecordId)) newTxnIds.add(i.sourceRecordId);
  }
  for (const txnId of [...newTxnIds].sort(cmp)) {
    const backing = current.items.filter((i) => i.sourceType === "transcript" && i.sourceRecordId === txnId);
    changes.push({
      type: "new_transcript_evidence",
      logicalKey: `txn:${txnId}`,
      previousValue: null,
      currentValue: `${backing.length} new statement${backing.length === 1 ? "" : "s"} on record`,
      previousEvidenceIds: [],
      currentEvidenceIds: backing.map((b) => b.id).sort(cmp),
      effectiveDate: backing.map((b) => b.sourceDate).filter((d): d is string => !!d).sort(cmp).slice(-1)[0] ?? current.capturedAt,
      assurance: assuranceForItems(backing),
    });
  }

  changes.sort((a, b) => (a.type === b.type ? cmp(a.logicalKey, b.logicalKey) : cmp(a.type, b.type)));
  superseded.sort((a, b) => cmp(a.id, b.id));

  return { ...shell, changes, superseded };
}

// ── classification ──────────────────────────────────────────────────────────

interface RepValue {
  value: string | null;
  ids: string[];
  provenances: Provenance[];
  conflicting: boolean;
}

function representativeValue(items: EvidenceItem[]): RepValue {
  if (items.length === 0) return { value: null, ids: [], provenances: [], conflicting: false };
  const distinct = [...new Set(items.map((i) => comparableValue(i.payload)))].sort(cmp);
  const ids = items.map((i) => i.id).sort(cmp);
  const provenances = [...new Set(items.map((i) => i.provenance))];
  if (distinct.length > 1) {
    return { value: `CONFLICT: ${distinct.join(" | ")}`, ids, provenances, conflicting: true };
  }
  return { value: distinct[0], ids, provenances, conflicting: false };
}

function payloadKind(cur: EvidenceItem[], prev: EvidenceItem[]): EvidencePayload["kind"] | null {
  return cur[0]?.payload.kind ?? prev[0]?.payload.kind ?? null;
}

function classify(
  key: string,
  cur: EvidenceItem[],
  prev: EvidenceItem[],
  curVal: RepValue,
  prevVal: RepValue,
  capturedAt: string,
): BriefChange | null {
  const base = {
    logicalKey: key,
    previousValue: prevVal.value,
    currentValue: curVal.value,
    previousEvidenceIds: prevVal.ids,
    currentEvidenceIds: curVal.ids,
    effectiveDate: effectiveDate(cur, capturedAt),
    assurance: assurance(curVal),
  };
  const kind = payloadKind(cur, prev);

  // Risks — presence + severity movement (typed).
  if (kind === "risk") {
    if (cur.length && !prev.length) return { ...base, type: "risk_new" };
    if (!cur.length && prev.length) return { ...base, type: "risk_resolved" };
    const curRank = SEVERITY_RANK[curVal.value ?? ""] ?? 0;
    const prevRank = SEVERITY_RANK[prevVal.value ?? ""] ?? 0;
    if (curRank > prevRank) return { ...base, type: "risk_worsened" };
    return null;
  }

  // Commitments — completed (explicit done OR removed) / missed (typed).
  if (kind === "commitment") {
    const prevP = prev[0]?.payload;
    const curP = cur[0]?.payload;
    const prevState = prevP?.kind === "commitment" ? prevP.state : undefined;
    const curState = curP?.kind === "commitment" ? curP.state : undefined;
    // Completed: explicit open → done, or the deliverable left the "waiting on" list.
    if (prevState === "open" && curState === "done") return { ...base, type: "commitment_completed" };
    if (prev.length && !cur.length) return { ...base, type: "commitment_completed" };
    // Missed: still open past its expected date (only when a date exists).
    if (prevState === "open" && curState === "open") {
      const expectedBy = curP?.kind === "commitment" ? curP.expectedBy : null;
      if (expectedBy && expectedBy < capturedAt) return { ...base, type: "commitment_missed" };
    }
    return null;
  }

  // Everything else — a typed value diff.
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

/** Assurance for a value change — the current side decides. */
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

function effectiveDate(cur: EvidenceItem[], capturedAt: string): string | null {
  const dates = cur.map((i) => i.sourceDate).filter((d): d is string => !!d).sort(cmp);
  return dates.slice(-1)[0] ?? capturedAt ?? null;
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

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
