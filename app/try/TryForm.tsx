"use client";

import { useState } from "react";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";

const INK = "#1a2230";
const INK2 = "#3b4658";
const INK3 = "#6b7689";
const BLUE = "#4a7186";
const RULE = "#e3dccc";
const CARD = "#ffffff";

// SourcedFact-tolerant text extractor — handles a plain string, {value}, or {fact}.
function sf(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.value === "string") return o.value;
    if (typeof o.fact === "string") return o.fact;
  }
  return "";
}

interface TryResult {
  account_name: string;
  artifact: AccountIntelligenceArtifact;
}

export default function TryForm() {
  const [company, setCompany] = useState("");
  const [productContext, setProductContext] = useState("");
  const [stakeholders, setStakeholders] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TryResult | null>(null);

  const canSubmit = company.trim() && productContext.trim() && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/try-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, productContext, stakeholders }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        account_name?: string;
        artifact?: AccountIntelligenceArtifact;
        message?: string;
      };
      if (!res.ok || !data.artifact) {
        setError(data.message ?? "Something went wrong. Try again, or sign up for the full product.");
        setBusy(false);
        return;
      }
      setResult({ account_name: data.account_name ?? company, artifact: data.artifact });
      setBusy(false);
    } catch {
      setError("Network hiccup — give it another go.");
      setBusy(false);
    }
  }

  if (busy) return <Building company={company} />;
  if (result)
    return (
      <Teaser
        result={result}
        company={company}
        productContext={productContext}
        stakeholders={stakeholders}
        onReset={() => setResult(null)}
      />
    );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: 15,
    color: INK,
    background: "#faf7f0",
    border: `1px solid ${RULE}`,
    borderRadius: 10,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: INK, display: "block", margin: "18px 0 6px" };

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 28 }}>
      <label style={labelStyle}>
        Company you&apos;re selling to
        <span style={{ fontWeight: 400, color: INK3 }}> — the account we research</span>
      </label>
      <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />

      <label style={labelStyle}>What do you sell?</label>
      <input style={inputStyle} value={productContext} onChange={(e) => setProductContext(e.target.value)} placeholder="e.g. your product or service" />

      <label style={labelStyle}>
        Who&apos;s in the room?
        <span style={{ fontWeight: 400, color: INK3 }}> — optional, names or titles, comma-separated</span>
      </label>
      <input style={inputStyle} value={stakeholders} onChange={(e) => setStakeholders(e.target.value)} placeholder="e.g. the CFO, the VP of Sales" />

      {error && <p style={{ color: "#c25a4a", fontSize: 14, margin: "16px 0 0" }}>{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          marginTop: 24,
          width: "100%",
          padding: "14px 18px",
          fontSize: 16,
          fontWeight: 600,
          color: canSubmit ? "#f4f1ea" : "#9aa3b3",
          background: canSubmit ? INK : "#e7e2d6",
          border: "none",
          borderRadius: 10,
          cursor: canSubmit ? "pointer" : "default",
          fontFamily: "inherit",
        }}
      >
        Build my brief →
      </button>
      <p style={{ fontSize: 12.5, color: INK3, margin: "12px 0 0", textAlign: "center" }}>
        Free preview · takes 2–3 minutes while Mallín researches the account.
      </p>
    </form>
  );
}

