import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Async-local attribution for model-cost telemetry.
 *
 * The brief pipeline runs many model calls across several agents (Pass 0/2/4,
 * call extraction). Those agents don't take a tenantId — so instead of threading
 * one through every agent signature, the pipeline wraps its run in
 * withUsageContext({ tenantId, opportunityId }); logUsage() (called deep inside
 * the agents) reads the context and attributes each call's cost to the right
 * tenant. AsyncLocalStorage propagates through awaited calls, so the context is
 * visible everywhere the pipeline's async stack reaches.
 *
 * Purely additive: if no context is set (an agent called outside the pipeline,
 * a test), logUsage still logs — it just doesn't persist a per-tenant row.
 */
export interface UsageContext {
  tenantId: string;
  opportunityId?: string | null;
}

const storage = new AsyncLocalStorage<UsageContext>();

/** Run `fn` with tenant/deal attribution available to logUsage() deeper in the
 *  async call stack. */
export function withUsageContext<T>(ctx: UsageContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The active attribution, or undefined outside a withUsageContext run. */
export function currentUsageContext(): UsageContext | undefined {
  return storage.getStore();
}
