/**
 * AccountLogo — renders the company logo for an account, with a
 * letter-monogram fallback when no domain is known or the logo fetch
 * fails.
 *
 * Source: DuckDuckGo's icon service (https://icons.duckduckgo.com/ip3/<domain>.ico)
 * — no API key required, no rate limit at our scale, returns 200 with
 * a real image for indexed domains and 404 for unindexed ones (so
 * `onError` falls back to monogram cleanly).
 *
 * History: we originally used Clearbit's Logo API
 * (logo.clearbit.com/<domain>). After HubSpot acquired Clearbit in
 * Nov 2023, the public Logo API hostname stopped resolving. Switched
 * to DuckDuckGo on May 14 2026 after a Flow.life lookup failed in
 * production.
 *
 * Privacy: requests go from the user's browser to DDG's CDN. DDG
 * sees the rep's IP + the domain being looked up. Acceptable for
 * account-context display.
 */

"use client";

import { useState } from "react";

interface AccountLogoProps {
  /** Account name — used for the monogram fallback. Required. */
  name: string;
  /** Account domain — drives the logo lookup. If omitted, monogram is
   *  rendered immediately (no network attempt). */
  domain?: string | null;
  /** Pixel size of the rendered logo (square). Defaults to 28. */
  size?: number;
  /** Optional className for outer wrapper. */
  className?: string;
}

function monogramOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AccountLogo({
  name,
  domain,
  size = 28,
  className,
}: AccountLogoProps) {
  const [failed, setFailed] = useState(false);

  const showLogo = Boolean(domain) && !failed;
  const logoUrl = domain
    ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`
    : null;

  // Container — always visible. Stronger contrast than the original
  // (was rgba 0.05 / 0.08 which read as faded against dark bg).
  // Now uses a small slate-blue accent tint so the placeholder reads
  // as an intentional element while the logo loads (or fails).
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 6,
    flexShrink: 0,
    overflow: "hidden",
    background:
      "hsla(var(--accent-h, 204), var(--accent-s, 40%), var(--accent-l, 67%), 0.12)",
    border:
      "0.5px solid hsla(var(--accent-h, 204), var(--accent-s, 40%), var(--accent-l, 67%), 0.28)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      'var(--font-jetbrains-mono, ui-monospace), "SF Mono", Menlo, monospace',
    fontSize: Math.floor(size * 0.46),
    fontWeight: 700,
    letterSpacing: "0.02em",
    color:
      "hsl(var(--accent-h, 204), var(--accent-s, 40%), calc(var(--accent-l, 67%) + 8%))",
    boxSizing: "border-box",
    lineHeight: 1,
  };

  if (showLogo && logoUrl) {
    return (
      <span className={className} style={containerStyle} aria-label={`${name} logo`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={containerStyle}
      aria-label={`${name} (no logo available)`}
      title={name}
    >
      {monogramOf(name)}
    </span>
  );
}
