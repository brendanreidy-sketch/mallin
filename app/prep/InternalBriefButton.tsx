"use client";

/**
 * InternalBriefButton — prep-page action that generates the REP-INTERNAL
 * executive brief for this deal. Unlike the customer deck (GenerateDeckButton),
 * this is the unsanitized judgment layer and is NEVER shareable — it only offers
 * a private, authenticated .pptx download.
 *
 * Generation is a multi-minute model pipeline, so it runs as a background job:
 * POST /api/internal-brief returns { jobId }; this component polls
 * GET /api/internal-brief/status until the job succeeds/fails (mirroring the
 * /new/building poller), then links to GET /api/internal-brief/download.
 *
 * Self-contained inline styles (brand accent #7aa8d8) to match the deck control.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

const ACCENT = "#7aa8d8";
const POLL_MS = 4000;

const wrapStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 0 8px" };
const btnStyle: CSSProperties = { background: "transparent", color: ACCENT, border: "1px solid rgba(122,168,216,0.4)", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", cursor: "pointer" };
const linkStyle: CSSProperties = { color: ACCENT, textDecoration: "none", fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", border: "1px solid rgba(122,168,216,0.4)", borderRadius: 7, padding: "9px 14px" };
const subtleStyle: CSSProperties = { background: "transparent", color: "#9898a3", border: "none", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", cursor: "pointer" };
const errStyle: CSSProperties = { color: "#d98a8a", fontSize: 12 };
const cautionStyle: CSSProperties = { color: "#9898a3", fontSize: 11, flexBasis: "100%" };

/** Map a public failure code to a rep-facing hint — never leaks internals. */
function briefErrorHint(code?: string): string {
  switch (code) {
    case "required_artifact_missing":
      return "This deal isn't ready — run the intelligence/prep pass first.";
    case "brief_failed_validation":
      return "Couldn't assemble a valid brief this time — try again.";
    case "model_generation_failed":
      return "Generation failed — try again in a moment.";
    case "brief_render_failed":
      return "Rendering failed — try again.";
    default:
      return "Something went wrong — try again.";
  }
}

export default function InternalBriefButton({ dealId }: { dealId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function poll(id: string) {
    try {
      const res = await fetch(`/api/internal-brief/status?jobId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; status?: string; errorCode?: string; error?: string };
      if (!res.ok || !data.ok) { setError("Couldn't check status — try again."); setState("error"); return; }
      if (data.status === "succeeded") { setState("done"); return; }
      if (data.status === "failed") { setError(briefErrorHint(data.errorCode)); setState("error"); return; }
      setPhase(data.status === "running" ? "Generating your brief…" : "Queued…");
      timer.current = setTimeout(() => void poll(id), POLL_MS);
    } catch {
      setError("Network error — try again.");
      setState("error");
    }
  }

  async function generate() {
    if (timer.current) clearTimeout(timer.current);
    setState("working");
    setError(null);
    setPhase("Queued…");
    setJobId(null);
    try {
      const res = await fetch("/api/internal-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId }) });
      const data = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (res.status === 409 && data.error === "required_artifact_missing") { setError(briefErrorHint("required_artifact_missing")); setState("error"); return; }
      if (!res.ok || !data.ok || !data.jobId) { setError(briefErrorHint(data.error)); setState("error"); return; }
      setJobId(data.jobId);
      timer.current = setTimeout(() => void poll(data.jobId!), 1500);
    } catch {
      setError("Network error — try again.");
      setState("error");
    }
  }

  return (
    <div style={wrapStyle}>
      {state === "idle" && (
        <button type="button" onClick={generate} style={btnStyle}>Generate internal brief</button>
      )}
      {state === "working" && (
        <span style={subtleStyle}>{phase} <span style={{ opacity: 0.7 }}>(this can take a few minutes — you can keep working)</span></span>
      )}
      {state === "done" && jobId && (
        <>
          <a style={linkStyle} href={`/api/internal-brief/download?jobId=${encodeURIComponent(jobId)}`}>Download internal brief .pptx</a>
          <button type="button" onClick={generate} style={subtleStyle}>Regenerate</button>
        </>
      )}
      {state === "error" && (
        <>
          <span style={errStyle}>{error}</span>
          <button type="button" onClick={generate} style={subtleStyle}>Retry</button>
        </>
      )}
      <span style={cautionStyle}>Rep-internal — the unsanitized judgment layer. Never shared with the customer.</span>
    </div>
  );
}
