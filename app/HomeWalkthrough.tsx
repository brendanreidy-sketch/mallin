"use client";

/**
 * Hero walkthrough card — the auto-advancing five-step product demo.
 *
 * Ported from the <script> in docs/homepage-preview.html. The stage cycles
 * through panels 0..4 on a per-step timer; clicking a mode chip pauses the
 * loop and jumps to that step. CSS (app/home.module.css) drives which panel
 * is visible via the `.stage[data-step="N"] .panel[data-i="N"]` selector.
 */

import { useEffect, useState } from "react";
import styles from "./home.module.css";

const durs = [2500, 4800, 5600, 4400, 5200];
// Each mode chip jumps to a specific step.
const chipStep = [1, 2, 3, 4];

export default function HomeWalkthrough() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => {
      setStep((s) => (s + 1) % 5);
    }, durs[step]);
    return () => clearTimeout(timer);
  }, [step, paused]);

  function jumpTo(target: number) {
    setPaused(true);
    setStep(target);
  }

  // Chip "on" states, matching the mockup's render() logic.
  const chipOn = [step <= 1, step === 2, step === 3, step === 4];
  const chipLabels = ["1 · Research", "2 · The strategy", "3 · The deck", "4 · Your deals"];

  return (
    <div className={styles.card}>
      <div className={styles.chrome}>
        <span className={styles.dot} style={{ background: "#e0655a" }} />
        <span className={styles.dot} style={{ background: "#e6a93c" }} />
        <span className={styles.dot} style={{ background: "#57a869" }} />
        <span className={styles.cbrand}>
          <svg viewBox="0 0 64 64" width="16" height="16" fill="none">
            <path d="M 6 26 Q 18 21, 32 26 T 58 26" stroke="#1a2230" strokeWidth="3" strokeLinecap="round" />
            <path d="M 3 42 Q 17 36, 32 42 T 61 42" stroke="#4a7186" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Mallín
        </span>
        <span className={styles.deal}>Westfield Robotics</span>
      </div>

      <div className={styles.mode}>
        {chipLabels.map((label, i) => (
          <span
            key={label}
            className={`${styles.chip}${chipOn[i] ? ` ${styles.on}` : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => jumpTo(chipStep[i])}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                jumpTo(chipStep[i]);
              }
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className={styles.stage} data-step={step}>
        <div className={styles.panel} data-i={0}>
          <p className={styles.steptitle}>Before the first call</p>
          <p className={styles.cue}>No call yet. Just the company you&apos;re about to meet. Mallín goes to work.</p>
          <div className={styles.work}>
            <div className={styles.wline}>
              <span className={styles.tick}>✓</span> Reading the company
            </div>
            <div className={styles.wline}>
              <span className={styles.tick}>✓</span> Finding who you&apos;re meeting
            </div>
            <div className={`${styles.wline} ${styles.pending}`}>
              <span className={styles.spin} /> Scanning for recent signals
            </div>
          </div>
        </div>

        <div className={styles.panel} data-i={1}>
          <p className={styles.steptitle}>What Mallín found</p>
          <div className={styles.intel}>
            <p className={styles.co}>Series B robotics maker, 240 people, pushing into warehouse automation.</p>
            <div className={styles.people}>
              <div className={styles.person}>
                <span className={styles.av}>PN</span>
                <span>
                  <span className={styles.pn}>Priya Nadkarni</span>{" "}
                  <span className={styles.pr}>· VP Operations · the person you&apos;re meeting</span>
                </span>
              </div>
              <div className={styles.person}>
                <span className={styles.av}>ML</span>
                <span>
                  <span className={styles.pn}>Marcus Lee</span>{" "}
                  <span className={styles.pr}>· Director of IT · will weigh in on rollout</span>
                </span>
              </div>
            </div>
            <div className={styles.signal}>
              <b>Signal:</b> posted two warehouse operations roles last week. They are scaling the exact team your
              product serves.
            </div>
          </div>
        </div>

        <div className={styles.panel} data-i={2}>
          <p className={styles.steptitle}>The strategy</p>
          <p className={styles.cue}>After your discovery call with Priya on Tuesday.</p>
          <div className={styles.read}>
            <div className={`${styles.block} ${styles.mv}`}>
              <p className={styles.k}>The play</p>
              <p className={styles.v}>
                Get the budget owner in the room before you demo. A great demo to the wrong people stalls here.
              </p>
            </div>
            <div className={`${styles.block} ${styles.ms}`}>
              <p className={styles.k}>What you may have missed</p>
              <p className={styles.v}>
                Priya mentioned a Q3 board review in passing. That is your real deadline, not the close date on the
                deal.
              </p>
            </div>
            <div className={`${styles.block} ${styles.rk}`}>
              <p className={styles.k}>What you&apos;re not seeing</p>
              <p className={styles.v}>
                IT has quietly become a second decision maker. Marcus can stall this, and you have not won him yet.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.panel} data-i={3}>
          <p className={styles.steptitle}>A deck for the meeting</p>
          <div className={styles.deckrow}>
            <div className={styles.slide}>
              <div className={styles.slidebody}>
                <div className={styles.slidetitle}>Westfield Robotics</div>
                <div className={styles.slidesub}>Scaling warehouse automation, together</div>
                <div className={styles.sline} />
                <div className={`${styles.sline} ${styles.short}`} />
              </div>
              <div className={styles.logos}>
                <span className={styles.lg}>WR</span>
                <span className={styles.lg}>YOU</span>
              </div>
            </div>
            <div className={styles.deckmeta}>
              <p className={styles.deckcopy}>
                Built from the deal, dual branded with your logo and theirs. Ready for the meeting.
              </p>
              <button className={styles.exportbtn}>
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                  <path
                    d="M8 2v8m0 0l3-3m-3 3L5 7M3 13h10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>{" "}
                Export to PowerPoint
              </button>
              <span className={styles.filetag}>
                Westfield Robotics <span className={styles.pill}>.pptx</span>
              </span>
            </div>
          </div>
        </div>

        <div className={styles.panel} data-i={4}>
          <p className={styles.steptitle}>When you sign in</p>
          <p className={styles.cue}>Every deal you&apos;re working, right where you left it.</p>
          <div className={styles.lib}>
            <div className={`${styles.row} ${styles.hot}`}>
              <span className={styles.rav}>WR</span>
              <div className={styles.rmain}>
                <div className={styles.rname}>Westfield Robotics</div>
                <div className={styles.rsub}>New business · next: get the budget owner in the room</div>
              </div>
              <span className={`${styles.rchip} ${styles.adv}`}>just now</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rav}>BL</span>
              <div className={styles.rmain}>
                <div className={styles.rname}>Brightline Logistics</div>
                <div className={styles.rsub}>Discovery · next: book the technical demo</div>
              </div>
              <span className={`${styles.rchip} ${styles.adv}`}>advancing</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rav}>CS</span>
              <div className={styles.rmain}>
                <div className={styles.rname}>Cedar Systems</div>
                <div className={styles.rsub}>Security review · next: send the SOC 2 docs</div>
              </div>
              <span className={`${styles.rchip} ${styles.pend}`}>pending</span>
            </div>
            <div className={styles.row}>
              <span className={styles.rav}>HF</span>
              <div className={styles.rmain}>
                <div className={styles.rname}>Halcyon Freight</div>
                <div className={styles.rsub}>Inherited · next: reconnect · full history is here</div>
              </div>
              <span className={`${styles.rchip} ${styles.kept}`}>saved</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.rail}>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`${styles.seg}${i <= step ? ` ${styles.full}` : ""}`}>
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}
