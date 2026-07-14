/**
 * Client helpers for the governed-gesture surface (/api/cockpit-action).
 * Shared by HowYouWin (confirm / acknowledge) and StakeholderEngagement
 * (flag a wrong stakeholder). Both fire-and-forget on write and hydrate
 * prior state on mount so a ✓ survives reload.
 */

export type CockpitActionType =
  | "strategy_confirmed"
  | "risk_acknowledged"
  | "stakeholder_flagged";

export type FlagReason =
  | "wrong_person"
  | "wrong_role"
  | "no_longer_here"
  | "not_involved";

export interface RecordedAction {
  action_type: CockpitActionType;
  target_ref: string | null;
  reason: FlagReason | null;
  detail: Record<string, unknown>;
  created_at: string;
}

/**
 * Record a gesture. Best-effort: resolves true on a 200, false otherwise
 * (network error, no deal, not accessible). Callers apply the ✓ optimistically
 * regardless — losing one gesture is low-stakes — but can use the result to
 * surface a soft "couldn't save" hint if they choose.
 */
export async function recordCockpitAction(input: {
  dealId: string | null;
  actionType: CockpitActionType;
  targetRef?: string;
  reason?: FlagReason;
  detail?: Record<string, unknown>;
}): Promise<boolean> {
  // Deal-less briefs (static fixtures) can't persist — let the UI go
  // optimistic-only rather than firing a doomed request.
  if (!input.dealId) return false;
  try {
    const resp = await fetch("/api/cockpit-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealId: input.dealId,
        actionType: input.actionType,
        targetRef: input.targetRef,
        reason: input.reason,
        detail: input.detail,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Hydrate this rep's prior gestures for a deal. Returns [] on any failure. */
export async function fetchCockpitActions(
  dealId: string | null,
): Promise<RecordedAction[]> {
  if (!dealId) return [];
  try {
    const resp = await fetch(
      `/api/cockpit-action?dealId=${encodeURIComponent(dealId)}`,
      { cache: "no-store" },
    );
    if (!resp.ok) return [];
    const body = (await resp.json()) as { actions?: RecordedAction[] };
    return body.actions ?? [];
  } catch {
    return [];
  }
}
