/**
 * Instant loading skeleton for /cockpit (the "All deals" home). Paints the
 * moment a <Link> back to the deals list is clicked, so navigation feels
 * immediate instead of the prior page hanging while the server renders.
 */
export default function CockpitLoading() {
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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={block("30%", 28)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={block("100%", 72, {
                background: "#fff",
                border: "1px solid rgba(26,34,48,0.08)",
              })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