function Building({ company }: { company: string }) {
  return (
    <div style={{ marginTop: 36, padding: "44px 28px", background: CARD, border: `1px solid ${RULE}`, borderRadius: 14, textAlign: "center" }}>
      <div style={{ width: 18, height: 18, margin: "0 auto 18px", borderRadius: "50%", border: `2px solid ${RULE}`, borderTopColor: BLUE, animation: "tspin 0.8s linear infinite" }} />
      <p style={{ fontSize: 16, fontWeight: 600, color: INK, margin: 0 }}>Researching {company || "the account"}…</p>
      <p style={{ fontSize: 13.5, color: INK3, margin: "8px auto 0", maxWidth: 400, lineHeight: 1.5 }}>
        This takes <b style={{ color: INK }}>2–3 minutes</b> — Mallín reads the web for the company and the people you&apos;re meeting, then writes your brief. Keep this tab open.
      </p>
      <style>{`@keyframes tspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BLUE, margin: "0 0 8px" }}>{label}</p>
      {children}
    </div>
  );
}

/**
 * Teaser + signup gate. We show enough to prove the brief is real and sharp —
 * the account read + the single most important objective — then lock the rest
 * (the people, the questions, the landmines, the events) behind a free account.
 * On unlock we save the brief under the entered email and send them to /start;
 * signing up with that email materializes the full brief as their first deal
 * (lib/intake/import-try-leads), so "reveal on signup" is real.
 */
function Teaser({
  result,
  company,
  productContext,
  stakeholders,
  onReset,
}: {
  result: TryResult;
  company: string;
  productContext: string;
  stakeholders: string;
  onReset: () => void;
}) {
  const a = result.artifact;
  const brief = a.pre_call_brief;
  const oneLine = sf(a.account?.one_line);

  const peopleCount = (a.stakeholders ?? []).length;
  const qCount = Array.isArray(brief?.questions_to_qualify) ? brief!.questions_to_qualify.length : 0;
  const eventCount = (a.recent_events ?? []).length;
  const landmineCount = Array.isArray(brief?.landmines) ? brief!.landmines.length : 0;

  const [email, setEmail] = useState("");
  const [salesExperience, setSalesExperience] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    const clean = email.trim();
    if (!clean || unlocking) return;
    setUnlocking(true);
    // Save the brief + the rep's sales tenure under this email (best-effort) so
    // both are waiting after signup — the tenure lets Mallín tune coaching depth.
    try {
      await fetch("/api/try-brief/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: clean,
          company,
          productContext,
          stakeholders,
          artifact: a,
          account_name: result.account_name,
          salesExperience: salesExperience || undefined,
        }),
      });
    } catch {
      /* best-effort — proceed to signup regardless */
    }
    // Hand off to signup with the email prefilled so the import matches.
    window.location.href = `/start?email=${encodeURIComponent(clean)}`;
  }

  const lockRow = (text: string) => (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13.5, color: "#c9d2de", lineHeight: 1.5, marginBottom: 8 }}>
      <LockIcon />
      <span>{text}</span>
    </li>
  );

  return (
    <div style={{ marginTop: 32 }}>
      {/* Teaser card — real value, so the gate feels earned, not bait. */}
      <div style={{ padding: "26px 26px 24px", background: CARD, border: `1px solid ${RULE}`, borderRadius: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BLUE, margin: 0 }}>
          Pre-call brief · Preview
        </p>
        <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", color: INK, margin: "8px 0 0" }}>{result.account_name}</h2>
        {oneLine && <p style={{ fontSize: 15, lineHeight: 1.55, color: INK2, margin: "8px 0 0" }}>{oneLine}</p>}

        {brief?.primary_objective && (
          <Section label="The decision that matters most">
            <p style={{ fontSize: 15.5, lineHeight: 1.55, color: INK, margin: 0, fontWeight: 500 }}>{brief.primary_objective}</p>
          </Section>
        )}
      </div>

      {/* Gate — everything else is behind a free account. */}
      <div style={{ marginTop: 16, padding: "24px 26px", background: INK, borderRadius: 14 }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: "#f4f1ea", margin: 0 }}>See the full brief — free.</p>
        <p style={{ fontSize: 13.5, color: "#c9d2de", margin: "6px 0 16px", lineHeight: 1.5 }}>
          Create your account to unlock the rest of {result.account_name}&apos;s brief:
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px" }}>
          {peopleCount > 0 && lockRow(`Who's in the room — ${peopleCount} ${peopleCount === 1 ? "person" : "people"}, each one's role and how to handle them`)}
          {qCount > 0 && lockRow(`${qCount} questions to ask on the call — and what each answer tells you`)}
          {landmineCount > 0 && lockRow(`Landmines to avoid — ${landmineCount} way${landmineCount === 1 ? "" : "s"} this call can go sideways`)}
          {eventCount > 0 && lockRow(`${eventCount} recent event${eventCount === 1 ? "" : "s"} that change how you pitch`)}
          {lockRow("The .pptx deck — and it gets sharper every call you add")}
        </ul>

        <form onSubmit={unlock}>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={{ width: "100%", padding: "13px 14px", fontSize: 15, color: INK, background: "#f4f1ea", border: "none", borderRadius: 10, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
          {/* Rep tenure — a soft signal so Mallín can tune coaching depth to
              experience (juniors get the "why"; veterans get it terse). Optional. */}
          <select
            value={salesExperience}
            onChange={(e) => setSalesExperience(e.target.value)}
            aria-label="How long have you been in sales?"
            style={{ marginTop: 10, width: "100%", padding: "13px 14px", fontSize: 15, color: salesExperience ? INK : "#8792a3", background: "#f4f1ea", border: "none", borderRadius: 10, outline: "none", boxSizing: "border-box", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}
          >
            <option value="">How long have you been in sales? (optional)</option>
            <option value="new">New to sales — under 1 year</option>
            <option value="1-3">1–3 years</option>
            <option value="3-7">3–7 years</option>
            <option value="7-15">7–15 years</option>
            <option value="15+">15+ years</option>
          </select>
          <button
            type="submit"
            disabled={unlocking || !email.trim()}
            style={{ marginTop: 12, width: "100%", padding: "13px 18px", fontSize: 15.5, fontWeight: 600, color: INK, background: "#f4f1ea", border: "none", borderRadius: 10, cursor: unlocking || !email.trim() ? "default" : "pointer", opacity: unlocking || !email.trim() ? 0.7 : 1, fontFamily: "inherit" }}
          >
            {unlocking ? "Opening your account…" : "Create free account & unlock →"}
          </button>
        </form>
        <p style={{ fontSize: 12, color: "#8792a3", margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
          Free · no card · your brief is saved and waiting the moment you sign in.
        </p>
      </div>

      <button onClick={onReset} style={{ marginTop: 16, background: "none", border: "none", color: INK3, fontSize: 13.5, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
        ← Try another call
      </button>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flex: "none", marginTop: 2 }} aria-hidden="true">
      <rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="#8aa0b5" strokeWidth="1.3" />
      <path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" stroke="#8aa0b5" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
