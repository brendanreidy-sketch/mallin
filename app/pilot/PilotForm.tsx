"use client";

/**
 * PilotForm — client-side form for /pilot.
 *
 * Posts to /api/pilot-signup. Three states: idle, submitting, success.
 * Errors render inline with a small banner; the user can retry.
 *
 * Fields chosen to match the three buying triggers we already know
 * recur (memory: marketing voice rule + landing copy):
 *   1. Just missed a quarter we can't explain   ("missed_quarter")
 *   2. Scaling faster than RevOps can hire      ("scaling")
 *   3. Losing context across reps and quarters  ("memory_loss")
 *   4. Other                                    ("other")
 *
 * The current_stack checkboxes mirror the integration strip on /pilot.
 * Order is intentional: live integrations first, then "soon" ones.
 */

import { useState, type FormEvent } from "react";
import styles from "./pilot.module.css";

const STACK_OPTIONS = [
  "Salesforce",
  "HubSpot",
  "Pipedrive",
  "Slack",
  "MS Teams",
  "Gong",
  "Outreach",
  "Salesloft",
  "Highspot",
  "ZoomInfo",
  "Gmail",
  "Outlook",
];

const TEAM_SIZES = [
  "Just me",
  "1–5 AEs",
  "5–20 AEs",
  "20–50 AEs",
  "50+ AEs",
];

const TRIGGERS = [
  { value: "missed_quarter", label: "Just missed a quarter we can't explain" },
  { value: "scaling", label: "Scaling faster than RevOps can hire" },
  { value: "memory_loss", label: "Losing context across reps and quarters" },
  { value: "other", label: "Something else" },
];

// Optional qualification pills. Win rate captures the ROI baseline at the one
// moment it's recoverable; deal profile signals where compound memory pays off;
// team experience signals where the coaching lift lands hardest.
const WIN_RATES = ["Under 20%", "20–30%", "30–40%", "40%+", "Not sure"];
const DEAL_PROFILES = ["Enterprise", "Mid-market", "Velocity / SMB"];
const TEAM_EXPERIENCE = ["Mostly ramping", "A mix", "Mostly veterans"];

interface FormState {
  name: string;
  email: string;
  company: string;
  role: string;
  what_you_sell: string;
  team_size: string;
  current_stack: string[];
  win_rate: string;
  deal_profile: string;
  team_experience: string;
  trigger: string;
  notes: string;
}

const INITIAL: FormState = {
  name: "",
  email: "",
  company: "",
  role: "",
  what_you_sell: "",
  team_size: "",
  current_stack: [],
  win_rate: "",
  deal_profile: "",
  team_experience: "",
  trigger: "",
  notes: "",
};

type Status = "idle" | "submitting" | "success" | "error";

