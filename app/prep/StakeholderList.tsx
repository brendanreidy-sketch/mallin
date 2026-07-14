"use client";

/**
 * StakeholderList — the "In the room" people, each clickable.
 *
 * Click a name and instead of being thrown out to LinkedIn you get an in-app
 * profile drawer that pulls in everything the deal holds on that person:
 * role read, background, what they care about, rapport hooks, what to watch
 * for — plus a web-researched "who is this" block. The research is fetched
 * the first time the card is opened (around the call) and then HELD in the
 * deal; opening it again is instant and free. Refresh is on-demand only.
 */

import { useEffect, useRef, useState } from "react";
import type {
  StakeholderIntel,
  StakeholderWebResearch,
} from "@/lib/intelligence/types";
import s from "./accountIntelligence.module.css";
import { ROLE_DISPLAY } from "./role-display";

function roleBadgeClass(confidence: string): string {
  if (confidence === "low") return `${s.roleBadge} ${s.roleBadgeLow}`;
  if (confidence === "medium") return `${s.roleBadge} ${s.roleBadgeMed}`;
  return s.roleBadge;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "just now";
}

export default function StakeholderList({
  stakeholders,
  dealId,
}: {
  stakeholders: StakeholderIntel[];
  dealId: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Web-research overlay onto the held data, keyed by stakeholder index, so a
  // freshly-fetched profile shows without a full page reload.
  const [research, setResearch] = useState<
    Record<number, StakeholderWebResearch>
  >({});
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Research needs a real deal to write the held profile back to.
  const canResearch = Boolean(dealId);
  const sh = openIndex === null ? null : stakeholders[openIndex];
  const web =
    openIndex === null ? undefined : research[openIndex] ?? sh?.web_research;

  async function runResearch(index: number, name: string) {
    setLoading(index);
    setError(null);
    try {
      const res = await fetch("/api/intel/stakeholder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, name }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        web_research?: StakeholderWebResearch;
        error?: string;
      };
      if (!res.ok || !data.web_research) {
        setError("Couldn't research right now — try again in a moment.");
        return;
      }
      setResearch((prev) => ({ ...prev, [index]: data.web_research! }));
    } catch {
      setError("Couldn't research right now — try again in a moment.");
    } finally {
      setLoading(null);
    }
  }

  // Auto-research on first open: the moment a card opens for someone with no
  // held research, kick it off once (still held + cost-guarded). The button
  // below becomes a retry/refresh affordance, not the primary path.
  const autoFired = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (openIndex === null) return;
    const person = stakeholders[openIndex];
    const held = research[openIndex] ?? person?.web_research;
    if (held || !canResearch || autoFired.current.has(openIndex)) return;
    autoFired.current.add(openIndex);
    void runResearch(openIndex, person.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex]);

  function close() {
    setOpenIndex(null);
    setError(null);
  }

  return (
    <>
      {stakeholders.map((person, i) => (
        <div key={i} className={s.stakeholder}>
          <div className={s.stakeholderHead}>
            <button
              type="button"
              className={`${s.stakeholderName} ${s.stakeholderNameBtn}`}
              onClick={() => setOpenIndex(i)}
              title="Open profile"
            >
              {person.name}
              <span className={s.linkIconInline} aria-hidden="true">
                →
              </span>
            </button>
            {person.title?.value && (
              <span className={s.stakeholderTitle}>{person.title.value}</span>
            )}
            <span className={roleBadgeClass(person.role_in_deal.confidence)}>
              {ROLE_DISPLAY[person.role_in_deal.value] ??
                person.role_in_deal.value.replace(/_/g, " ")}{" "}
              · {person.role_in_deal.confidence} confidence
            </span>
          </div>
          <p className={s.stakeholderBg}>{person.background.value}</p>
          {person.role_in_deal.rationale && (
            <p className={s.stakeholderRationale}>
              <span className={s.smallLabel}>Why this read</span>{" "}
              {person.role_in_deal.rationale}
            </p>
          )}
          {person.watch_for.length > 0 && (
            <div className={s.watchFor}>
              <span className={s.smallLabel}>Watch for</span>
              <ul className={s.watchList}>
                {person.watch_for.map((w, j) => (
                  <li key={j}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}

      {sh && (
        <div className={s.shOverlay} onClick={close} role="presentation">
          <aside
            className={s.shDrawer}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`${sh.name} profile`}
          >
            <button
              type="button"
              className={s.shClose}
              onClick={close}
              aria-label="Close"
            >
              ✕
            </button>

            <div className={s.shCardHead}>
              <h3 className={s.shCardName}>{sh.name}</h3>
              {sh.title?.value && (
                <span className={s.shCardTitle}>{sh.title.value}</span>
              )}
              <span className={roleBadgeClass(sh.role_in_deal.confidence)}>
                {ROLE_DISPLAY[sh.role_in_deal.value] ??
                  sh.role_in_deal.value.replace(/_/g, " ")}{" "}
                · {sh.role_in_deal.confidence} confidence
              </span>
            </div>

            {/* Web-researched "who is this" — held in the deal once fetched. */}
            <div className={s.shSection}>
              <div className={s.shSectionTop}>
                <span className={s.smallLabel}>From the web</span>
                {web && (
                  <span className={s.shResearchMeta}>
                    Researched {timeAgo(web.researched_at)}
                    {canResearch && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className={s.shTextBtn}
                          onClick={() => runResearch(openIndex!, sh.name)}
                          disabled={loading === openIndex}
                        >
                          {loading === openIndex ? "Refreshing…" : "Refresh"}
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>

              {web ? (
                <>
                  <p className={s.shSummary}>{web.summary}</p>
                  {web.highlights.length > 0 && (
                    <ul className={s.shHighlights}>
                      {web.highlights.map((h, j) => (
                        <li key={j}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {web.sources.length > 0 && (
                    <div className={s.shSources}>
                      <span className={s.smallLabel}>Sources</span>
                      <div className={s.shSourceChips}>
                        {web.sources.map((src, j) =>
                          src.url ? (
                            <a
                              key={j}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={s.shSourceChip}
                            >
                              {src.label}
                            </a>
                          ) : (
                            <span key={j} className={s.shSourceChip}>
                              {src.label}
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className={s.shEmpty}>
                  {loading === openIndex ? (
                    <p className={s.shEmptyText}>
                      Researching {sh.name.split(" ")[0]} from the web…
                    </p>
                  ) : (
                    <>
                      <p className={s.shEmptyText}>
                        No web research held yet for {sh.name.split(" ")[0]}.
                      </p>
                      {canResearch && (
                        <button
                          type="button"
                          className={s.shResearchBtn}
                          onClick={() => runResearch(openIndex!, sh.name)}
                        >
                          Research from the web
                        </button>
                      )}
                    </>
                  )}
                  {error && <p className={s.shError}>{error}</p>}
                </div>
              )}
              {web && error && <p className={s.shError}>{error}</p>}
            </div>

            <div className={s.shSection}>
              <span className={s.smallLabel}>Background</span>
              <p className={s.shBody}>{sh.background.value}</p>
            </div>

            {sh.visible_priorities.length > 0 && (
              <div className={s.shSection}>
                <span className={s.smallLabel}>What they care about</span>
                <ul className={s.shList}>
                  {sh.visible_priorities.map((p, j) => (
                    <li key={j}>{p.value}</li>
                  ))}
                </ul>
              </div>
            )}

            {sh.rapport_hooks.length > 0 && (
              <div className={s.shSection}>
                <span className={s.smallLabel}>Rapport hooks</span>
                <ul className={s.shList}>
                  {sh.rapport_hooks.map((h, j) => (
                    <li key={j}>{h.value}</li>
                  ))}
                </ul>
              </div>
            )}

            {sh.watch_for.length > 0 && (
              <div className={s.shSection}>
                <span className={s.smallLabel}>Watch for on the call</span>
                <ul className={s.shList}>
                  {sh.watch_for.map((w, j) => (
                    <li key={j}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {sh.linkedin_url && (
              <div className={s.shFooter}>
                <a
                  href={sh.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={s.shFooterLink}
                >
                  Open LinkedIn ↗
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
