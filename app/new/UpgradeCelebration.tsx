"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

/**
 * The "You're on Pro" moment. Stripe Checkout drops the rep back on /new with
 * ?upgraded=1; the plan is already reconciled server-side, but until now the
 * upgrade was silent — no email, no in-app acknowledgement. This is the
 * celebratory confirmation a rep should feel the instant they cross into Pro.
 * Dismissible; if they upgraded mid-deal, it offers a one-click return to it.
 */
export default function UpgradeCelebration({ dealId }: { dealId?: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(26, 34, 48, 0.55)",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#f4f1ea",
          borderRadius: 16,
          padding: "32px 28px",
          textAlign: "center",
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 12 }}>🎉</div>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#6b7689",
          }}
        >
          You&rsquo;re on Mallín Pro
        </p>
        <h1
          style={{
            margin: "0 0 10px",
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#1a2230",
          }}
        >
          Unlimited briefs and calls.
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: 14.5, color: "#4b5568", lineHeight: 1.55 }}>
          Every deal gets briefed, every call gets logged — and your deal memory
          carries forward, compounding with each one.
        </p>
        {dealId ? (
          <Link href={`/prep?dealId=${dealId}`} style={ctaStyle} onClick={() => setOpen(false)}>
            Back to your deal →
          </Link>
        ) : (
          <button type="button" onClick={() => setOpen(false)} style={ctaStyle}>
            Start a deal →
          </button>
        )}
        <div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              marginTop: 14,
              background: "none",
              border: "none",
              color: "#6b7689",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Keep working here
          </button>
        </div>
      </div>
    </div>
  );
}

const ctaStyle: CSSProperties = {
  display: "inline-block",
  padding: "12px 22px",
  background: "#1a2230",
  color: "#f4f1ea",
  border: "none",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "inherit",
};
