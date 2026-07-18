import Link from "next/link";

/**
 * Settings entry point for signed-in surfaces (cockpit, prep). A styled link to
 * the existing /settings/integrations page (Gmail + HubSpot connect), so reps
 * can reach it from the two primary screens without mounting the full app
 * sidebar. Styling mirrors <AppSignOut> (ghost variant) so it sits next to Sign
 * out consistently and is theme-aware via the --ck-* tokens: cream by default,
 * dark on surfaces that set html[data-mode="dark"] (the /prep brief).
 */
export function SettingsLink() {
  const style: React.CSSProperties = {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    fontWeight: 600,
    padding: "7px 13px",
    borderRadius: 7,
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease",
    background: "transparent",
    color: "var(--ck-ink-2)",
    border: "1px solid var(--ck-rule-2)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
  };
  return (
    <Link href="/settings/integrations" style={style}>
      Settings
    </Link>
  );
}
