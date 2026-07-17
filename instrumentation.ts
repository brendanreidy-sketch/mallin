/**
 * Diagnostic-only server-error capture (Sub-step 2A).
 *
 * `onRequestError` is Next.js's hook for server-side errors across both the
 * data and render phases, and is our PRIMARY server-error capture mechanism.
 * Caveat (per review): Next.js may hand this hook a wrapped or normalized error
 * rather than the untouched original — so we defensively preserve every field
 * that is present rather than assuming an un-minified original exception.
 *
 * Captured: error name, message, stack, digest, route (path), request method,
 * and — when Next provides them — route type, render source/type, router kind.
 * Combined with the [CKPT] lines from lib/diag/checkpoint.ts, this gives the
 * last successful checkpoint plus the failing exception.
 *
 * Redaction: this NEVER reads request.headers, cookies, tokens, request bodies,
 * emails, or deal content. Only the fields listed above are logged.
 *
 * REMOVE once /cockpit and /prep root-cause evidence is captured.
 */
export function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context?: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
    renderSource?: string;
    renderType?: string;
  },
): void {
  // Non-throwing by contract: the diagnostic hook must never throw or affect
  // error handling. Only specific, extracted primitive fields are logged — the
  // raw error/request/context objects are never serialized wholesale.
  try {
    const e = (error ?? {}) as {
      name?: string;
      message?: string;
      stack?: string;
      digest?: string;
    };
    // eslint-disable-next-line no-console
    console.error(
      "[SRVERR] " +
        JSON.stringify({
          route: request?.path ?? context?.routePath ?? null,
          method: request?.method ?? null,
          routerKind: context?.routerKind ?? null,
          routeType: context?.routeType ?? null,
          renderSource: context?.renderSource ?? null,
          renderType: context?.renderType ?? null,
          errorName: e.name ?? null,
          errorMessage: e.message ?? null,
          digest: e.digest ?? null,
          stack:
            typeof e.stack === "string"
              ? e.stack.split("\n").slice(0, 25).join("\n")
              : null,
        }),
    );
  } catch {
    /* no-op: diagnostic capture never throws or affects error handling */
  }
}
