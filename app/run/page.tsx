import Link from "next/link";
import styles from "./run.module.css";

/**
 * /run — the May 2026 closed-lost retrospective, unrolled call-by-call.
 *
 * This is the "demonstrate, not explain" surface. Same deal the landing
 * mechanism section references. Seven calls. Twelve alerts. Two manager
 * loop-in DMs. Anonymized substrate. Read top to bottom.
 *
 * Intent: a careful buyer who's just read the landing's proof scrolls
 * here and gets to see the *reasoning*, not just the claim. Each call
 * lays the team's note (what they wrote in the CRM) next to Mallín's
 * read (what the call data and external signal actually surfaced).
 */

const CONTACT_EMAIL = "hello@mallin.io";

type Severity = "info" | "warn" | "high";

interface Alert {
  label: string;
  severity: Severity;
  dm?: boolean;
}

interface CallEvent {
  num: number;
  phase: string;
  date: string;
  teamNote: string;
  mallinRead: string;
  alerts: Alert[];
  outcome?: "closed-lost";
}

// Anonymized from a real deal corpus — cycle / outcomes are real.
const CALLS: CallEvent[] = [
  {
    num: 1,
    phase: "Discovery",
    date: "Day 1",
    teamNote:
      "Strong initial conversation. Champion (manager, finance) committed to bringing in finance leadership next.",
    mallinRead: "Healthy discovery. No verification gaps surfaced.",
    alerts: [],
  },
  {
    num: 2,
    phase: "Deep dive",
    date: "Day 9",
    teamNote:
      "Demoed core workflows. Champion engaged. Mentioned an incumbent vendor in passing.",
    mallinRead:
      "Incumbent named. No head-to-head plan in the deal record yet, but tracking competitive context.",
    alerts: [{ label: "Competition mentioned", severity: "info" }],
  },
  {
    num: 3,
    phase: "Technical demo",
    date: "Day 18",
    teamNote:
      "SE walked through integrations. Strong technical fit confirmed.",
    mallinRead: "Tracking. No gaps surfacing yet.",
    alerts: [],
  },
  {
    num: 4,
    phase: "Signer demo",
    date: "Day 31",
    teamNote: "Demo went well. CFO attended.",
    mallinRead:
      "Signer asked zero questions across the call. Champion-commitment pattern now inconsistent with deal stage — signer is supposed to be engaging here.",
    alerts: [{ label: "Signer disengagement", severity: "warn" }],
  },
  {
    num: 5,
    phase: "Pricing & objection",
    date: "Day 46",
    teamNote:
      "Discussed pricing. They're evaluating the incumbent in parallel. We're confident we're ahead.",
    mallinRead:
      "Three concurrent gaps. Competitor named six weeks ago — still no head-to-head plan documented. Champion has never introduced anyone above their direct manager. Signer commitment pattern still inconsistent. Two of these fire as manager-loop-in DMs.",
    alerts: [
      { label: "Competitive escalation", severity: "high", dm: true },
      { label: "Power-map gap", severity: "high", dm: true },
      { label: "Champion-commitment warning", severity: "warn" },
    ],
  },
  {
    num: 6,
    phase: "Follow-up",
    date: "Day 67",
    teamNote: "Champion positive. Asked for the procurement template.",
    mallinRead:
      "No signature date confirmed. Champion has never said the phrase “we’re choosing you.” Three follow-up demos completed with the same stakeholders — no new evidence surfaced.",
    alerts: [
      { label: "Contract path not locked", severity: "warn" },
      { label: "Stage stall", severity: "warn" },
    ],
  },
  {
    num: 7,
    phase: "Close call",
    date: "Day 89",
    teamNote: "Champion informed us they're going with the incumbent.",
    mallinRead: "Outcome matched every gap Mallín had surfaced from call 4 onward.",
    alerts: [],
    outcome: "closed-lost",
  },
];

