"use client";

import { SignOutButton } from "@clerk/nextjs";

/**
 * App sign-out control. Wraps Clerk's <SignOutButton> with Mallin styling so
 * logged-in surfaces (cockpit, welcome) have a real logout. redirectUrl sends
 * the user back to the public landing after the session ends.
 */
export function AppSignOut({
  variant = "ghost",
}: {
  variant?: "ghost" | "solid";
}) {
  const base: React.CSSProperties = {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    fontWeight: 600,
    padding: "7px 13px",
    borderRadius: 7,
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease",
  };
  // Theme-aware via --ck-* tokens: cream by default (pages without
  // data-mode resolve to the :root cream values) and dark on surfaces
  // that set html[data-mode="dark"] (the /prep brief).
  const style: React.CSSProperties =
    variant === "solid"
      ? {
          ...base,
          background: "var(--ck-ink)",
          color: "var(--ck-paper)",
          border: "1px solid var(--ck-ink)",
        }
      : {
          ...base,
          background: "transparent",
          color: "var(--ck-ink-2)",
          border: "1px solid var(--ck-rule-2)",
        };

  return (
    <SignOutButton redirectUrl="/">
      <button type="button" style={style}>
        Sign out
      </button>
    </SignOutButton>
  );
}
