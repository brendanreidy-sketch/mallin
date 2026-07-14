"use client";

/**
 * GenerateDeckButton — cockpit action that mints (or reuses) the customer-facing
 * deck link for this deal via POST /api/generate-deck, then surfaces the public
 * /deck/[token] URL + the .pptx download. The deck is the SANITIZED substrate
 * (same gate + content as /share), so this is a customer-shareable artifact, not
 * a rep-internal one.
 *
 * Build-gate note (see memory: reserved_not_forgotten): no auto-write, no Slack,
 * no audit ledger wired here yet — this is the minimal generate→link surface.
 * Wire follow-through only when usage signals it.
 *
 * Self-contained inline styles (brand palette: #7aa8d8 accent) so the control
 * needs no CSS-module wiring on the prep page.
 */

import { useState, type CSSProperties } from "react";
import SendDeckToRoom from "./SendDeckToRoom";

interface DeckResult {
  deckUrl: string;
  pptxUrl: string;
  narrative?: string;
}

// The route reports how the deck copy resolved; turn it into a one-line hint
// so the rep knows whether this deck is grounded in their last call or is the
// deterministic fallback.
function narrativeHint(narrative?: string): string | null {
  switch (narrative) {
    case "generated":
    case "cached":
      return "Built from your last call";
    case "no_transcript":
      return "Basic deck — add a call transcript for a richer one";
    case "error":
      return "Deck copy unavailable — basic deck";
    default:
      return null;
  }
}

const ACCENT = "#7aa8d8";

const wrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  margin: "0 0 8px",
};
const btnStyle: CSSProperties = {
  background: "transparent",
  color: ACCENT,
  border: `1px solid rgba(122,168,216,0.4)`,
  borderRadius: 7,
  padding: "9px 14px",
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  cursor: "pointer",
};
const linkStyle: CSSProperties = {
  color: ACCENT,
  textDecoration: "none",
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  border: `1px solid rgba(122,168,216,0.4)`,
  borderRadius: 7,
  padding: "9px 14px",
};
const subtleStyle: CSSProperties = {
  background: "transparent",
  color: "#9898a3",
  border: "none",
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  cursor: "pointer",
};
const errStyle: CSSProperties = { color: "#d98a8a", fontSize: 12 };
const shareInputStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  color: "#444",
  border: "1px solid rgba(122,168,216,0.4)",
  borderRadius: 7,
  padding: "8px 10px",
  width: 260,
  background: "#fafafa",
};
const cautionStyle: CSSProperties = { color: "#9898a3", fontSize: 11, flexBasis: "100%" };

export default function GenerateDeckButton({
  dealId,
  gmailConnected = false,
  recipients = [],
  repEmails = [],
}: {
  dealId: string;
  gmailConnected?: boolean;
  /** Buyer-side attendees pre-resolved for the deck send (never the rep). */
  recipients?: { name: string; email: string }[];
  /** Rep-side addresses to strip from the deck send, defensively. */
  repEmails?: string[];
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<DeckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Glance-before-share gate: the public link stays hidden until the rep
  // deliberately chooses to share (after previewing the deck).
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  function copyShareLink() {
    if (!result) return;
    const url = `${window.location.origin}${result.deckUrl}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
  }

  async function generate() {
    setState("loading");
    setError(null);
    setShared(false);
    setCopied(false);
    try {
      const res = await fetch("/api/generate-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        deckUrl?: string;
        pptxUrl?: string;
        narrative?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.deckUrl || !data.pptxUrl) {
        setError(data.error ?? `Failed (${res.status})`);
        setState("error");
        return;
      }
      setResult({ deckUrl: data.deckUrl, pptxUrl: data.pptxUrl, narrative: data.narrative });
      setState("done");
    } catch {
      setError("Network error");
      setState("error");
    }
  }

  return (
    <div style={wrapStyle}>
      {state !== "done" ? (
        <button type="button" onClick={generate} disabled={state === "loading"} style={btnStyle}>
          {state === "loading" ? "Building deck…" : "Generate deck for next call"}
        </button>
      ) : (
        result && (
          <>
            <a style={linkStyle} href={result.deckUrl} target="_blank" rel="noopener noreferrer">
              Open deck (preview) ↗
            </a>
            <a style={linkStyle} href={result.pptxUrl}>
              Download .pptx
            </a>
            {!shared ? (
              <button type="button" onClick={() => setShared(true)} style={btnStyle}>
                Share with prospect →
              </button>
            ) : (
              <>
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}${result.deckUrl}`}
                  style={shareInputStyle}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" onClick={copyShareLink} style={subtleStyle}>
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
                <span style={cautionStyle}>
                  Public link — anyone with it can view this deck. Review it before sending.
                </span>
              </>
            )}
            <button type="button" onClick={() => setSending((v) => !v)} style={btnStyle}>
              Send to attendees →
            </button>
            <button type="button" onClick={generate} style={subtleStyle}>
              Refresh
            </button>
            {narrativeHint(result.narrative) && (
              <span style={subtleStyle}>{narrativeHint(result.narrative)}</span>
            )}
            {sending && (
              <div style={{ flexBasis: "100%" }}>
                <SendDeckToRoom
                  dealId={dealId}
                  deckUrl={result.deckUrl}
                  gmailConnected={gmailConnected}
                  recipients={recipients}
                  repEmails={repEmails}
                />
              </div>
            )}
          </>
        )
      )}
      {state === "error" && error && <span style={errStyle}>{error}</span>}
      <a
        style={subtleStyle}
        href={`/api/generate-deck/prep?dealId=${encodeURIComponent(dealId)}`}
        title="Private prep deck — your objective, landmines, and the why behind each question. Never shared."
      >
        Prep notes (private) ↓
      </a>
    </div>
  );
}
