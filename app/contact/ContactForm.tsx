"use client";

/**
 * ContactForm — client-side form for /contact.
 *
 * Same pattern as PilotForm but simpler: only name / email / message.
 * Posts to /api/contact. Three states: idle, submitting, success.
 */

import { useState, type FormEvent } from "react";
import styles from "./contact.module.css";

interface FormState {
  name: string;
  email: string;
  message: string;
}

const INITIAL: FormState = { name: "", email: "", message: "" };

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [hpField, setHpField] = useState<string>("");

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
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
          Got it. <em>We&apos;ll reply within 24 hours.</em>
        </h2>
        <p className={styles.successBody}>
          If anything urgent comes up in the meantime,{" "}
          <a href="mailto:hello@mallin.io">email us directly</a>.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
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

      <div className={styles.fieldRow2}>
        <label className={styles.field}>
          <span className={styles.label}>
            Your name <span className={styles.req}>*</span>
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
            Email <span className={styles.req}>*</span>
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

      <label className={styles.field}>
        <span className={styles.label}>
          Your message <span className={styles.req}>*</span>
        </span>
        <textarea
          required
          maxLength={4000}
          rows={6}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="What's on your mind? We typically reply within 24 hours."
          className={styles.textarea}
        />
      </label>

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
          {status === "submitting" ? "Sending…" : "Send message"}
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
          We&apos;ll reply within 24 hours. No drip sequences — just
          real replies.
        </p>
      </div>
    </form>
  );
}
