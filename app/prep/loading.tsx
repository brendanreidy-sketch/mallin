/**
 * Instant loading skeleton for /prep.
 *
 * /prep is force-dynamic and does real DB work per navigation, so without this
 * the previous page just froze on click. With a loading.tsx, the App Router
 * paints this the instant a <Link> is clicked — navigation feels immediate
 * while the brief renders behind it. Self-contained neutral styling (no theme
 * context needed at this boundary); mirrors the cockpit's rough shape so the
 * real page settling in doesn't jump.
 */
export default function PrepLoading() {
  const bar = (w: string, h = 14) => ({
    width: w,
    height: h,
    borderRadius: 6,
    background: "rgba(26,34,48,0.08)",
    animation: "ckpulse 1.1s ease-in-out infinite",
  });
  return (
    <div style={{ minHeight: "100vh", background: "#f4f1ea", padding: "40px 22px" }}>
      <style>{`@keyframes ckpulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* header */}
        <div style={bar("90px", 12)} />
        <div style={{ ...bar("58%", 34), marginTop: 18 }} />
        <div style={{ ...bar("74%", 16), marginTop: 16 }} />
        {/* two-column body */}
        <div style={{ display: "flex", gap: 20, marginTop: 34 }}>
          <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...bar("100%", 120), background: "#fff", border: "1px solid rgba(26,34,48,0.08)" }} />
            <div style={{ ...bar("100%", 90), background: "#fff", border: "1px solid rgba(26,34,48,0.08)" }} />
            <div style={{ ...bar("100%", 160), background: "#fff", border: "1px solid rgba(26,34,48,0.08)" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={bar("100%", 44)} />
            <div style={bar("100%", 44)} />
            <div style={bar("100%", 44)} />
            <div style={bar("80%", 44)} />
          </div>
        </div>
      </div>
    </div>
  );
}
