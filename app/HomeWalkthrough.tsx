/**
 * Landing hero — a static, product-faithful Cockpit recreation using fictional
 * illustrative data. This is NOT a screenshot of the live product.
 *
 * Replaces the previous auto-advancing five-panel walkthrough: all timers, step
 * state, carousel behaviour, animated transitions, and interactive mode chips
 * are removed. It renders as a labelled illustrative figure (role="img") whose
 * inner content is decorative and non-focusable — no motion, no controls, no
 * keyboard traps.
 *
 * Styles live in app/HomeWalkthrough.module.css (isolated; --ck-* tokens only),
 * so the shared app/home.module.css and the site nav/footer stay untouched.
 */

import s from "./HomeWalkthrough.module.css";

export default function HomeWalkthrough() {
  return (
    <figure
      className={s.window}
      role="img"
      aria-label="Illustrative Mallín Cockpit — a deals view with sample data"
    >
      <div aria-hidden="true">
        <div className={s.chrome}>
          <span className={`${s.dot} ${s.dotR}`} />
          <span className={`${s.dot} ${s.dotY}`} />
          <span className={`${s.dot} ${s.dotG}`} />
          <span className={s.brand}>
            <svg viewBox="0 0 64 64" width="16" height="16" fill="none">
              <path className={s.wave1} d="M 6 26 Q 18 21, 32 26 T 58 26" strokeWidth="3" strokeLinecap="round" />
              <path className={s.wave2} d="M 3 42 Q 17 36, 32 42 T 61 42" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Mallín
          </span>
        </div>

        <div className={s.body}>
          <p className={s.eyebrow}>THURSDAY, MAY 8</p>
          <p className={s.greeting}>Good morning, Jordan</p>
          <p className={s.brief}>1 deal needs you today, 2 on track. I&apos;d start with Meridian Freight.</p>

          <div className={s.groupHead}>
            <p className={s.needsLabel}>Needs you · 1</p>
            <span className={s.newDeal}>+ New deal</span>
          </div>

          <div className={s.focus}>
            <div className={s.focusTop}>
              <span className={s.focusName}>
                <span className={s.dotCrit} />
                <span className={s.n}>Meridian Freight — workflow automation evaluation</span>
              </span>
              <span className={`${s.pill} ${s.pillLive}`}>Live brief</span>
            </div>
            <p className={s.focusWhy}>
              Security requirement unresolved — legal won&apos;t re-engage until the updated DPA lands (blocking).
            </p>
          </div>

          <p className={s.trackLabel}>On track · 2</p>
          <div className={s.rows}>
            <div className={s.row}>
              <span className={s.dotGood} />
              <span className={s.rowMain}>
                <span className={s.rowName}>Cobalt Analytics — BI rollout</span>
                <span className={s.rowWhy}>
                  Walk out of the first call with their top-two reporting gaps in writing.
                </span>
              </span>
              <span className={`${s.pill} ${s.pillPre}`}>Pre-call</span>
            </div>
            <div className={s.row}>
              <span className={s.dotGood} />
              <span className={s.rowMain}>
                <span className={s.rowName}>Harbor Point Health — scheduling pilot</span>
                <span className={s.rowWhy}>Confirm the two clinic workflows to anchor the demo.</span>
              </span>
              <span className={`${s.pill} ${s.pillPre}`}>Pre-call</span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
