import SetupForm from "./SetupForm";

/**
 * /sdr/setup — the customer configures their governed inbound-SDR agent.
 * Auth-gated by middleware; the form talks to /api/sdr/config (tenant-scoped).
 */
export const dynamic = "force-dynamic";

export default function SdrSetupPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f1ea",
        color: "#1a2230",
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6b7689",
          }}
        >
          Mallín · AI SDR
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Configure your inbound agent
        </h1>
        <p style={{ margin: "0 0 28px", fontSize: 15, color: "#6b7689", lineHeight: 1.5 }}>
          Your agent qualifies website visitors against this rubric and acts on the
          decision — work now, nurture, or pass. This is what it uses; nothing
          here, nothing it does.
        </p>
        <SetupForm />
      </div>
    </main>
  );
}
