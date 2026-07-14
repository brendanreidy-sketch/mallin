/**
 * Instant loading skeleton for /new (intake). Paints immediately on navigation
 * to the "new deal / add a call" form while the server resolves the tenant +
 * existing deals, so the click feels responsive.
 */
export default function NewLoading() {
  const block = (w: string, h: number, extra: Record<string, unknown> = {}) => ({
    width: w,
    height: h,
    borderRadius: 8,
    background: "rgba(26,34,48,0.08)",
    animation: "ckpulse 1.1s ease-in-out infinite",
    ...extra,
  });
  return (
    <div style={{ minHeight: "100vh", background: "#f4f1ea", padding: "40px 22px" }}>
      <style>{`@keyframes ckpulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div style={block("40%", 28)} />
        <div style={{ ...block("70%", 16), marginTop: 16 }} />
        <div style={{ ...block("100%", 48), marginTop: 30 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
          <div style={block("100%", 52)} />
          <div style={block("100%", 52)} />
          <div style={block("100%", 200, { background: "#fff", border: "1px solid rgba(26,34,48,0.08)" })} />
          <div style={block("100%", 52, { background: "rgba(26,34,48,0.14)" })} />
        </div>
      </div>
    </div>
  );
}
