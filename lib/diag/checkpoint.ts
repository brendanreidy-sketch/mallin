/**
 * Diagnostic-only checkpoint logger (Sub-step 2A).
 *
 * Behavior-preserving: pure logging, no control flow, no data access, no return
 * value that anything branches on. Emits only the route + a STATIC checkpoint
 * name, so the "last successful checkpoint" before a failure is visible in the
 * server runtime log.
 *
 * Redaction: never logs tokens, cookies, headers, request bodies, emails, or
 * deal content — only the fixed strings passed here.
 *
 * REMOVE once /cockpit and /prep root-cause evidence is captured.
 */
export function ckpt(route: string, name: string): void {
  // Non-throwing by contract: if console is unavailable or the write fails, we
  // swallow it. A diagnostic must never throw or alter the request/response.
  try {
    // eslint-disable-next-line no-console
    console.log(`[CKPT] ${route} :: ${name}`);
  } catch {
    /* no-op: diagnostics never affect application behavior */
  }
}