export default function Run() {
  const shownAlerts = CALLS.reduce((n, c) => n + c.alerts.length, 0);
  const dmCount = CALLS.reduce(
    (n, c) => n + c.alerts.filter((a) => a.dm).length,
    0,
  );

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.wordmark}>
          Mallín
        </Link>
        <Link href="/" className={styles.navLink}>
          ← Back
        </Link>
      </header>

      <main className={styles.main}>
        {/* ─── Intro ─── */}
        <section className={styles.intro}>
          <p className={styles.eyebrow}>The May 2026 closed-lost · re-run</p>
          <h1 className={styles.headline}>
            Same deal the landing references.
            <br />
            Now in detail.
          </h1>
          <p className={styles.deck}>
            We re-ran Mallín against the most recent closed-lost in our
            corpus. Seven calls. 12 verification alerts total ({shownAlerts}{" "}
            material gaps shown below; the rest were lower-severity
            tracking signals). {dmCount} manager-loop-in DMs. Anonymized
            substrate, real cycle. Scroll to follow.
          </p>

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Deal value</dt>
              <dd>Mid-six-figure ARR</dd>
            </div>
            <div className={styles.fact}>
              <dt>Cycle length</dt>
              <dd>~89 days, 7 calls</dd>
            </div>
            <div className={styles.fact}>
              <dt>Outcome</dt>
              <dd>Closed-lost to named competitor</dd>
            </div>
            <div className={styles.fact}>
              <dt>Replay date</dt>
              <dd>May 2026</dd>
            </div>
          </dl>
        </section>

        {/* ─── Timeline ─── */}
        <section className={styles.timeline}>
          {CALLS.map((c) => (
            <CallRow key={c.num} call={c} />
          ))}
        </section>

        {/* ─── Closing observation ─── */}
        <section className={styles.closing}>
          <h2 className={styles.closingTitle}>What this changes</h2>

          <div className={styles.closingTwoCol}>
            <div className={styles.closingCol}>
              <h3 className={styles.closingColTitle}>Without Mallín</h3>
              <p>
                The team already knew the signer had disengaged after the
                demo. They knew the competitor was winning the head-to-head
                by call 5. They softened both. The deal slipped on the
                final call. The retrospective started with{" "}
                <em>&ldquo;we should have…&rdquo;</em>
              </p>
            </div>
            <div className={styles.closingCol}>
              <h3 className={styles.closingColTitle}>With Mallín</h3>
              <p>
                Two of the call-5 alerts post into the deal Slack thread
                the manager is already in — gap named in plain language,
                verbatim next question to ask. The rep can&apos;t quietly
                skirt the head-to-head. The manager has seen it. The next
                move has to be the head-on one.
              </p>
            </div>
          </div>

          <blockquote className={styles.quote}>
            It would have provided a way for us to address it head-on
            versus skirting around it.
          </blockquote>
          <p className={styles.quoteAttribution}>
            — from the team that ran the original deal, after replay
          </p>

          <p className={styles.closingNote}>
            That&apos;s the mechanism. Not surfacing signal — making the
            conversation unavoidable. Replay, recall, and confirm-rate
            measurement all serve it.
          </p>
        </section>

        {/* ─── CTA ─── */}
        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>See it run on your deals</h2>
          <p className={styles.ctaCopy}>
            We connect to your Gong library and CRM, run the
            intelligence agent across your account list, and within 24
            hours present a knowledge base built from your own sales
            history.
          </p>
          <a
            className={styles.ctaPrimary}
            href={`mailto:${CONTACT_EMAIL}?subject=Mallín`}
          >
            Get in touch
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>© 2026 Mallín</div>
          <div className={styles.footerLinks}>
            <Link href="/">Home</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CallRow({ call }: { call: CallEvent }) {
  const isOutcome = call.outcome === "closed-lost";
  return (
    <article
      className={`${styles.call} ${isOutcome ? styles.callOutcome : ""}`}
    >
      <aside className={styles.callMarker}>
        <div className={styles.callNum}>{call.num}</div>
        <div className={styles.callDate}>{call.date}</div>
      </aside>

      <div className={styles.callBody}>
        <h3 className={styles.callPhase}>
          Call {call.num} · {call.phase}
        </h3>

        <div className={styles.callGrid}>
          <div className={styles.callTeam}>
            <div className={styles.callLabel}>Team&apos;s note</div>
            <p className={styles.callTeamNote}>&ldquo;{call.teamNote}&rdquo;</p>
          </div>

          <div className={styles.callMallin}>
            <div className={styles.callLabel}>Mallín&apos;s read</div>
            <p className={styles.callMallinRead}>{call.mallinRead}</p>

            {call.alerts.length > 0 && (
              <ul className={styles.callAlerts}>
                {call.alerts.map((a, i) => (
                  <li
                    key={i}
                    className={`${styles.alert} ${
                      a.severity === "high"
                        ? styles.alertHigh
                        : a.severity === "warn"
                          ? styles.alertWarn
                          : styles.alertInfo
                    }`}
                  >
                    <span className={styles.alertLabel}>{a.label}</span>
                    {a.dm && (
                      <span className={styles.alertDM}>manager DM</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isOutcome && (
              <div className={styles.outcomeBadge}>Closed-lost</div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
