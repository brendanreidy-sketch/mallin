"use client";

/**
 * Error boundary for /prep. A malformed artifact (e.g. a missing field the
 * render maps over) could otherwise throw during the server render and surface
 * as a raw server exception — see the post_call_synthesis crash (digest
 * 2133762913). This catches any segment render error and shows a controlled
 * message + retry instead. The underlying error is never shown to the user.
 */
export default function PrepError({ reset }: { error: unknown; reset: () => void }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--ck-paper)",
        color: "var(--ck-ink-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          padding: "32px 32px 28px",
          background: "var(--ck-surface)",
          border: "0.5px solid var(--ck-rule)",
          borderRadius: 14,
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(26, 34, 48, 0.05)",
        }}
      >
        <p
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--ck-ink)",
            margin: "0 0 8px",
          }}
        >
          We couldn&apos;t load this deal&apos;s brief just now.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 20px" }}>
          Something went wrong preparing this view. Your data is safe — this is a
          display issue on our side.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ck-paper)",
              background: "var(--ck-ink)",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/cockpit"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ck-ink)",
              background: "transparent",
              border: "0.5px solid var(--ck-rule)",
              borderRadius: 8,
              padding: "10px 18px",
              textDecoration: "none",
            }}
          >
            Back to deals
          </a>
        </div>
      </div>
    </main>
  );
}
