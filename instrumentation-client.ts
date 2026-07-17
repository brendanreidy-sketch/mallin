/**
 * DIAGNOSTIC ONLY — first-client-exception capture (Sub-step C).
 *
 * Next.js runs `instrumentation-client.ts` after the HTML loads but BEFORE React
 * hydration begins, so this hooks `error` / `unhandledrejection` early enough to
 * catch the very first client exception on the dynamic-render routes (`/`,
 * `/sign-in`). Pair with `productionBrowserSourceMaps: true` so the stack maps
 * to real files and lines.
 *
 * Redaction (never logged): cookies, tokens, headers, emails, session objects,
 * arbitrary rejection values, or complete URLs with query strings. Filenames and
 * stack frames are stripped of `?query`. A non-Error rejection logs ONLY its
 * JavaScript type — never `String(reason)`, which could carry sensitive data.
 *
 * Emits one `[CLIENTERR] {json}` line per event. REMOVE once the `/` and
 * `/sign-in` client stacks are captured.
 */

const MSG_MAX = 500; // cap any single message string
const STACK_MAX = 4000; // cap total stack characters
const STACK_LINES = 30; // cap stack to 30 frames

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…[truncated]" : s;
}

// Drop any `?query` from a file URL/path (item 3.2 + item 6: no query strings).
function stripQuery(s: string): string {
  return s.split("?")[0];
}

function cleanStack(stack: unknown): string | null {
  if (typeof stack !== "string") return null;
  const noQuery = stack.replace(/\?[^\s):]*/g, ""); // strip ?dpl=… from chunk URLs
  return trunc(noQuery.split("\n").slice(0, STACK_LINES).join("\n"), STACK_MAX);
}

function emit(record: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line no-console
    console.error("[CLIENTERR] " + JSON.stringify(record));
  } catch {
    /* no-op: diagnostics never throw or alter behavior */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "error",
    (e: ErrorEvent) => {
      const err: unknown = e.error;
      emit({
        tag: "error",
        name: err instanceof Error ? err.name : null,
        message: typeof e.message === "string" ? trunc(e.message, MSG_MAX) : null,
        filename: typeof e.filename === "string" ? stripQuery(e.filename) : null,
        line: typeof e.lineno === "number" ? e.lineno : null,
        col: typeof e.colno === "number" ? e.colno : null,
        stack: err instanceof Error ? cleanStack(err.stack) : null,
      });
    },
    true,
  );

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason: unknown = e.reason;
    if (reason instanceof Error) {
      emit({
        tag: "unhandledrejection",
        name: reason.name,
        message: trunc(reason.message, MSG_MAX),
        stack: cleanStack(reason.stack),
      });
    } else {
      // Not an Error: log ONLY the JavaScript type, never the value itself.
      emit({ tag: "unhandledrejection", reasonType: typeof reason });
    }
  });
}