export function PilotForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [hpField, setHpField] = useState<string>("");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleStack(tool: string) {
    setForm((prev) => ({
      ...prev,
      current_stack: prev.current_stack.includes(tool)
        ? prev.current_stack.filter((t) => t !== tool)
        : [...prev.current_stack, tool],
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/pilot-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, hp_field: hpField }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        const issues = (json.issues || [])
          .map(
            (i: { path: string; message: string }) =>
              `${i.path}: ${i.message}`,
          )
          .join("; ");
        setErrorMsg(
          issues || json.error || `Submission failed (${res.status})`,
        );
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Network error — please try again or email hello@mallin.io",
      );
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={styles.successCard}>
        <div className={styles.successMark} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path
              d="M5 12.5 10 17.5 19.5 7.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className={styles.successTitle}>
          We&apos;ve got it. <em>We&apos;ll be in touch within 24 hours.</em>
        </h2>
        <p className={styles.successBody}>
          Pilot kickoffs run on a 24-hour clock — we connect to your stack,
          run Mallín on your last quarter, and bring back a knowledge base
          built from eighteen months of your own activity. In the meantime,
          if anything urgent comes up,{" "}
          <a href="mailto:hello@mallin.io">email us directly</a>.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {/* Honeypot — hidden from humans, bots fill it */}
      <input
        type="text"
        name="hp_field"
        tabIndex={-1}
        autoComplete="off"
        value={hpField}
        onChange={(e) => setHpField(e.target.value)}
        className={styles.honeypot}
        aria-hidden="true"
      />

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>About you</h3>

        <div className={styles.fieldRow2}>
          <label className={styles.field}>
            <span className={styles.label}>
              Full name <span className={styles.req}>*</span>
            </span>
            <input
              type="text"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Jane Smith"
              autoComplete="name"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              Work email <span className={styles.req}>*</span>
            </span>
            <input
              type="email"
              required
              maxLength={200}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="jane@yourco.com"
              autoComplete="email"
              className={styles.input}
            />
          </label>
        </div>

        <div className={styles.fieldRow2}>
          <label className={styles.field}>
            <span className={styles.label}>
              Company <span className={styles.req}>*</span>
            </span>
            <input
              type="text"
              required
              maxLength={160}
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Acme Corp"
              autoComplete="organization"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Role</span>
            <input
              type="text"
              maxLength={120}
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              placeholder="CRO · VP Sales · Head of RevOps · …"
              className={styles.input}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>
            What do you sell? <span className={styles.req}>*</span>
          </span>
          <input
            type="text"
            required
            maxLength={200}
            value={form.what_you_sell}
            onChange={(e) => update("what_you_sell", e.target.value)}
            placeholder="e.g. analytics software for mid-market teams"
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Team size</span>
          <div className={styles.pillRow}>
            {TEAM_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`${styles.pill} ${
                  form.team_size === size ? styles.pillActive : ""
                }`}
                onClick={() =>
                  update("team_size", form.team_size === size ? "" : size)
                }
              >
                {size}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>About your sales</h3>
        <p className={styles.sectionHint}>
          Optional — but it helps us tailor the pilot (and set a baseline we
          can measure the lift against).
        </p>

        <label className={styles.field}>
          <span className={styles.label}>
            Current win rate <span className={styles.optional}>(optional)</span>
          </span>
          <div className={styles.pillRow}>
            {WIN_RATES.map((w) => (
              <button
                key={w}
                type="button"
                className={`${styles.pill} ${form.win_rate === w ? styles.pillActive : ""}`}
                onClick={() => update("win_rate", form.win_rate === w ? "" : w)}
              >
                {w}
              </button>
            ))}
          </div>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            Deal profile <span className={styles.optional}>(optional)</span>
          </span>
          <div className={styles.pillRow}>
            {DEAL_PROFILES.map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.pill} ${form.deal_profile === d ? styles.pillActive : ""}`}
                onClick={() => update("deal_profile", form.deal_profile === d ? "" : d)}
              >
                {d}
              </button>
            ))}
          </div>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            Team experience <span className={styles.optional}>(optional)</span>
          </span>
          <div className={styles.pillRow}>
            {TEAM_EXPERIENCE.map((t) => (
              <button
                key={t}
                type="button"
                className={`${styles.pill} ${form.team_experience === t ? styles.pillActive : ""}`}
                onClick={() => update("team_experience", form.team_experience === t ? "" : t)}
              >
                {t}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your stack</h3>
        <p className={styles.sectionHint}>
          Check what your team uses today. Helps us prioritize which
          integration to set up first for your pilot.
        </p>

        <div className={styles.checkGrid}>
          {STACK_OPTIONS.map((tool) => (
            <label key={tool} className={styles.check}>
              <input
                type="checkbox"
                checked={form.current_stack.includes(tool)}
                onChange={() => toggleStack(tool)}
                className={styles.checkInput}
              />
              <span className={styles.checkBox} aria-hidden="true">
                <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
                  <path
                    d="M3 8 7 12 13 4"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>{tool}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>What&apos;s prompting this?</h3>
        <p className={styles.sectionHint}>
          We see three triggers recur — pick the one closest to your
          situation.
        </p>

        <div className={styles.radioGrid}>
          {TRIGGERS.map((t) => (
            <label
              key={t.value}
              className={`${styles.radio} ${
                form.trigger === t.value ? styles.radioActive : ""
              }`}
            >
              <input
                type="radio"
                name="trigger"
                value={t.value}
                checked={form.trigger === t.value}
                onChange={() => update("trigger", t.value)}
                className={styles.radioInput}
              />
              <span className={styles.radioMark} aria-hidden="true" />
              <span className={styles.radioLabel}>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <label className={styles.field}>
          <span className={styles.label}>
            Anything else we should know?{" "}
            <span className={styles.optional}>(optional)</span>
          </span>
          <textarea
            maxLength={2000}
            rows={4}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Specific deal you'd want Mallín to replay first. Names of competitors you're losing to. A quarter you can't explain."
            className={styles.textarea}
          />
        </label>
      </div>

      {status === "error" && (
        <div className={styles.error} role="alert">
          <b>Something didn&apos;t go through.</b>{" "}
          {errorMsg ||
            "Please try again, or email hello@mallin.io directly."}
        </div>
      )}

      <div className={styles.submitRow}>
        <button
          type="submit"
          disabled={status === "submitting"}
          className={styles.submit}
        >
          {status === "submitting" ? "Sending…" : "Request a pilot slot"}
          {status !== "submitting" && (
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
              <path
                d="M1 6h10M7 2l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
        <p className={styles.submitFoot}>
          We&apos;ll reply within 24 hours. No spam, no drip sequences —
          just real replies.
        </p>
      </div>
    </form>
  );
}
