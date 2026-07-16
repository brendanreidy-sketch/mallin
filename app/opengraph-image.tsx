import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Branded link-preview card (1200×630) for iMessage / Slack / LinkedIn / X.
 * Next auto-injects <meta property="og:image"> pointing at this route, so a
 * shared mallin.io link renders the wordmark + tagline on brand paper instead
 * of a bare dark placeholder. twitter-image.tsx re-exports this.
 *
 * Palette from app/globals.css: paper #f4f1ea, ink #1a2230, blue #4a7186.
 * Mark from public/brand/icon.svg, inlined as a data URI (Satori-safe).
 */

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Mallín — the governed judgment layer for revenue teams";

const PAPER = "#f4f1ea";
const INK = "#1a2230";
const INK_3 = "#6b7689";
const BLUE = "#4a7186";

// The Mallín mark: steppe surface line + vegetation tufts + hidden stream.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="120" height="120" fill="none">
  <path d="M 6 26 Q 18 21, 32 26 T 58 26" stroke="${INK}" stroke-width="3" stroke-linecap="round" />
  <line x1="22" y1="22" x2="22" y2="17" stroke="${INK}" stroke-width="1.75" stroke-linecap="round" />
  <line x1="32" y1="22" x2="32" y2="14" stroke="${INK}" stroke-width="1.75" stroke-linecap="round" />
  <line x1="42" y1="22" x2="42" y2="17" stroke="${INK}" stroke-width="1.75" stroke-linecap="round" />
  <path d="M 3 42 Q 17 36, 32 42 T 61 42" stroke="${BLUE}" stroke-width="3" stroke-linecap="round" />
</svg>`;

const markDataUri = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

// Geist (the brand face) vendored as TTF — Satori can't read woff2 / next/font.
const fontDir = join(process.cwd(), "assets", "fonts");
const geistRegular = readFileSync(join(fontDir, "Geist-Regular.ttf"));
const geistSemiBold = readFileSync(join(fontDir, "Geist-SemiBold.ttf"));

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: "80px 88px",
          fontFamily: "Geist",
        }}
      >
        {/* Wordmark row */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              width: 132,
              height: 132,
              alignItems: "center",
              justifyContent: "center",
              background: "#ffffff",
              borderRadius: 28,
              border: "1px solid #e3dccc",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri} width={120} height={120} alt="" />
          </div>
          <span style={{ fontSize: 64, fontWeight: 600, color: INK, letterSpacing: -1 }}>
            Mallín
          </span>
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span
            style={{
              fontSize: 76,
              fontWeight: 600,
              color: INK,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              maxWidth: 980,
            }}
          >
            The governed judgment layer for revenue teams
          </span>
          {/* Hidden-stream accent rule */}
          <div style={{ display: "flex", width: 220, height: 5, background: BLUE, borderRadius: 3 }} />
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ fontSize: 30, color: INK_3 }}>
            An AI teammate that wins the deal and learns how your team sells.
          </span>
          <span style={{ fontSize: 30, fontWeight: 600, color: BLUE }}>mallin.io</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
        { name: "Geist", data: geistSemiBold, weight: 600, style: "normal" },
      ],
    }
  );
}
