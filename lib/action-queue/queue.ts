/**
 * ============================================================================
 *  Action queue — helper API
 * ============================================================================
 *
 *  Server-side functions for managing queue items. Callers:
 *    - Cockpit surfaces (EmailComposer, SuggestedUpdates, risks) enqueue
 *    - /api/queue/* routes list / approve / dismiss / defer
 *    - The ActionQueue panel on /prep reads via listForDeal
 *
 *  This module ONLY manages queue state. Execution lives in
 *  lib/action-queue/executors.ts so the state machine and the side-effects
 *  stay separable + testable.
 * ============================================================================
 */

import { supabaseAdmin } from "@/lib/db/client";
import type {
  ActionStatus,
  EnqueueInput,
  ExecutionResult,
  QueuedAction,
} from "./types";

const TABLE = "action_queue";

// ─── Reads ─────────────────────────────────────────────────────────────────
/**
 * Pending + recently-actioned queue for a deal. Returns rows in any
 * non-terminal state plus rows executed/failed in the last 24h (so the
 * rep sees what just happened). Sorted: pending first, then by
 * queued_at desc.
 */
export async function listForDeal(
  opportunityCandidates: string[],
  opts: { limit?: number } = {},
): Promise<QueuedAction[]> {
  const candidates = opportunityCandidates.filter(Boolean);
  if (candidates.length === 0) return [];

  const limit = Math.min(opts.limit ?? 25, 100);
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .in("opportunity_id", candidates)
    // queued + approved_pending always shown; executed/failed only if recent
    .or(
      `status.in.(queued,approved_pending,deferred),and(status.in.(executed,failed),executed_at.gte.${cutoff24h})`,
    )
    .order("status", { ascending: true })
    .order("queued_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(`[action-queue] listForDeal failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as QueuedAction[];
}

/**
 * Fetch a single queue row by id. Used by approve/dismiss/defer routes
 * so they can validate ownership + state before mutating.
 */
export async function getById(
  id: string,
  tenantId: string,
): Promise<QueuedAction | null> {
  // tenant_id is part of the WHERE clause, not a post-fetch comparison —
  // a row owned by another tenant is simply not found, so callers can't
  // forget the isolation check.
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as QueuedAction;
}

// ─── Writes ────────────────────────────────────────────────────────────────
/**
 * Add a new item to the queue. Returns the inserted row. Throws on DB
 * failure — caller (a route handler) should catch and surface a 500.
 */
export async function enqueue(input: EnqueueInput): Promise<QueuedAction> {
  const row = {
    tenant_id: input.tenant_id,
    user_id: input.user_id,
    opportunity_id: input.opportunity_id ?? null,
    action_type: input.payload.type,
    payload: input.payload,
    rationale: input.rationale ?? null,
    source_surface: input.source_surface ?? null,
    source_item_id: input.source_item_id ?? null,
    status: "queued" as ActionStatus,
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `[action-queue] enqueue failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return data as QueuedAction;
}

/**
 * Mark an item dismissed. Idempotent; calling twice doesn't error.
 */
export async function dismiss(
  id: string,
  dismissedByUserId: string,
  tenantId: string,
): Promise<QueuedAction | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: "dismissed",
      approved_by_user_id: dismissedByUserId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) {
    console.warn(`[action-queue] dismiss failed: ${error.message}`);
    return null;
  }
  return (data as QueuedAction) ?? null;
}

/**
 * Mark an item deferred to a future timestamp.
 */
export async function defer(
  id: string,
  deferUntil: string,
  deferredByUserId: string,
  tenantId: string,
): Promise<QueuedAction | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: "deferred",
      deferred_until: deferUntil,
      approved_by_user_id: deferredByUserId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) {
    console.warn(`[action-queue] defer failed: ${error.message}`);
    return null;
  }
  return (data as QueuedAction) ?? null;
}

/**
 * Mark an item approved (state = approved_pending). The caller then
 * runs the executor, and on resolution calls completeApproval or
 * markFailed.
 */
export async function markApproved(
  id: string,
  approvedByUserId: string,
  tenantId: string,
): Promise<QueuedAction | null> {
  // The status guard makes this the optimistic lock: the UPDATE only
  // matches a row still in an approvable state, so two concurrent
  // approvals can't both transition it — the loser matches 0 rows and
  // gets null back, preventing a double-execute. tenant_id scopes it.
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: "approved_pending",
      approved_at: new Date().toISOString(),
      approved_by_user_id: approvedByUserId,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .in("status", ["queued", "deferred"])
    .select()
    .maybeSingle();
  if (error) {
    console.warn(`[action-queue] markApproved failed: ${error.message}`);
    return null;
  }
  // No row matched → another request already moved it out of an
  // approvable state (or it's not this tenant's). Treat as "lost the race".
  return (data as QueuedAction) ?? null;
}

/**
 * Write the execution result to a row that was previously approved.
 * Sets status='executed' on success or 'failed' on failure, and
 * captures the execution provenance (executor + external object).
 */
export async function recordExecution(
  id: string,
  result: ExecutionResult,
): Promise<QueuedAction | null> {
  const updates: Record<string, unknown> = {
    status: result.ok ? "executed" : "failed",
    executed_at: new Date().toISOString(),
    executor: result.executor,
    external_object_id: result.external_object_id ?? null,
    external_object_type: result.external_object_type ?? null,
    external_object_url: result.external_object_url ?? null,
    result: result.result ?? null,
    error: result.error ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.warn(`[action-queue] recordExecution failed: ${error.message}`);
    return null;
  }
  return data as QueuedAction;
}
