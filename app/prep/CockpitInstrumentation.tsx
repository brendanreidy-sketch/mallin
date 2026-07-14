"use client";

/**
 * CockpitInstrumentation — quiet behavioral recorder for demo sessions.
 *
 * Captures exactly four interactions, ONLY for demo-tenant sessions
 * (server gates on is_demo before writing). Reviewed manually via SQL
 * after design-partner sessions; never exposed as a dashboard.
 *
 *   1. first_scroll      — fired once on first scroll event
 *   2. pdf_visible       — Primary Decision Focus block enters viewport
 *   3. pdf_hidden        — Primary Decision Focus block leaves viewport
 *   4. pattern_toggle    — "Pattern observed across the corpus" details open/close
 *   5. attribution_hover — cursor lingers > 1s on evidence attribution row
 *
 * Why these four: operational trust forms in evidence + timing +
 * attribution + specificity, NOT in the recommendation itself. These
 * interactions probe whether trust forms in the expected places.
 *
 * Implementation notes:
 *   - Events batched and POSTed every 8 seconds OR on visibility change /
 *     page unload (sendBeacon fallback when available)
 *   - All events tagged with ms_since_load for ordering and timing
 *   - Session ID generated per page-load (groups events from one visit)
 *   - Silently no-ops if the page lacks the expected DOM targets
 *   - Server-side is_demo check is the actual gate — this client runs
 *     for all users but only demo tenants get rows written
 */

import { useEffect } from "react";

interface InstrumentEvent {
  event_type: string;
  event_data?: Record<string, unknown>;
  ms_since_load: number;
  session_id: string;
}

export default function CockpitInstrumentation() {
  useEffect(() => {
    const pageLoadAt = performance.now();
    const sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 16)
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const queue: InstrumentEvent[] = [];
    const ms = () => Math.round(performance.now() - pageLoadAt);
    const push = (type: string, data: Record<string, unknown> = {}) => {
      queue.push({
        event_type: type,
        event_data: data,
        ms_since_load: ms(),
        session_id: sessionId,
      });
    };

    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let firstScrollFired = false;
    let lastHoverEl: Element | null = null;
    let hoverStartAt = 0;
    let pdfObserver: IntersectionObserver | null = null;
    let pdfWasVisible = false;
    let pdfFirstVisibleAt: number | null = null;

    async function flush() {
      if (queue.length === 0) return;
      const batch = queue.splice(0, queue.length);
      const payload = JSON.stringify({ events: batch });
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/instrument",
            new Blob([payload], { type: "application/json" }),
          );
        } else {
          await fetch("/api/instrument", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          });
        }
      } catch {
        /* never gate on instrumentation failures */
      }
    }

    // 1. first_scroll
    const onScroll = () => {
      if (firstScrollFired) return;
      firstScrollFired = true;
      push("first_scroll");
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 2/3. pdf_visible / pdf_hidden
    // Look for the Primary Decision Focus block (data-instrument="pdf").
    // IntersectionObserver fires when the section crosses the viewport
    // threshold. Tracks total time visible across the session.
    const pdf = document.querySelector('[data-instrument="pdf"]');
    if (pdf && "IntersectionObserver" in window) {
      pdfObserver = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const visibleNow = e.isIntersecting && e.intersectionRatio > 0.3;
            if (visibleNow && !pdfWasVisible) {
              pdfWasVisible = true;
              pdfFirstVisibleAt = ms();
              push("pdf_visible", {
                first_visible: pdfFirstVisibleAt,
                intersection_ratio: Number(e.intersectionRatio.toFixed(2)),
              });
            } else if (!visibleNow && pdfWasVisible) {
              pdfWasVisible = false;
              const dwellMs =
                pdfFirstVisibleAt != null ? ms() - pdfFirstVisibleAt : 0;
              push("pdf_hidden", {
                dwell_ms: dwellMs,
                intersection_ratio: Number(e.intersectionRatio.toFixed(2)),
              });
            }
          }
        },
        { threshold: [0, 0.3, 0.7, 1.0] },
      );
      pdfObserver.observe(pdf);
    }

    // 4. pattern_toggle — listen on the <details> element inside PDF
    const pattern = document.querySelector(
      '[data-instrument="pattern-details"]',
    ) as HTMLDetailsElement | null;
    const onPatternToggle = () => {
      if (!pattern) return;
      push("pattern_toggle", { open: pattern.open });
    };
    if (pattern) {
      pattern.addEventListener("toggle", onPatternToggle);
    }

    // 5. attribution_hover — dwell > 1000ms on .quoteAttr rows
    const onMouseEnter = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !(target as Element).closest) return;
      const row = (target as Element).closest('[data-instrument="attr"]');
      if (!row) return;
      lastHoverEl = row;
      hoverStartAt = ms();
    };
    const onMouseLeave = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !(target as Element).closest) return;
      const row = (target as Element).closest('[data-instrument="attr"]');
      if (!row || row !== lastHoverEl) return;
      const dwell = ms() - hoverStartAt;
      lastHoverEl = null;
      if (dwell >= 1000) {
        push("attribution_hover", {
          dwell_ms: dwell,
          attr_label:
            row.getAttribute("data-attr-label")?.slice(0, 120) ?? null,
        });
      }
    };
    document.addEventListener("mouseover", onMouseEnter, true);
    document.addEventListener("mouseout", onMouseLeave, true);

    // Periodic flush every 8 seconds
    flushTimer = setInterval(flush, 8_000);

    // Flush on visibility change (tab hidden) and on unload
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);

    return () => {
      if (flushTimer) clearInterval(flushTimer);
      window.removeEventListener("scroll", onScroll);
      if (pdfObserver) pdfObserver.disconnect();
      if (pattern) pattern.removeEventListener("toggle", onPatternToggle);
      document.removeEventListener("mouseover", onMouseEnter, true);
      document.removeEventListener("mouseout", onMouseLeave, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      void flush();
    };
  }, []);

  return null;
}
