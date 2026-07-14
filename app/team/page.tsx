/**
 * The team — public marketing page.
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
import { BRENDAN_LINKEDIN } from "../site-links";

export const metadata: Metadata = {
  title: "The team — Mallín",
  description: "The people building Mallín.",
};

export default function Team() {
  return (
    <div className={styles.page}>
      <SiteNav />
      <main className={styles.team}>
        <p className={styles.teamEyebrow}>The team</p>
        <h1 className={styles.teamH1}>Who&apos;s building Mallín</h1>

        <div className={styles.teamCard}>
          <img
            className={styles.teamAvatar}
            src="/team/brendan.jpg"
            alt="Brendan Reidy"
            width={140}
            height={140}
          />
          <div className={styles.teamName}>Brendan Reidy</div>
          <div className={styles.teamTitle}>Founder &amp; CEO</div>
          <p className={styles.teamHobbies}>
            <span>Off the clock</span>
            Snowboarding, working, and catching live shows.
          </p>
          <a className={styles.teamLi} href={BRENDAN_LINKEDIN} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#0a66c2" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
            </svg>
            Connect on LinkedIn
          </a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
