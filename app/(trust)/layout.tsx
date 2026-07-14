/**
 * Shared layout for /trust, /privacy, /terms, /security,
 * /ai-governance, /subprocessors.
 *
 * Provides the warm-cream nav + footer shell so each policy page
 * only renders its content. Same Mallín wordmark + palette as
 * /contact and /pilot.
 */

import type { ReactNode } from "react";
import styles from "./trust.module.css";

const CONTACT_EMAIL = "hello@mallin.io";

export default function TrustLayout({ children }: { children: ReactNode }) {
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
            <a className={styles.navLink} href="/blog">
              Blog
            </a>
            <a className={styles.navLink} href="/trust">
              Trust
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

      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        <span>© 2026 Mallín</span>
        <span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </span>
        <span className={styles.footerLinks}>
          <a href="/blog">Blog</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/security">Security</a>
          <a href="/ai-governance">AI Policy</a>
          <a href="/subprocessors">Subprocessors</a>
        </span>
      </footer>
    </div>
  );
}
