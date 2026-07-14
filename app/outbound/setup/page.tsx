"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "../outbound.module.css";

/**
 * /outbound/setup — the onboarding form.
 *
 * What you sell + one seed company → POST /api/outbound/setup → the lookalike
 * agent derives + saves the ICP → we render the derivation (seed profile,
 * rationale, industries, personas) for the customer to read before running.
 * The derive-and-save happens server-side, so once it returns the config is
 * already persisted; this screen is a confirmation, not a second save step.
 *
 * First structural pass: auth-gated, tuned on deploy.
 */

interface IndustryTarget {
  name: string;
  fit_notes?: string;
}
interface Persona {
  role: string;
}
interface DerivedConfig {
  industries?: IndustryTarget[];
  personas?: Persona[];
}
interface SetupResult {
  config: DerivedConfig;
  seedProfile: string;
  rationale: string;
}

export default function OutboundSetupPage() {
  const router = useRouter();
  const [offering, setOffering] = useState("");
  const [seedCompany, setSeedCompany] = useState("");
  const [seedWebsite, setSeedWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);

  async function onDerive(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/outbound/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offering: offering.trim(),
          seedCompany: seedCompany.trim(),
          seedWebsite: seedWebsite.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(data as SetupResult);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const industries = result.config.industries ?? [];
    const personas = result.config.personas ?? [];
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Here's the ICP we derived</h1>
          <p className={styles.lede}>
            From {seedCompany}, through the lens of what you sell. Read it over —
            it's already saved. When it looks right, start sourcing.
          </p>
        </header>

        <div className={styles.reviewCard}>
          <div className={styles.reviewBlock}>
            <span className={styles.reviewLabel}>Seed profile</span>
            <p className={styles.reviewText}>{result.seedProfile}</p>
          </div>
          <div className={styles.reviewBlock}>
            <span className={styles.reviewLabel}>Why these axes find fits, not twins</span>
            <p className={styles.reviewText}>{result.rationale}</p>
          </div>
          {industries.length > 0 && (
            <div className={styles.reviewBlock}>
              <span className={styles.reviewLabel}>Industries</span>
              <div className={styles.tagRow}>
                {industries.map((i, idx) => (
                  <span key={idx} className={styles.tag}>
                    {i.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {personas.length > 0 && (
            <div className={styles.reviewBlock}>
              <span className={styles.reviewLabel}>Personas to reach</span>
              <div className={styles.tagRow}>
                {personas.map((p, idx) => (
                  <span key={idx} className={styles.tag}>
                    {p.role}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.actions} style={{ marginTop: 20 }}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => router.push("/outbound")}
          >
            Go to the review queue
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => {
              setResult(null);
            }}
          >
            Redo from a different seed
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Set up outbound</h1>
        <p className={styles.lede}>
          Tell us what you sell and name one company you'd want more of. We'll
          study that seed and derive who to target — then source real prospects
          with a live reason to reach them.
        </p>
      </header>

      <form className={styles.form} onSubmit={onDerive}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="offering">
            What you sell{" "}
            <span className={styles.hint}>— a sentence or two; this anchors every fit</span>
          </label>
          <textarea
            id="offering"
            className={styles.textarea}
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            placeholder="e.g. A governed AI operating layer for revenue execution — reads each live deal, surfaces the one load-bearing risk a rep can't hold mid-call, drafts the CRM update for one-click approval."
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="seedCompany">
            One seed company{" "}
            <span className={styles.hint}>— your best-fit account; we'll find more like it</span>
          </label>
          <input
            id="seedCompany"
            className={styles.input}
            value={seedCompany}
            onChange={(e) => setSeedCompany(e.target.value)}
            placeholder="e.g. Ramp"
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="seedWebsite">
            Seed website <span className={styles.hint}>— optional, disambiguates same-named companies</span>
          </label>
          <input
            id="seedWebsite"
            className={styles.input}
            value={seedWebsite}
            onChange={(e) => setSeedWebsite(e.target.value)}
            placeholder="https://ramp.com"
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? "Deriving your ICP…" : "Derive my ICP"}
          </button>
          <Link href="/outbound" className={styles.btnGhost}>
            Skip to review queue
          </Link>
        </div>
        {busy && (
          <p className={styles.hint}>
            This studies the seed on the live web — it can take a minute.
          </p>
        )}
      </form>
    </div>
  );
}
