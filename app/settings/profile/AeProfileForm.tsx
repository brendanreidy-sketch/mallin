"use client";

/**
 * The AE intro confirm flow. "Find me on LinkedIn" runs enrichment and fills
 * the fields as a DRAFT; the rep edits freely and clicks Confirm to put it on
 * their decks. Nothing is confirmed until they say so.
 */
import { useState } from "react";
import styles from "./profile.module.css";

interface Initial {
  name: string;
  company: string;
  title: string;
  linkedinUrl: string;
  bio: string;
  confirmed: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "finding" }
  | { kind: "saving" }
  | { kind: "info"; msg: string }
  | { kind: "error"; msg: string }
  | { kind: "confirmed" };

export default function AeProfileForm({ initial }: { initial: Initial }) {
  const [title, setTitle] = useState(initial.title);
  const [linkedinUrl, setLinkedinUrl] = useState(initial.linkedinUrl);
  const [bio, setBio] = useState(initial.bio);
  const [confirmed, setConfirmed] = useState(initial.confirmed);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy = status.kind === "finding" || status.kind === "saving";

  async function find() {
    setStatus({ kind: "finding" });
    try {
      const res = await fetch("/api/settings/ae-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ kind: "error", msg: data.error ?? "Couldn't look you up." });
        return;
      }
      const p = data.proposal ?? {};
      if (p.title) setTitle(p.title);
      if (p.linkedin_url) setLinkedinUrl(p.linkedin_url);
      if (p.bio) setBio(p.bio);
      setStatus(
        p.low_confidence
          ? { kind: "info", msg: "Found a possible match, but I'm not fully sure it's you — please double-check every field before confirming." }
          : { kind: "info", msg: "Here's what I found. Edit anything, then confirm to put it on your decks." },
      );
    } catch {
      setStatus({ kind: "error", msg: "Network error — try again or enter your details by hand." });
    }
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/ae-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", title, linkedin_url: linkedinUrl, bio }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ kind: "error", msg: data.error ?? "Couldn't save." });
        return;
      }
      setConfirmed(true);
      setStatus({ kind: "confirmed" });
    } catch {
      setStatus({ kind: "error", msg: "Network error — try again." });
    }
  }

  async function clear() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/settings/ae-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ kind: "error", msg: data.error ?? "Couldn't update." });
        return;
      }
      setConfirmed(false);
      setStatus({ kind: "info", msg: "Removed from your decks. Confirm again to put it back." });
    } catch {
      setStatus({ kind: "error", msg: "Network error — try again." });
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.identity}>
        <div>
          <span className={styles.identName}>{initial.name || "Your name"}</span>
          {initial.company && <span className={styles.identCompany}> · {initial.company}</span>}
        </div>
        <span className={confirmed ? styles.pillOn : styles.pillOff}>
          {confirmed ? "● On your decks" : "○ Not on decks yet"}
        </span>
      </div>

      <button type="button" className={styles.btnSecondary} onClick={find} disabled={busy}>
        {status.kind === "finding" ? "Looking you up…" : "Find me on LinkedIn"}
      </button>

      {status.kind === "info" && <p className={styles.info}>{status.msg}</p>}
      {status.kind === "error" && <p className={styles.error}>{status.msg}</p>}
      {status.kind === "confirmed" && <p className={styles.ok}>✓ Confirmed — this now opens your decks.</p>}

      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Account Executive"
          maxLength={80}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>LinkedIn URL</span>
        <input
          className={styles.input}
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/…"
          maxLength={300}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>One-line background</span>
        <textarea
          className={styles.textarea}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Two lines about you — where you've worked, what you focus on."
          maxLength={240}
          rows={3}
        />
        <span className={styles.count}>{bio.length}/240</span>
      </label>

      <div className={styles.actions}>
        <button type="button" className={styles.btnPrimary} onClick={save} disabled={busy}>
          {status.kind === "saving" ? "Saving…" : confirmed ? "Update" : "Confirm & add to decks"}
        </button>
        {confirmed && (
          <button type="button" className={styles.btnGhost} onClick={clear} disabled={busy}>
            Remove from decks
          </button>
        )}
      </div>
    </section>
  );
}
