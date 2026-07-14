/**
 * /pilot — public pilot-program intake page.
 *
 * Server component shell + client form (PilotForm). All form state and
 * submission live in PilotForm; this file just owns the page layout,
 * copy, nav, and footer.
 *
 * Submissions go to POST /api/pilot-signup, which:
 *   1. Stores the row in pilot_signups (Supabase migration 013).
 *   2. Emails brendan@mallin.io via Resend (lib/email/resend.ts).
 *
 * Copy mirrors the warm-cream + navy + stream-blue palette of the live
 * landing page so the prospect sees visual continuity from /landing → /pilot.
 */

import type { Metadata } from "next";
import { PilotForm } from "./PilotForm";
import styles from "./pilot.module.css";

const CONTACT_EMAIL = "hello@mallin.io";

export const metadata: Metadata = {
  title: "Mallín — Start a pilot",
  description:
    "24-hour pilot setup. We connect to your sales stack and run Mallín on your last quarter. Two pilot slots open this quarter.",
};

export default function PilotPage() {
  return (
    <div className={styles.page}>
      <div className={styles.navWrap}>
        <nav className={styles.nav}>
          <a className={styles.wordmark} href="/">
            <svg
              className={styles.wordmarkIcon}
              viewBox="0 0 64 64"
              width="22"
              height="22"
              fill="none"
              role="img"
              aria-label="Mallín"
            >
              <path
                d="M 6 26 Q 18 21, 32 26 T 58 26"
                stroke="#1a2230"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1="22"
                y1="22"
                x2="22"
                y2="17"
                stroke="#1a2230"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <line
                x1="32"
                y1="22"
                x2="32"
                y2="14"
                stroke="#1a2230"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <line
                x1="42"
                y1="22"
                x2="42"
                y2="17"
                stroke="#1a2230"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M 3 42 Q 17 36, 32 42 T 61 42"
                stroke="#4a7186"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            Mallín
          </a>
          <div className={styles.navRight}>
            <a className={styles.navLink} href="/">
              ← Back to home
            </a>
            <a className={styles.navLink} href="/contact">
              Contact
            </a>
            <a className={styles.navLink} href="/sign-in">
              Sign in
            </a>
          </div>
        </nav>
      </div>

      <main className={styles.main}>
        <p className={styles.eyebrow}>— For B2B sales teams · Two pilot slots open</p>
        <h1 className={styles.h1}>
          Start a Mallín pilot.<br />
          <em>24-hour setup. Your stack. Your governance.</em>
        </h1>
        <p className={styles.lede}>
          We connect to your CRM, your conversation intelligence, and your
          team&apos;s Slack — then run Mallín on your last quarter inside
          twenty-four hours. <strong>The pilot IS the demo:</strong> a
          knowledge base built from eighteen months of your own activity,
          with verification alerts on every active deal.
        </p>

        <p style={{ fontSize: 14, color: "#6b7689", margin: "10px 0 0" }}>
          Flying solo? Mallín for individuals is self-serve —{" "}
          <a href="/start" style={{ color: "#4a7186", borderBottom: "1px solid #4a7186" }}>
            start free →
          </a>
        </p>

        <div className={styles.fastFacts}>
          <span>
            <b>24-hour</b> pilot setup
          </span>
          <span className={styles.sep}>·</span>
          <span>
            <b>30 days</b> of live deals
          </span>
          <span className={styles.sep}>·</span>
          <span>
            Calibrated by <b>your CRO &amp; C-suite</b>
          </span>
          <span className={styles.sep}>·</span>
          <span>
            <b>No</b> long-term commitment
          </span>
        </div>

        <PilotForm />
      </main>

      <footer className={styles.footer}>
        <span>© 2026 Mallín</span>
        <span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "16px", marginLeft: "auto" }}>
          <a href="/blog">Blog</a>
          <a href="/trust">Trust</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/security">Security</a>
        </span>
      </footer>
    </div>
  );
}
