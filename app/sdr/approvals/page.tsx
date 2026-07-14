import ApprovalsInbox from "./ApprovalsInbox";

/**
 * /sdr/approvals — the human approval inbox. Actions the agent queued under an
 * "approve" policy land here for a person to clear; approving executes the
 * held effect for real. Closes the governed-autonomy loop.
 */
export const dynamic = "force-dynamic";

export default function SdrApprovalsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f1ea",
        color: "#1a2230",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7689" }}>
          Mallín · AI SDR
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Approvals
        </h1>
        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#6b7689", lineHeight: 1.5 }}>
          Your agent acts on its own for low-stakes moves. Anything you marked
          &ldquo;approve&rdquo; waits here. Approving runs it for real.
        </p>
        <ApprovalsInbox />
      </div>
    </main>
  );
}
