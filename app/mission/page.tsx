/**
 * Mission — public marketing page.
 *
 * Server component. No cockpit redirect: this page stays public for
 * signed-in and signed-out visitors alike. Cream brand (light theme) with a
 * full-bleed navy hero band, to match the homepage. Shares <SiteNav /> and
 * <SiteFooter />; styles live in app/home.module.css.
 */

import type { Metadata } from "next";
import styles from "../home.module.css";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";

export const metadata: Metadata = {
  title: "Mission — Mallín",
  description:
    "Why Mallín exists — organizations lose their best thinking every day, and we exist to keep it.",
};

export default function Mission() {
  return (
    <div className={styles.page}>
      <SiteNav />
      <main>
        <section className={styles.mvHero}>
          <div className={styles.mvHeroInner}>
            <p className={styles.mvEyebrow}>Our mission</p>
            <h1>Organizations lose their best thinking every day.</h1>
            <p className={styles.mvHeroLede}>
              The knowledge that actually wins, how your best people do it, lives in their heads,
              leaks out of thin systems, and walks out the door when they leave. Mallín exists to
              keep it, and turn it into how the whole team executes.
            </p>
          </div>
        </section>

        <section className={styles.mvBelief}>
          <div className={styles.mvInner}>
            <p className={styles.mvLabel}>Our belief</p>
            <h2 className={styles.mvHeading}>
              Teams don&apos;t have an information problem. They have an execution problem.
            </h2>
            <p className={styles.mvBody}>
              CRMs store data. AI generates answers. Neither one makes sure an organization
              executes consistently, keeps what it learns, or gets better over time.
            </p>
            <p className={styles.mvBold}>Mallín exists to close that gap.</p>
          </div>
        </section>

        <section className={styles.mvMvSection}>
          <div className={styles.mvInner}>
            <div className={styles.mvGrid}>
              <div className={styles.mvCol}>
                <p className={styles.mvLabel}>Mission</p>
                <p className={styles.mvStmt}>
                  Help every revenue team execute with the consistency, confidence, and judgment
                  of its best people.
                </p>
                <p className={styles.mvSub}>What we&apos;re doing today.</p>
              </div>
              <div className={styles.mvCol}>
                <p className={styles.mvLabel}>Vision</p>
                <p className={styles.mvStmt}>
                  Become the operating system for institutional knowledge, where an
                  organization&apos;s best thinking becomes how it decides and executes.
                </p>
                <p className={styles.mvSub}>
                  Sales is where we prove it first. Then wherever an organization&apos;s best
                  thinking is worth keeping.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
