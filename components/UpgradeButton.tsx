"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

/**
 * A primary action button that becomes a paywall when the tenant is over the
 * free help limit. When unlocked it's a normal Link to `href`; when `locked`
 * it opens the upgrade modal (Stripe Checkout via /api/billing/checkout)
 * instead of letting the user start the action and hit a 402 mid-flow.
 *
 * Reuse anywhere a help-action is initiated (+ New deal, + Add the call, …).
 */
export function UpgradeButton({
  href,
  label,
  locked,
  style,
  className,
}: {
  href: string;
  label: string;
  locked: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!locked) {
    return (
      <Link href={href} style={style} className={className}>
        {label}
      </Link>
    );
  }

  async function checkout() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setErr(data.message || "Checkout isn't available yet — try again shortly.");
    } catch {
      setErr("Something went wrong starting checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        style={{ ...style, border: "none", cursor: "pointer", font: "inherit" }}
      >
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={OVERLAY}
        >
          <div style={MODAL} onClick={(e) => e.stopPropagation()}>
            <p style={EYEBROW}>— You&apos;ve used your free Mallín actions</p>
            <h2 style={TITLE}>Keep going with Mallín Pro</h2>
            <p style={BODY}>
              You&apos;ve used your free briefs and calls. Upgrade to keep
              briefing every deal and logging every call — your deal memory
              carries forward.
            </p>
            {err && <p style={ERR}>{err}</p>}
            <button
              type="button"
              onClick={checkout}
              disabled={busy}
              style={{ ...PRIMARY, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
            >
              {busy ? "Opening checkout…" : "Upgrade to Pro — $29/mo →"}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={SECONDARY}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,26,38,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};
const MODAL: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "var(--ck-paper, #fff)",
  border: "1px solid var(--ck-rule, #e3dccc)",
  borderRadius: 14,
  padding: "28px 28px 22px",
  boxShadow: "0 24px 60px rgba(20,26,38,0.25)",
};
const EYEBROW: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--ck-blue, #4a7186)",
};
const TITLE: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.015em",
  color: "var(--ck-ink, #1a2230)",
};
const BODY: CSSProperties = {
  margin: "0 0 20px",
  fontSize: 14,
  lineHeight: 1.55,
  color: "var(--ck-ink-2, #4b5563)",
};
const ERR: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 13,
  color: "#b4232a",
};
const PRIMARY: CSSProperties = {
  display: "block",
  width: "100%",
  marginBottom: 10,
  padding: "11px 16px",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--ck-paper, #fff)",
  background: "var(--ck-ink, #1a2230)",
  border: "none",
  borderRadius: 8,
};
const SECONDARY: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--ck-ink-3, #6b7689)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};
