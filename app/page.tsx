/**
 * Mallín homepage — simplified redesign.
 *
 * Ported verbatim from the approved static mockup at
 * docs/homepage-preview.html. Server component: signed-in reps bounce to
 * the cockpit; everyone else sees the marketing page. The hero's right
 * column is the client-side <HomeWalkthrough /> auto-advancing demo.
 *
 * Styles live in app/home.module.css.
 */

import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import styles from "./home.module.css";
import HomeWalkthrough from "./HomeWalkthrough";
import SiteNav from "./SiteNav";
import SiteFooter from "./SiteFooter";

export const metadata: Metadata = {
  title: "Mallín — the governed judgment layer for revenue teams",
  description:
    "Give Mallín whatever you have, a call, an email thread, or just the company you're about to meet, and it hands back a strategy for the deal: what to do next, the angles you missed, the risks you're not seeing. It preps you before the first call and remembers every deal after, so every rep gets the support they need, on every deal.",
};

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/cockpit");

  return (
    <div className={styles.page}>
      <SiteNav />

      <header className={styles.hero}>
        <div className={`${styles.container} ${styles.herogrid}`}>
          <div>
            <p className={styles.eyebrow}>Governed native AI for sales teams</p>
            <h1>The whole sales team, behind every rep.</h1>
            <p className={styles.sub}>
              Give Mallín whatever you have, a call, an email thread, or just the company you&apos;re about to meet,
              and it hands back a strategy for the deal: what to do next, the angles you missed, the risks you&apos;re
              not seeing. It preps you before the first call and remembers every deal after, so every rep gets the
              support they need, on every deal.
            </p>
            <div className={styles.ctarow}>
              <a className={styles.primary} href="/start">
                Start free
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                  <path
                    d="M1 6h10M7 2l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a className={styles.secondary} href="/pilot">
                Book a pilot
              </a>
            </div>
            <a className={styles.trylink} href="/try">
              Or try one call free, no signup →
            </a>
            <p className={styles.heronote}>Your first 3 deals are on us. No CRM, no setup.</p>
          </div>

          <HomeWalkthrough />
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2>Your reps learn how to win. That knowledge stays with them.</h2>
          <p className={styles.lede}>
            Reps get good by doing. Every deal sharpens how they sell the next one. Not on purpose, just by default,
            that judgment lives in their heads and a few thin CRM notes, never written down. The things your best
            people just know:
          </p>
          <ul className={styles.plist}>
            <li>Which partner to pull into which deal</li>
            <li>When to discount, and why</li>
            <li>How competitor X changes your pitch</li>
            <li>How to actually get a deal approved inside your own company</li>
            <li className={styles.more}>and so on</li>
          </ul>
          <p className={styles.lede} style={{ marginTop: 16 }}>
            Even while they are still here, a teammate is stuck on a problem this rep already solved, because the
            lesson never travels. And when they leave, it is gone for good: their deals stay in the pipeline, but what
            made them winnable does not, and neither do the lessons from the ones they lost.
          </p>
          <p className={styles.punch}>
            Through our governed native AI, Mallín captures these moments as they happen, and hands them back to the whole team
            as strategy.
          </p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.white}`}>
        <div className={styles.container}>
          <h2>One AI, across every tool your team uses.</h2>
          <p className={styles.lede}>
            Mallín connects to the systems reps already work in. It learns from the deals you won and the ones you
            lost, reads every conversation inside those tools, and turns what is working, and what is not, into a
            decision the whole team can act on.
          </p>
          <div className={styles.flowwrap}>
            <div className={styles.flow}>
              <div>
                <span className={styles.flabel}>What it reads</span>
                <div className={styles.srcgrid}>
                  <span className={styles.src}>Calls</span>
                  <span className={styles.src}>Email</span>
                  <span className={styles.src}>Chat</span>
                  <span className={styles.src}>Calendar</span>
                  <span className={styles.src}>CRM</span>
                  <span className={styles.src}>News &amp; signals</span>
                </div>
              </div>
              <span className={styles.farrow}>&rarr;</span>
              <div className={styles.hub}>
                <svg viewBox="0 0 64 64" width="26" height="26" fill="none">
                  <path d="M 6 26 Q 18 21, 32 26 T 58 26" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 3 42 Q 17 36, 32 42 T 61 42" stroke="#7fb0c8" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span className={styles.hubname}>Mallín</span>
                <span className={styles.hubsub}>learns what works, and what doesn&apos;t</span>
              </div>
              <span className={styles.farrow}>&rarr;</span>
              <div>
                <span className={styles.flabel}>What you get</span>
                <div className={styles.outcard}>A strategy for the deal, shared with the whole team</div>
              </div>
            </div>
          </div>
          <div className={styles.cards3}>
            <div className={styles.b}>
              <h3>Learns what wins, and what loses</h3>
              <p>
                It studies the deals you won for the habits behind the wins, and the ones you lost for the patterns
                that sink them, so it can tell you what is working, what is not, and when a deal is worth walking away
                from.
              </p>
            </div>
            <div className={styles.b}>
              <h3>A real strategy, every deal</h3>
              <p>The play, the risks you&apos;re not seeing, and the things you missed. Not a summary. A strategy.</p>
            </div>
            <div className={styles.b}>
              <h3>Less pressure on your team</h3>
              <p>
                The prep and the busywork get done for them, and no one has to carry a deal alone. The team spends its
                energy selling, not recapping.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="pricing">
        <div className={styles.container}>
          <div className={styles.pricehead}>
            <h2>Start on your own. Bring the team when you&apos;re ready.</h2>
            <p className={styles.lede}>
              One rep can start free today. When the floor wants in, we price the team to the value.
            </p>
          </div>
          <div className={styles.tiers}>
            <div className={styles.tier}>
              <div className={styles.tname}>Free</div>
              <div>
                <span className={styles.price}>$0</span> <span className={styles.per}>first 3 deals</span>
              </div>
              <p className={styles.tsub}>Run it on three real deals before you decide anything.</p>
            </div>
            <div className={`${styles.tier} ${styles.feat}`}>
              <div className={styles.tname}>
                Pro <span className={styles.badge}>For reps</span>
              </div>
              <div>
                <span className={styles.price}>$29.99</span> <span className={styles.per}>per month</span>
              </div>
              <p className={styles.tsub}>Unlimited, for the individual rep, on your own card.</p>
            </div>
            <div className={styles.tier}>
              <div className={styles.tname}>Team</div>
              <div>
                <span className={styles.price}>Let&apos;s talk</span> <span className={styles.per}>per seat</span>
              </div>
              <p className={styles.tsub}>
                Shared memory, manager visibility, and CRM write back for the whole floor.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trust}>
        <div className={styles.container}>
          <div className={styles["trust-inner"]}>
            <span className={styles.ti}>
              <svg
                viewBox="0 0 20 20"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="8" />
                <path d="M6.5 10.5l2.5 2.5 4.5-5" />
              </svg>{" "}
              What it learns from your data stays yours
            </span>
            <span className={styles.ti}>
              <svg
                viewBox="0 0 20 20"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="8" />
                <path d="M6.5 10.5l2.5 2.5 4.5-5" />
              </svg>{" "}
              Every CRM write is yours to approve
            </span>
            <span className={styles.ti}>
              <svg
                viewBox="0 0 20 20"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="8" />
                <path d="M6.5 10.5l2.5 2.5 4.5-5" />
              </svg>{" "}
              Nothing is auto-sent
            </span>
            <a className={styles["trust-link"]} href="/trust">
              Our approach to trust →
            </a>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.final}`}>
        <div className={styles.container}>
          <h2>See it on a real deal.</h2>
          <p>
            Give Mallín a deal you&apos;re working right now and watch it hand back the strategy your team has been
            missing.
          </p>
          <div className={styles.ctarow} style={{ justifyContent: "center" }}>
            <a className={styles.primary} href="/start">
              Start free
            </a>
            <a className={styles.secondary} href="/pilot">
              Book a pilot
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
