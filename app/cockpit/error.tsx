"use client";

/**
 * Error boundary for /cockpit. The deals-home renders every deal in the tenant
 * together, so a single malformed artifact could otherwise throw and take down
 * the whole page (as happened before the restore). This catches any render
 * error in the segment and shows a controlled message + retry instead of a raw
 * server exception. The underlying error is never shown to the user.
 */
export default function CockpitError({ reset }: { error: unknown; reset: () => void }) {
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
          We couldn&apos;t load your deals just now.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.55, margin: "0 0 20px" }}>
          Something went wrong preparing this view. Your data is safe — this is a
          display issue on our side.
        </p>
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
      </div>
    </main>
  );
}
