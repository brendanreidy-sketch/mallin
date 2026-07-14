"use client";

/**
 * Cross-deal search modal — the "jump to another deal" surface.
 *
 * Triggered by clicking the search button in the TopBar or by pressing
 * ⌘K / Ctrl-K anywhere on the page. Opens a centered modal with a
 * single input and a results list. Keyboard-first:
 *   ⌘K           open
 *   Esc          close
 *   ↑ / ↓        navigate results
 *   Enter        navigate to the highlighted deal
 *   click        same as Enter
 *
 * Empty query shows recent deals (server-defined recency). Typed query
 * matches deal name, account name, or stakeholder name — server returns
 * `matchedOn` so we can label *why* a result hit.
 *
 * Why client-side: the search itself is server-rendered (cheap + safe),
 * but the modal/keyboard plumbing is interactive, so the shell ships
 * as a client component.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./searchbar.module.css";

interface SearchResult {
  dealId: string;
  dealName: string;
  accountName: string | null;
  stageLabel: string | null;
  posture: string | null;
  lastActivityAt: string | null;
  matchedOn: "name" | "account" | "stakeholder";
  matchedStakeholder?: string;
}

const POSTURE_LABEL: Record<string, string> = {
  advancing: "Advancing",
  at_risk: "At risk",
  stalled: "Stalled",
  indeterminate: "Unclear",
};

export default function SearchBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ⌘K / Ctrl-K opens; Esc closes (handled inside the modal too).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When opening, fetch the empty-state (recent deals) and focus input.
  useEffect(() => {
    if (open) {
      void runSearch("");
      // Slight delay so the input is mounted before we focus it.
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQ("");
      setResults([]);
      setHighlighted(0);
    }
  }, [open]);

  const runSearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const url = `/api/search?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) {
        setResults([]);
        return;
      }
      const data = (await resp.json()) as { results?: SearchResult[] };
      setResults(data.results ?? []);
      setHighlighted(0);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on input change.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, 140);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, runSearch]);

  function navigate(dealId: string) {
    window.location.href = `/prep?dealId=${dealId}`;
  }

  function openLinkedIn() {
    if (!q.trim()) return;
    const url = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q.trim())}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
      return;
    }
    // ⌘/Ctrl + Enter — escape hatch to LinkedIn even when a deal result
    // is highlighted. Plain Enter still navigates to the deal.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      openLinkedIn();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = results[highlighted];
      if (target) navigate(target.dealId);
      else if (q.trim()) openLinkedIn();
    }
  }

  return (
    <>
      <button
        type="button"
        className={s.trigger}
        onClick={() => setOpen(true)}
        title="Search deals (⌘K)"
        aria-label="Search deals"
      >
        <span className={s.triggerIcon} aria-hidden>
          ⌕
        </span>
        <span className={s.triggerLabel}>Jump to deal</span>
        <span className={s.triggerHint}>⌘K</span>
      </button>

      {open && (
        <div
          className={s.scrim}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className={s.modal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Search deals"
            onKeyDown={onKeyDown}
          >
            <div className={s.inputWrap}>
              <span className={s.inputIcon} aria-hidden>
                ⌕
              </span>
              <input
                ref={inputRef}
                className={s.input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by deal, account, or person…"
                spellCheck={false}
                autoComplete="off"
              />
              {loading && <span className={s.loading}>…</span>}
              <kbd className={s.escHint}>esc</kbd>
            </div>

            <div className={s.results}>
              {results.length === 0 && !loading && (
                <div className={s.empty}>
                  {q
                    ? "No deals match that query."
                    : "No deals available on this build."}
                </div>
              )}
              {q.trim() && (
                <button
                  type="button"
                  className={s.linkedInRow}
                  onClick={openLinkedIn}
                  title="⌘+Enter"
                >
                  <span className={s.linkedInIcon} aria-hidden>
                    in
                  </span>
                  <span className={s.linkedInLabel}>
                    Search LinkedIn for &ldquo;{q.trim()}&rdquo;
                  </span>
                  <span className={s.linkedInHint}>⌘↵</span>
                </button>
              )}
              {results.map((r, i) => (
                <button
                  key={r.dealId}
                  type="button"
                  className={`${s.result} ${
                    i === highlighted ? s.resultHighlighted : ""
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => navigate(r.dealId)}
                >
                  <div className={s.resultMain}>
                    <span className={s.resultDealName}>{r.dealName}</span>
                    {r.accountName && r.accountName !== r.dealName && (
                      <span className={s.resultAccount}>{r.accountName}</span>
                    )}
                  </div>
                  <div className={s.resultMeta}>
                    {r.posture && (
                      <span
                        className={`${s.posturePill} ${
                          s["posture_" + r.posture] ?? ""
                        }`}
                      >
                        {POSTURE_LABEL[r.posture] ?? r.posture}
                      </span>
                    )}
                    {r.stageLabel && (
                      <span className={s.resultStage}>
                        {r.stageLabel.replace(/\s*\([^)]*\)\s*$/, "")}
                      </span>
                    )}
                    {r.matchedOn === "stakeholder" && r.matchedStakeholder && (
                      <span className={s.matchTag}>
                        ↳ via {r.matchedStakeholder}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
