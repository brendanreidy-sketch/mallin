"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/BackLink";

// Draft of in-progress intake work, stashed when a submit hits an expired
// session so the re-auth round-trip (sign-in → back to /new) doesn't lose the
// pasted transcript. Cleared on restore. sessionStorage = this-tab, ephemeral.
const DRAFT_KEY = "mallin:new:draft";

/**
 * Paste-a-call intake form. POSTs to /api/intake/transcript, then routes to
 * /new/building?dealId=… which polls until the brief is ready.
 */
export default function IntakeForm({
  existingDeals = [],
  initialDealId,
  initialMode,
}: {
  existingDeals?: { id: string; name: string }[];
  initialDealId?: string;
  /** Lets the onboarding deep-link straight into a mode (e.g. ?mode=upcoming
   *  so a brand-new rep lands on the research form, not "paste a call"). */
  initialMode?: "new" | "existing" | "upcoming";
}) {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [productContext, setProductContext] = useState("");
  const [sellerCompany, setSellerCompany] = useState("");
  const [accountNameHint, setAccountNameHint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  // "new" → start a fresh deal; "existing" → attach this call as a follow-up
  // to a deal the rep already has (no new deal, no free-slot cost).
  // "new" → paste a past call, fresh deal · "existing" → follow-up call on a
  // deal you have · "upcoming" → a call you HAVEN'T had yet: research-only,
  // no transcript (doesn't cost a free slot until a real call is added).
  // First-time users (no deals yet) default to "upcoming" — the research-first
  // path that needs NO transcript — instead of "paste a call", which assumes
  // they have a recording. Returning users with deals default to "new".
  const [mode, setMode] = useState<"new" | "existing" | "upcoming">(
    initialDealId
      ? "existing"
      : (initialMode ?? (existingDeals.length === 0 ? "upcoming" : "new")),
  );
  const [dealId, setDealId] = useState<string>(
    initialDealId ?? existingDeals[0]?.id ?? "",
  );
  const [stakeholders, setStakeholders] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const followUp = mode === "existing";
  const upcoming = mode === "upcoming";

  // Restore a draft saved when a prior submit bounced through sign-in (expired
  // session). Runs once on mount, then clears the draft so a normal reload
  // starts clean.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(DRAFT_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      return; // sessionStorage unavailable — nothing to restore
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Partial<{
        transcript: string;
        productContext: string;
        accountNameHint: string;
        fileName: string;
        stakeholders: string;
      }>;
      if (d.transcript) setTranscript(d.transcript);
      if (d.productContext) setProductContext(d.productContext);
      if (d.accountNameHint) setAccountNameHint(d.accountNameHint);
      if (d.fileName) setFileName(d.fileName);
      if (d.stakeholders) setStakeholders(d.stakeholders);
    } catch {
      // malformed draft — ignore, never block the form
    }
  }, []);

  // Persist current work before a re-auth navigation so nothing is lost.
  function stashDraft() {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ transcript, productContext, accountNameHint, fileName, stakeholders }),
      );
    } catch {
      // sessionStorage may be unavailable (private mode / quota) — non-fatal.
    }
  }

  // Load a transcript file into the field. Plain-text formats are read in the
  // browser; Word/PDF are sent to /api/intake/extract-text for server parsing.
  async function loadFile(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    const name = file.name.toLowerCase();
    const isText = /\.(txt|text|md|markdown|vtt|srt)$/.test(name);

    if (isText) {
      const reader = new FileReader();
      reader.onload = () => {
        setTranscript(String(reader.result ?? ""));
        setFileName(file.name);
      };
      reader.onerror = () => setError("Couldn't read that file.");
      reader.readAsText(file);
      return;
    }

    // Audio / video → transcribe via Deepgram.
    const isAudio =
      /\.(mp3|m4a|wav|webm|ogg|oga|mp4|m4v|mov|aac|flac)$/.test(name) ||
      file.type.startsWith("audio/") ||
      file.type.startsWith("video/");
    if (isAudio) {
      await transcribeBlob(file);
      return;
    }

    // Word / PDF → server-side extraction.
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/intake/extract-text", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { text?: string; message?: string; error?: string; detail?: string };
      if (!res.ok || typeof data.text !== "string") {
        throw new Error(
          [data.message || data.error || "Couldn't read that file.", data.detail].filter(Boolean).join(" — "),
        );
      }
      setTranscript(data.text);
      setFileName(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  // Send recorded or uploaded call audio to the transcription endpoint, then
  // drop the text into the (editable) transcript box so the rep can verify it
  // before it becomes the brief.
  async function transcribeBlob(blob: Blob) {
    setError(null);
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "call-audio");
      const res = await fetch("/api/intake/transcribe", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        transcript?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || typeof data.transcript !== "string") {
        throw new Error(data.message || data.error || "Couldn't transcribe that audio.");
      }
      setFileName(null);
      setTranscript((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${data.transcript}` : data.transcript!,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        await transcribeBlob(blob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone — check the browser's mic permission.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  const canSubmit =
    (upcoming
      ? accountNameHint.trim().length > 0 && productContext.trim().length > 0
      : transcript.trim().length >= 100 &&
        (followUp ? dealId.length > 0 : productContext.trim().length > 0)) &&
    !submitting &&
    !extracting;
  // A single call transcript is realistically well under this. Past it, the
  // input is usually a multi-page doc, which makes the pipeline take many
  // minutes — warn (don't block; some calls really are long).
  const oversized = transcript.trim().length > 80000;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        upcoming ? "/api/intake/research" : "/api/intake/transcript",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            upcoming
              ? { company: accountNameHint, productContext, stakeholders, sellerCompany }
              : followUp
                ? { transcript, opportunityId: dealId }
                : { transcript, productContext, accountNameHint, sellerCompany },
          ),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        opportunityId?: string;
        error?: string;
        message?: string;
        detail?: string;
      };
      if (!res.ok || !data.opportunityId) {
        if (data.error === "no_workspace") {
          router.replace("/welcome");
          return;
        }
        if (data.error === "free_limit_reached") {
          setLimitReached(true);
          setSubmitting(false);
          return;
        }
        if (res.status === 401 || data.error === "unauthorized") {
          // Session lapsed between page load and submit (token expiry, sign-out
          // in another tab, or a bfcache restore of this page). Preserve the
          // work and re-authenticate, returning straight back here — never
          // surface a raw "unauthorized" to the user.
          stashDraft();
          const back = `${window.location.pathname}${window.location.search}`;
          router.replace(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
          return;
        }
        throw new Error(
          [
            data.message ||
              data.error ||
              `That didn't go through (HTTP ${res.status}). If your transcript is very long it may have timed out — try a single call, or give it another go.`,
            data.detail,
          ]
            .filter(Boolean)
            .join(" — "),
        );
      }
      // Pipeline ran synchronously, so the brief already exists — go straight to it.
      router.replace(`/prep?dealId=${data.opportunityId}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  // The pipeline runs synchronously inside the POST (~3–6 min), so once we
  // submit we hand the whole screen to a progress overlay. Without it the page
  // looks frozen and people reload mid-build — the exact failure we just fixed.
  if (submitting) return <BuildingOverlay research={upcoming} />;
  if (limitReached) return <UpgradeWall />;

  return (
    <main style={S.page}>
      <div style={S.card}>
        <BackLink href="/cockpit" label="All deals" />
        <p style={S.eyebrow}>
          {upcoming ? "— Call coming up" : followUp ? "— Follow-up call" : "— New deal"}
        </p>
        <h1 style={S.h1}>
          {upcoming
            ? "Prep for a call you haven't had yet."
            : followUp
              ? "Add your latest call."
              : "Paste a call. Get a brief."}
        </h1>
        <p style={S.sub}>
          {upcoming
            ? "No transcript needed. Tell Mallín who you're meeting and it researches the account and the people — so you walk into the first call already prepped. After the call, add it and this becomes a live deal brief."
            : followUp
              ? "Paste the transcript from your latest call on this deal. Mallín folds it into the brief — your last call becomes “what was said last time,” and the brief updates around what just changed."
              : "Drop in a transcript from your last call. Mallín reads it, researches the account and stakeholders, and builds your pre-call brief — the decisive risk, the next move, and the evidence behind it."}
        </p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={S.modeRow}>
            <button
              type="button"
              onClick={() => setMode("new")}
              style={mode === "new" ? S.modeBtnActive : S.modeBtn}
            >
              Paste a call
            </button>
            <button
              type="button"
              onClick={() => setMode("upcoming")}
              style={upcoming ? S.modeBtnActive : S.modeBtn}
            >
              Call coming up
            </button>
            {existingDeals.length > 0 && (
              <button
                type="button"
                onClick={() => setMode("existing")}
                style={followUp ? S.modeBtnActive : S.modeBtn}
              >
                Follow-up
              </button>
            )}
          </div>

          {followUp ? (
            <label style={S.label}>
              Which deal?
              <select
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                style={S.input}
              >
                {existingDeals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label style={S.label}>
                What are you selling?
                <input
                  type="text"
                  value={productContext}
                  onChange={(e) => setProductContext(e.target.value)}
                  placeholder="e.g. what you sell and who you sell it to"
                  style={S.input}
                />
              </label>

              <label style={S.label}>
                Your company{" "}
                <span style={S.optional}>(optional — sharpens the brief)</span>
                <input
                  type="text"
                  value={sellerCompany}
                  onChange={(e) => setSellerCompany(e.target.value)}
                  placeholder="e.g. the company you sell for"
                  style={S.input}
                />
              </label>

              <label style={S.label}>
                Company you&apos;re selling to{" "}
                {!upcoming && (
                  <span style={S.optional}>(optional — helps us research)</span>
                )}
                <input
                  type="text"
                  value={accountNameHint}
                  onChange={(e) => setAccountNameHint(e.target.value)}
                  placeholder="e.g. Acme Industrial"
                  style={S.input}
                />
              </label>

              {upcoming && (
                <label style={S.label}>
                  Who are you meeting?{" "}
                  <span style={S.optional}>(names or LinkedIn — optional, but sharper)</span>
                  <input
                    type="text"
                    value={stakeholders}
                    onChange={(e) => setStakeholders(e.target.value)}
                    placeholder="e.g. Priya Nair, VP Finance"
                    style={S.input}
                  />
                </label>
              )}
            </>
          )}

          {!upcoming && (
          <label style={S.label}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              Call transcript
              <span style={{ display: "inline-flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={transcribing || extracting}
                  style={{
                    ...S.uploadBtn,
                    ...(recording ? { color: "#c25a4a", borderColor: "#c25a4a" } : {}),
                    opacity: transcribing ? 0.6 : 1,
                    cursor: transcribing ? "wait" : "pointer",
                  }}
                >
                  {transcribing
                    ? "Transcribing…"
                    : recording
                      ? "■ Stop recording"
                      : "● Record the call"}
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={extracting || transcribing || recording}
                  style={{ ...S.uploadBtn, opacity: extracting ? 0.6 : 1, cursor: extracting ? "wait" : "pointer" }}
                >
                  {extracting ? "Reading…" : "↑ Upload a file"}
                </button>
              </span>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.text,.md,.markdown,.vtt,.srt,.pdf,.docx,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mov,.aac,.flac,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/*,video/*"
              style={{ display: "none" }}
              onChange={(e) => {
                loadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {fileName ? (
              <div style={S.fileChip}>
                <span style={{ fontSize: 22 }} aria-hidden>📄</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, color: "#1a2230", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fileName}
                  </span>
                  <span style={S.hint}>
                    {transcript.trim().length.toLocaleString()} characters loaded — Mallín will read the whole file
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTranscript("");
                    setFileName(null);
                  }}
                  style={S.removeBtn}
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    loadFile(e.dataTransfer.files?.[0]);
                  }}
                  placeholder="Record or upload the call above, paste the transcript here, or drop a .txt / .vtt / .pdf / .docx / audio file"
                  rows={14}
                  style={{ ...S.input, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 13 }}
                />
                <span style={S.hint}>
                  {extracting
                    ? "Reading your file…"
                    : `${transcript.trim().length} characters${transcript.trim().length < 100 ? " · need at least 100" : ""}`}
                </span>
              </>
            )}
          </label>
          )}

          {oversized && (
            <p style={S.warn}>
              That&apos;s a lot of text ({transcript.trim().length.toLocaleString()} characters) —
              more than a typical call. Mallín will read all of it, but the brief can take several
              minutes. For the fastest result, paste a single call.
            </p>
          )}
          {error && <p style={S.error}>{error}</p>}

          <button type="submit" disabled={!canSubmit} style={{ ...S.button, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? "pointer" : "not-allowed" }}>
            {submitting
              ? upcoming
                ? "Researching the account…"
                : followUp
                  ? "Updating the brief…"
                  : "Building your brief…"
              : upcoming
                ? "Research it →"
                : followUp
                  ? "Update the brief →"
                  : "Build my brief →"}
          </button>
          <p style={S.hint}>
            {upcoming
              ? "Researching takes a minute or two — keep this tab open."
              : "This can take several minutes for a long transcript — keep this tab open and we'll show progress."}
          </p>
        </form>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f1ea",
    color: "#1a2230",
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: "64px 24px",
    display: "flex",
    justifyContent: "center",
  },
  card: { width: "100%", maxWidth: 640 },
  eyebrow: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#4a7186", margin: "0 0 14px" },
  h1: { fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0 0 14px" },
  sub: { fontSize: 16, lineHeight: 1.6, color: "#3b4658", margin: "0 0 32px" },
  label: { display: "flex", flexDirection: "column", gap: 7, fontSize: 13.5, fontWeight: 600, color: "#1a2230" },
  optional: { fontWeight: 400, color: "#9aa3b3" },
  input: { padding: "11px 13px", fontSize: 14.5, color: "#1a2230", background: "#faf7f0", border: "1px solid #d6cfbe", borderRadius: 8, outline: "none", fontFamily: "inherit", width: "100%" },
  hint: { fontSize: 12, color: "#9aa3b3", fontWeight: 400 },
  uploadBtn: { padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#4a7186", background: "transparent", border: "1px solid #d6cfbe", borderRadius: 6, cursor: "pointer" },
  fileChip: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#faf7f0", border: "1px solid #d6cfbe", borderRadius: 8 },
  removeBtn: { flexShrink: 0, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#c25a4a", background: "transparent", border: "1px solid #e3dccc", borderRadius: 6, cursor: "pointer" },
  error: { margin: 0, fontSize: 13.5, color: "#c25a4a", fontWeight: 500 },
  warn: { margin: 0, fontSize: 13, color: "#8a6d3b", background: "#fdf3e3", border: "1px solid #ecd9b0", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 },
  button: { padding: "14px 22px", background: "#1a2230", color: "#f4f1ea", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600 },
  modeRow: { display: "flex", gap: 8, padding: 4, background: "#efeadd", border: "1px solid #d6cfbe", borderRadius: 10 },
  modeBtn: { flex: 1, padding: "9px 12px", fontSize: 13.5, fontWeight: 600, color: "#6b7689", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer" },
  modeBtnActive: { flex: 1, padding: "9px 12px", fontSize: 13.5, fontWeight: 600, color: "#1a2230", background: "#faf7f0", border: "1px solid #d6cfbe", borderRadius: 7, cursor: "pointer" },
};

// Full-screen progress while the synchronous pipeline runs. Messages rotate so
// the wait reads as work-in-progress, not a stall. The brief is being
// researched and written end-to-end before the POST returns.
const STEPS = [
  "Reading your transcript…",
  "Researching the account…",
  "Finding your stakeholders on LinkedIn…",
  "Mapping where the deal really stands…",
  "Surfacing the decisive risk…",
  "Writing your pre-call brief…",
];

// Pre-call ("Call coming up") has no transcript — research-flavored steps.
const RESEARCH_STEPS = [
  "Researching the account…",
  "Finding who you're meeting on LinkedIn…",
  "Reading recent events through your product…",
  "Surfacing the angles and landmines…",
  "Writing your pre-call brief…",
];

function BuildingOverlay({ research = false }: { research?: boolean }) {
  const steps = research ? RESEARCH_STEPS : STEPS;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 22000);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <main style={{ ...S.page, alignItems: "center" }}>
      <style>{"@keyframes mallin-spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ ...S.card, maxWidth: 520, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "3px solid #d6cfbe",
            borderTopColor: "#1a2230",
            animation: "mallin-spin 0.9s linear infinite",
            marginBottom: 28,
          }}
          aria-hidden
        />
        <h1 style={{ ...S.h1, fontSize: 26, margin: "0 0 12px" }}>
          {research ? "Researching the account" : "Building your brief"}
        </h1>
        <p style={{ ...S.sub, margin: "0 0 8px", fontSize: 15.5 }}>{steps[step]}</p>
        <p style={S.hint}>This takes a few minutes — keep this tab open.</p>
      </div>
    </main>
  );
}

// The 3-call wall — shown when the free tier (3 calls, workspace-wide) is used
// up. The conversion + expansion fork: upgrade to Pro (Stripe Checkout) or
// bring the team (/pilot).
function UpgradeWall() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upgrade() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
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
    <main style={{ ...S.page, alignItems: "center" }}>
      <div style={{ ...S.card, maxWidth: 540, textAlign: "center" }}>
        <p style={S.eyebrow}>— You&apos;ve used your 3 free briefs</p>
        <h1 style={{ ...S.h1, fontSize: 30, margin: "0 0 14px" }}>Keep briefing every deal.</h1>
        <p style={{ ...S.sub, margin: "0 0 28px" }}>
          You&apos;ve run your 3 free briefs. Pro is unlimited — every call,
          every prep, every deal, from here on.
        </p>

        <button
          type="button"
          onClick={upgrade}
          disabled={busy}
          style={{ ...S.button, width: "100%", opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Opening checkout…" : "Upgrade to Pro — $29.99/mo →"}
        </button>
        {err && <p style={{ ...S.error, marginTop: 16 }}>{err}</p>}
        <p style={{ ...S.hint, marginTop: 18 }}>Unlimited briefs. Cancel anytime.</p>
        {/* Team motion demoted to a quiet link — the paywall's one job is the
            individual Pro conversion; a co-equal team-pilot CTA split intent
            and mis-sold /pilot (a top-of-funnel sales application) to an
            already-active user. */}
        <a
          href="/pilot"
          style={{ display: "inline-block", marginTop: 16, fontSize: 13, fontWeight: 500, color: "#9aa3b3", textDecoration: "none" }}
        >
          Managing a team? →
        </a>
      </div>
    </main>
  );
}
