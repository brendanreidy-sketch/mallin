"use client";

/**
 * Site navigation — the pronunciation topbar plus the primary nav with
 * click/hover dropdown menus (Product ▾, Company ▾).
 *
 * Ported from the approved static mockup at docs/homepage-preview.html and
 * the dropdown spec that accompanied it. Dropped into every marketing page as
 * a single component so the topbar + nav stay in sync.
 *
 * Behavior (converted from the mockup's toggle <script>): a single `open`
 * state tracks which menu is expanded. Clicking a trigger toggles that menu
 * and closes the other; clicking outside or pressing Escape closes both. The
 * CSS keeps `:hover` opening the menus too — the React `open` class is an
 * additional path for click/touch/keyboard.
 *
 * Styles live in app/home.module.css.
 */

import { useEffect, useState } from "react";
import styles from "./home.module.css";
import { LINKEDIN_URL } from "./site-links";

type Menu = "product" | "company";

export default function SiteNav({ onDark = false }: { onDark?: boolean }) {
  const [open, setOpen] = useState<Menu | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (open === null && !mobileOpen) return;
    function onDocClick() {
      setOpen(null);
      setMobileOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobileOpen]);

  function toggle(menu: Menu, e: React.MouseEvent) {
    e.stopPropagation();
    setOpen((cur) => (cur === menu ? null : menu));
  }

  function toggleMobile(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(null);
    setMobileOpen((cur) => !cur);
  }

  return (
    <>
      {!onDark && (
        <div className={styles.topbar}>
          <span className={styles["tb-name"]}>Mallín</span>
          <span className={styles["tb-sep"]} />
          <span className={styles["tb-say"]}>
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            </svg>{" "}
            mah-YEEN
          </span>
        </div>
      )}

      <nav className={`${styles.nav}${onDark ? ` ${styles.navDark}` : ""}`}>
        <a className={styles.mark} href="/">
          <svg viewBox="0 0 64 64" width="22" height="22" fill="none">
            <path
              d="M 6 26 Q 18 21, 32 26 T 58 26"
              stroke={onDark ? "#fff" : "#1a2230"}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M 3 42 Q 17 36, 32 42 T 61 42"
              stroke={onDark ? "#9fd0e6" : "#4a7186"}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          Mallín
        </a>
        <div className={styles.navr}>
          <div className={`${styles.navitem}${open === "product" ? ` ${styles.open}` : ""}`}>
            <button
              type="button"
              className={styles.navtrigger}
              aria-haspopup="true"
              aria-expanded={open === "product"}
              onClick={(e) => toggle("product", e)}
            >
              Product
              <svg
                className={styles.caret}
                viewBox="0 0 12 12"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" />
              </svg>
            </button>
            <div className={styles.dropdown}>
              <div className={styles.ddgrid}>
                <a className={styles.ddrow} href="/how-it-works">
                  <div className={styles.ddt}>How it works</div>
                  <div className={styles.dds}>See Mallín work a real deal, end to end</div>
                </a>
                <a className={styles.ddrow} href="/trust">
                  <div className={styles.ddt}>Security &amp; trust</div>
                  <div className={styles.dds}>How your data is governed and kept yours</div>
                </a>
              </div>
              <a className={styles.ddfeature} href="/start">
                <svg className={styles.wave} viewBox="0 0 64 64" width="24" height="24" fill="none">
                  <path d="M 6 26 Q 18 21, 32 26 T 58 26" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 3 42 Q 17 36, 32 42 T 61 42" stroke="#7fb0c8" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div className={styles.ddft}>See it on a real deal</div>
                <div className={styles.ddfs}>Run Mallín on a call you just had. Free.</div>
              </a>
            </div>
          </div>

          <a className={styles.navlink} href="/#pricing">
            Pricing
          </a>
          <a className={styles.navlink} href="/blog">
            Blog
          </a>

          <div className={`${styles.navitem}${open === "company" ? ` ${styles.open}` : ""}`}>
            <button
              type="button"
              className={styles.navtrigger}
              aria-haspopup="true"
              aria-expanded={open === "company"}
              onClick={(e) => toggle("company", e)}
            >
              Company
              <svg
                className={styles.caret}
                viewBox="0 0 12 12"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 4.5 6 8l3.5-3.5" />
              </svg>
            </button>
            <div className={`${styles.dropdown} ${styles["dd-right"]}`}>
              <div className={styles.ddgrid}>
                <a className={styles.ddrow} href="/about">
                  <div className={styles.ddt}>About Mallín</div>
                  <div className={styles.dds}>The name, the meadow, the why</div>
                </a>
                <a className={styles.ddrow} href="/team">
                  <div className={styles.ddt}>Team</div>
                  <div className={styles.dds}>The people building Mallín</div>
                </a>
                <a className={styles.ddrow} href="/contact">
                  <div className={styles.ddt}>Contact</div>
                  <div className={styles.dds}>Talk to us</div>
                </a>
              </div>
            </div>
          </div>

          <a className={styles.navlink} href="/sign-in">
            Sign in
          </a>
          <a className={styles.navcta} href="/start">
            Start free →
          </a>
        </div>

        <button
          type="button"
          className={styles.hamburger}
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={toggleMobile}
        >
          {mobileOpen ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </button>
      </nav>

      {mobileOpen && (
        <div className={styles.mobilemenu} onClick={(e) => e.stopPropagation()}>
          <a className={styles.mobilelink} href="/how-it-works" onClick={() => setMobileOpen(false)}>
            How it works
          </a>
          <a className={styles.mobilelink} href="/#pricing" onClick={() => setMobileOpen(false)}>
            Pricing
          </a>
          <a className={styles.mobilelink} href="/blog" onClick={() => setMobileOpen(false)}>
            Blog
          </a>
          <a className={styles.mobilelink} href="/trust" onClick={() => setMobileOpen(false)}>
            Security &amp; trust
          </a>
          <a className={styles.mobilelink} href="/about" onClick={() => setMobileOpen(false)}>
            About Mallín
          </a>
          <a className={styles.mobilelink} href="/team" onClick={() => setMobileOpen(false)}>
            Team
          </a>
          <a className={styles.mobilelink} href="/contact" onClick={() => setMobileOpen(false)}>
            Contact
          </a>
          <a className={styles.mobilelink} href="/sign-in" onClick={() => setMobileOpen(false)}>
            Sign in
          </a>
          <a className={styles.mobilecta} href="/start" onClick={() => setMobileOpen(false)}>
            Start free →
          </a>
          <a
            className={styles.mobilesocial}
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
            </svg>
            Follow on LinkedIn
          </a>
        </div>
      )}
    </>
  );
}
