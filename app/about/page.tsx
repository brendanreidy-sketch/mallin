/**
 * About Mallín — public, photo-forward marketing page.
 *
 * Server component. No cockpit redirect: this page stays public for
 * signed-in and signed-out visitors alike. The mallín photo is a full-bleed
 * fixed background (iOS-safe fixed DIVs, not background-attachment:fixed)
 * with a dark scrim; the copy sits in white on top. Shares <SiteNav /> (in
 * its onDark variant) and <SiteFooter /> with the homepage; styles live in
 * app/home.module.css.
 */

import type { Metadata } from "next";
import styles from "../home.module.css";
import SiteNav from "../SiteNav";
import SiteFooter from "../SiteFooter";

export const metadata: Metadata = {
  title: "About Mallín",
  description:
    "Why a fifteen year sales leader built Mallín: governed native AI that captures how your team wins and keeps it, so the knowledge does not walk out the door.",
};

export default function About() {
  return (
    <div className={`${styles.page} ${styles.aboutPage}`}>
      <div className={styles.aboutBg} />
      <div className={styles.aboutScrim} />
      <SiteNav onDark />
      <main className={styles.aboutPhoto}>
        <div className={styles.aboutInner}>
          <h1>About Mallín</h1>

          <h2>Why I built Mallín</h2>
          <p className={styles.aboutBody}>
            I spent fifteen years in sales management, at Series A startups, public companies, and private equity backed
            firms. The hardest part was always the same: you cannot give every rep the same attention. The bandwidth is
            not there.
          </p>
          <p className={styles.aboutBody}>
            So you chase the pieces. Asking a good rep to update the CRM. Reminding them to get a level up to whoever
            actually holds the budget. Having the same coaching conversation for the third time. It wears the reps down,
            and management just as much.
          </p>
          <p className={styles.aboutBody}>
            Most of it would solve itself if the team just shared what it knew. One rep already figured out the move the
            next one is about to miss. So I built Mallín.
          </p>
          <p className={styles.aboutBody}>
            Mallín is governed native AI for sales teams. It does the homework before every call, points to the move that matters
            and the risk you are not seeing, and captures how your best people win so the whole team can use it, instead
            of losing it when someone leaves. Every rep gets the support of the whole team, and the knowledge that wins
            deals stays.
          </p>

          <p className={styles.aboutSig}>— Brendan Reidy, Founder</p>

          <hr className={styles.rule} />

          <h2>Why we&apos;re called Mallín</h2>
          <p className={styles.aboutBody}>
            A mallín is a wet meadow in Patagonia, fertile ground in dry country, where the water collects instead of
            running off. Sales runs dry the same way: what wins deals evaporates, stuck in one head, thin in the CRM,
            gone when someone leaves. Mallín is the meadow. It holds what your team learns and feeds it back, so what
            wins deals stays.
          </p>

          <div className={styles.aboutCta}>
            <a className={styles.primary} href="/start">
              Start free
            </a>
            <a className={styles.secondary} href="/how-it-works">
              See it on a real deal
            </a>
          </div>
        </div>
      </main>
      <p className={styles.aboutCredit}>
        Photo: Gdebandi / Wikimedia Commons,{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
      </p>
      <SiteFooter />
    </div>
  );
}
