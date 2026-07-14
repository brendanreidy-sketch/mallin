/**
 * SimModeBanner — sticky banner on /prep when the user's tenant
 * has is_demo=true.
 *
 * Surfaces simulation mode to the rep so they know:
 *   - Nothing they do here writes to Gmail / Salesforce / HubSpot / Slack
 *   - Actions return success but are no-ops
 *   - The cockpit otherwise reflects the real product surface
 *
 * Renders nothing when isDemo=false so production tenants don't see it.
 */
export default function SimModeBanner({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 70,
        background: "#1a2230",
        color: "#f4f1ea",
        padding: "10px 24px",
        fontSize: 13,
        fontWeight: 500,
        textAlign: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        letterSpacing: "0.005em",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        borderBottom: "1px solid rgba(244, 241, 234, 0.08)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#88b8d0",
          flexShrink: 0,
          animation: "simPulse 2.4s ease-in-out infinite",
        }}
      />
      <span>
        <strong style={{ fontWeight: 700, color: "#88b8d0" }}>
          Simulation mode
        </strong>{" "}
        · no Gmail sends · no CRM writes · no Slack DMs · fictional deal data
      </span>
      <style>{`
        @keyframes simPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(136, 184, 208, 0.55); }
          50% { box-shadow: 0 0 0 5px rgba(136, 184, 208, 0); }
        }
      `}</style>
    </div>
  );
}
