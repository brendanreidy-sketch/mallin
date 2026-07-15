/**
 * Values — public marketing page.
 *
 * Server component. No cockpit redirect: this page stays public for
 * signed-in and signed-out visitors alike. Cream brand (light theme), to
 * match the homepage. Shares <SiteNav /> and <SiteFooter />; styles live in
 * app/home.module.css.
 */

import type { Metadata } from "next";
import styles from "../home.module.css";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";

export const metadata: Metadata = {
  title: "Values — Mallín",
  description: "The principles Mallín decides by, and the lines we will not cross.",
};

const PRINCIPLES = [
  "Institutional knowledge compounds.",
  "AI does the work; a human stays accountable.",
  "Truth over opinion.",
  "Execution over activity.",
  "Earn trust every day.",
  "Simplicity scales.",
];

export default function Values() {
  return (
    <div className={styles.page}>
      <SiteNav />
      <main>
        <section className={styles.valsHead}>
          <div className={styles.mvInner}>
            <p className={styles.mvLabel}>Our values</p>
            <h1>How we operate.</h1>
            <p className={styles.valsIntro}>
              The principles we decide by, and the lines we will not cross.
            </p>
          </div>
        </section>

        <section className={styles.valsPrinciples}>
          <div className={styles.mvInner}>
            <p className={styles.mvLabel}>Principles</p>
            <h2 className={styles.mvHeading}>How we decide.</h2>
            <ol className={styles.valsList}>
              {PRINCIPLES.map((text, i) => (
                <li key={text} className={styles.valsRow}>
                  <span className={styles.valsNum}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.valsText}>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={styles.valsNever}>
          <div className={styles.mvInner}>
            <p className={styles.mvLabel}>Our commitments</p>
            <h2 className={styles.mvHeading}>What we will never become.</h2>
            <ul className={styles.valsNeverList}>
              <li className={styles.valsNeverRow}>
                <span className={styles.valsX} aria-hidden="true">
                  ✕
                </span>
                <span className={styles.valsNeverText}>
                  We will never become <strong>another CRM.</strong>
                </span>
              </li>
              <li className={styles.valsNeverRow}>
                <span className={styles.valsX} aria-hidden="true">
                  ✕
                </span>
                <span className={styles.valsNeverText}>
                  We will never act on your behalf <strong>without your permission.</strong>
                </span>
              </li>
              <li className={styles.valsNeverRow}>
                <span className={styles.valsX} aria-hidden="true">
                  ✕
                </span>
                <span className={styles.valsNeverText}>
                  We will never build <strong>AI that lacks transparency.</strong>
                </span>
              </li>
              <li className={styles.valsNeverRow}>
                <span className={styles.valsX} aria-hidden="true">
                  ✕
                </span>
                <span className={styles.valsNeverText}>
                  We will never prioritize <strong>more features over better execution.</strong>
                </span>
              </li>
              <li className={styles.valsNeverRow}>
                <span className={styles.valsX} aria-hidden="true">
                  ✕
                </span>
                <span className={styles.valsNeverText}>
                  We will never <strong>sacrifice trust for speed.</strong>
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.valsClose}>
          <div className={styles.mvInner}>
            <p className={styles.valsCloseText}>
              These aren&apos;t slogans. They&apos;re the test we run on every decision, what we
              build, who we hire, which markets we enter, which customers we take. If it
              doesn&apos;t align, we don&apos;t do it.
            </p>
            <p className={styles.valsCloseNote}>
              Internally, this lives as The Mallín Operating Principles.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
