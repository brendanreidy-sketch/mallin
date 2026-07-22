/**
 * brief-change-detection — deterministic "what changed since last time" for the
 * INTERNAL executive deal brief (Commit 1 foundation).
 *
 * Pure TypeScript. No LLM. It diffs two `EvidencePacket`s (current vs the
 * immediately-prior snapshot) by LOGICAL KEY and emits a typed `ChangeSet`.
 * It never compares narrative summaries — only sourced, keyed evidence.
 *
 * Canonical ordering rules (how "current" and "previous" are established):
 *   1. The caller passes the two most-recent snapshots, current = newest.
 *   2. This function verifies `previous.capturedAt < current.capturedAt`
 *      (strictly earlier). If previous is null, equal-timestamped, or somehow
 *      newer/mis-ordered, there is NO reliable prior state → it returns an
 *      empty ChangeSet rather than inventing a change.
 *   3. Superseded evidence is retained, not deleted: for every changed logical
 *      key, the prior packet's item(s) are returned in `superseded` with
 *      status "superseded" so the brief can show "was → now" without treating
 *      the old value as current.
 *   4. Conflicting sources are never silently resolved: when a key carries more
 *      than one differing value on a side, the value is rendered as a
 *      "CONFLICT: a | b" string and any resulting change is assurance
 *      "conflicting".
 *   5. Missing source dates never block a value comparison; `effectiveDate`
 *      falls back to the current snapshot's `capturedAt`, or null.
 */

import type { EvidenceItem, EvidencePacket, Provenance } from "@/lib/deck/brief-evidence";

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

/** How much we trust the change itself. */
export type ChangeAssurance = "confirmed" | "inferred" | "conflicting" | "unresolved";

export interface BriefChange {
  type: BriefChangeType;
  logicalKey: string;
  previousValue: string | null;
  currentValue: string | null;
  previousEvidenceIds: string[];
  currentEvidenceIds: string[];
  /** ISO date the change took effect, or null when genuinely unknowable. */
  effectiveDate: string | null;
  assurance: ChangeAssurance;
}

export interface ChangeSet {
  tenantId: string;
  dealId: string;
  /** False when there was no reliable prior snapshot (first brief, mis-order,
   *  or duplicate timestamp) — in which case `changes` is empty by design. */
  hasPriorState: boolean;
  changes: BriefChange[];
  /** Prior-snapshot items whose logical key changed — retained, marked
   *  superseded, never treated as current. */
  superseded: EvidenceItem[];
}

const SEVERITY_RANK: Record<string, number> = { medium: 1, high: 2, blocking: 3 };

/** Detect deterministic changes between the current and previous packets. */
export function detectChanges(
  current: EvidencePacket,
  previous: EvidencePacket | null,
): ChangeSet {
  const empty: ChangeSet = {
    tenantId: current.tenantId,
    dealId: current.dealId,
    hasPriorState: false,
    changes: [],
    superseded: [],
  };

  // Rule 2: no reliable prior state → no invented changes.
  if (!previous) return empty;
  if (!(previous.capturedAt < current.capturedAt)) return empty;

  const curByKey = groupByKey(current.items);
  const prevByKey = groupByKey(previous.items);
  const keys = new Set<string>([...curByKey.keys(), ...prevByKey.keys()]);

  const changes: BriefChange[] = [];
  const superseded: EvidenceItem[] = [];

  for (const key of [...keys].sort(cmp)) {
    const cur = curByKey.get(key) ?? [];
    const prev = prevByKey.get(key) ?? [];

    // Transcript excerpts are point-in-time; handle them in a dedicated pass.
    if (key.startsWith("txn:")) continue;

    const curVal = representativeValue(cur);
    const prevVal = representativeValue(prev);

    const change = classify(key, cur, prev, curVal, prevVal, current.capturedAt);
    if (!change) continue;

    changes.push(change);
    // Rule 3: retain the prior item(s) as superseded when a value actually moved.
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
    const backing = current.items.filter(
      (i) => i.sourceType === "transcript" && i.sourceRecordId === txnId,
    );
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

  return { tenantId: current.tenantId, dealId: current.dealId, hasPriorState: true, changes, superseded };
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
  const distinct = [...new Set(items.map((i) => normValue(i)))].sort(cmp);
  const ids = items.map((i) => i.id).sort(cmp);
  const provenances = [...new Set(items.map((i) => i.provenance))];
  if (distinct.length > 1) {
    return { value: `CONFLICT: ${distinct.join(" | ")}`, ids, provenances, conflicting: true };
  }
  return { value: distinct[0], ids, provenances, conflicting: false };
}

/** The comparable value of an item: prefer structured meta/support value,
 *  fall back to the normalized claim. */
function normValue(i: EvidenceItem): string {
  if (i.meta?.severity) return i.meta.severity;
  if (i.meta?.state) return i.meta.state;
  if (i.support.value != null) return i.support.value;
  return i.claim;
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
    assurance: assurance(curVal, prevVal),
  };

  // Risks: presence + severity movement.
  if (key.startsWith("risk:")) {
    if (cur.length && !prev.length) return { ...base, type: "risk_new" };
    if (!cur.length && prev.length) return { ...base, type: "risk_resolved" };
    const curRank = SEVERITY_RANK[curVal.value ?? ""] ?? 0;
    const prevRank = SEVERITY_RANK[prevVal.value ?? ""] ?? 0;
    if (curRank > prevRank) return { ...base, type: "risk_worsened" };
    return null; // unchanged or de-escalated (not in the required set)
  }

  // Commitments: derive completed / missed from raw state + expected date.
  if (key.startsWith("commit:")) {
    const prevState = prev[0]?.meta?.state;
    const curItem = cur[0];
    const curState = curItem?.meta?.state;
    if (prevState === "open" && curState === "done") {
      return { ...base, type: "commitment_completed" };
    }
    if (prevState === "open" && curState === "open") {
      const expectedBy = curItem?.meta?.expectedBy;
      if (expectedBy && expectedBy < capturedAt) return { ...base, type: "commitment_missed" };
    }
    return null;
  }

  // Everything else is a value diff; skip when unchanged or key vanished.
  if (!cur.length) return null;
  if (curVal.value === prevVal.value) return null;
  if (!prev.length) {
    // A newly-appearing non-risk key (e.g. first-ever posture) — only surface
    // the categories the brief cares about; otherwise stay silent.
    const t = typeForKey(key);
    return t ? { ...base, type: t } : null;
  }

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

/** Assurance from the change's evidence (Rule 4 for conflicts). */
function assurance(curVal: RepValue, prevVal: RepValue): ChangeAssurance {
  if (curVal.conflicting || prevVal.conflicting) return "conflicting";
  if (curVal.provenances.includes("open_question") || curVal.value == null) return "unresolved";
  if (curVal.provenances.length === 1 && curVal.provenances[0] === "mallin_inference") return "inferred";
  if (curVal.provenances.every((p) => p === "mallin_inference")) return "inferred";
  return "confirmed";
}

function assuranceForItems(items: EvidenceItem[]): ChangeAssurance {
  const provs = [...new Set(items.map((i) => i.provenance))];
  if (provs.includes("open_question")) return "unresolved";
  if (provs.length === 1 && provs[0] === "mallin_inference") return "inferred";
  return "confirmed";
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
