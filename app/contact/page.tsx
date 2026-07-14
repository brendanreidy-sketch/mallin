/**
 * /contact — public contact-form page.
 *
 * Server component shell + client form. Submissions go to
 * POST /api/contact, which writes to contact_messages and emails
 * brendan@mallin.io.
 */

import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";
import styles from "./contact.module.css";

const CONTACT_EMAIL = "hello@mallin.io";

export const metadata: Metadata = {
  title: "Mallín — contact",
  description:
    "Reach the Mallín team. We reply within 24 hours — no drip sequences, just real replies.",
};

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <div className={styles.navWrap}>
        <nav className={styles.nav}>
          <a className={styles.wordmark} href="/">
            <svg
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
              <line x1="22" y1="22" x2="22" y2="17" stroke="#1a2230" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="32" y1="22" x2="32" y2="14" stroke="#1a2230" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="42" y1="22" x2="42" y2="17" stroke="#1a2230" strokeWidth="1.75" strokeLinecap="round" />
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
            <a className={styles.navLink} href="/pilot">
              Start a pilot
            </a>
            <a className={styles.navLink} href="/sign-in">
              Sign in
            </a>
          </div>
        </nav>
      </div>

      <main className={styles.main}>
        <p className={styles.eyebrow}>— Get in touch</p>
        <h1 className={styles.h1}>
          Say hello.<br />
          <em>We reply within 24 hours.</em>
        </h1>
        <p className={styles.lede}>
          Questions, partnership ideas, anything else — drop us a line.
          If you&apos;re ready to start a pilot,{" "}
          <strong>
            <a href="/pilot" style={{ color: "var(--blue)", textDecoration: "underline", textUnderlineOffset: "3px" }}>
              the pilot form
            </a>
          </strong>{" "}
          is the faster path. For everything else, this is the place.
        </p>

        <ContactForm />
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
