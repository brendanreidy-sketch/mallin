/**
 * PrimaryDecisionFocus — the center-of-gravity block.
 *
 * Replaces the previous "WHAT DECIDES THIS DEAL" hero (and the brief
 * disclosure that succeeded it) with a single focused recommendation:
 *
 *     PRIMARY RISK · {severity}
 *     {one sentence}
 *
 *     NEXT MOVE
 *     {one sentence — prescriptive, not advisory}
 *
 *     WHY MALLIN BELIEVES THIS
 *     {2-3 quoted moments, with temporal framing}
 *     {one stakeholder stat line}
 *
 *     [ Approve · Modify · Reject ]
 *
 * Reads from artifact.primary_decision_focus when present. If absent
 * (legacy artifacts without the field), returns null — the calling
 * page renders the older disclosure fallback in that case.
 *
 * Temporal framing computes "X ago" against the artifact's
 * generated_at timestamp, NOT real-time wall clock. This keeps the
 * demo data feeling live and consistent regardless of when a visitor
 * loads it (e.g. "yesterday" instead of "3 months ago" on a fixture
 * that was generated in April).
 *
 * Visual rules (per product north star):
 *   - Compact: fits above the fold on desktop
 *   - Monochrome ink with one severity accent
 *   - Evidence is the load-bearing piece — quotes feel live
 *   - Approve/Modify/Reject feel like PR-review controls, not SaaS buttons
 */

import s from "./primaryDecisionFocus.module.css";
import PrimaryDecisionActions from "./PrimaryDecisionActions";

interface EvidenceQuote {
  speaker: string;
  role?: string;
  quote: string;
  callId?: string;
  callLabel?: string;
  callAt?: string;
}

interface StakeholderStat {
  name: string;
  title?: string;
  stats: string;
  last_seen_at?: string;
}

export interface PrimaryDecisionFocusData {
  severity?: "high" | "medium" | "low" | string;
  primary_risk?: string;
  next_move?: string;
  confidence?: "high" | "medium" | "low" | string;
  evidence_quotes?: EvidenceQuote[];
  stakeholder_stat?: StakeholderStat;
  pattern_note?: string;
}

interface Props {
  focus: PrimaryDecisionFocusData | null | undefined;
  /** Used as "now" reference for temporal framing. Keeps fixture data
   *  feeling live ("yesterday", "just now") rather than archival. */
  generatedAt?: string;
}

/** Compute "X ago" against a reference time. Operator-grade brevity. */
function temporalLabel(then: string | undefined, now: string | undefined): string {
  if (!then) return "";
  const t = new Date(then).getTime();
  const n = now ? new Date(now).getTime() : Date.now();
  if (!Number.isFinite(t) || !Number.isFinite(n)) return "";
  const diffMs = n - t;
  if (diffMs < 0) return "scheduled";
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 12) return "just now";
  if (hours < 36) return "yesterday";
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)} days ago`;
  const weeks = days / 7;
  if (weeks < 8) return `${Math.round(weeks)} weeks ago`;
  const months = days / 30;
  return `${Math.round(months)} months ago`;
}

export default function PrimaryDecisionFocus({ focus, generatedAt }: Props) {
  if (!focus || !focus.primary_risk || !focus.next_move) {
    return null;
  }

  const severity = (focus.severity ?? "high").toLowerCase();
  const severityClass =
    severity === "high"
      ? s.severityHigh
      : severity === "medium"
        ? s.severityMed
        : s.severityLow;
  const severityLabel = severity.toUpperCase();

  return (
    <section
      className={s.focus}
      aria-label="Primary decision"
      data-instrument="pdf"
    >
      {/* Header row — severity + freshness pulse */}
      <header className={s.head}>
        <span className={`${s.severity} ${severityClass}`}>
          <span className={s.severityDot} aria-hidden="true" />
          Primary risk · {severityLabel}
        </span>
        {focus.confidence ? (
          <span className={s.confidence}>
            {focus.confidence === "high"
              ? "high confidence"
              : focus.confidence === "medium"
                ? "moderate confidence"
                : "low confidence"}
          </span>
        ) : null}
      </header>

      {/* Primary risk — single dominant sentence */}
      <h2 className={s.primary}>{focus.primary_risk}</h2>

      {/* Next move — prescriptive, not advisory */}
      <div className={s.move}>
        <span className={s.moveLabel}>Next move</span>
        <p className={s.moveText}>{focus.next_move}</p>
      </div>

      {/* Evidence — the trust-building section */}
      <div className={s.evidence}>
        <div className={s.evidenceLabel}>Why Mallín believes this</div>
        <ul className={s.evidenceList}>
          {(focus.evidence_quotes ?? []).slice(0, 3).map((e, i) => {
            const when = temporalLabel(e.callAt, generatedAt);
            return (
              <li key={i} className={s.evidenceItem}>
                <blockquote className={s.quote}>
                  &ldquo;{e.quote}&rdquo;
                </blockquote>
                <div
                  className={s.quoteAttr}
                  data-instrument="attr"
                  data-attr-label={`${e.speaker} · ${e.callLabel ?? ""}`}
                >
                  <span className={s.quoteSpeaker}>{e.speaker}</span>
                  {e.role ? <span className={s.quoteRole}>{e.role}</span> : null}
                  {e.callLabel ? (
                    <span className={s.quoteCall}>{e.callLabel}</span>
                  ) : null}
                  {when ? (
                    <span
                      className={`${s.quoteWhen} ${when === "just now" ? s.quoteWhenFresh : ""}`}
                    >
                      {when}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {focus.stakeholder_stat && (
          <div className={s.stakeholderStat}>
            <span className={s.stakeholderName}>
              {focus.stakeholder_stat.name}
              {focus.stakeholder_stat.title ? (
                <span className={s.stakeholderTitle}>
                  {" · "}
                  {focus.stakeholder_stat.title}
                </span>
              ) : null}
            </span>
            <span className={s.stakeholderStats}>
              {focus.stakeholder_stat.stats}
            </span>
          </div>
        )}

        {focus.pattern_note && (
          <details
            className={s.patternDetails}
            data-instrument="pattern-details"
          >
            <summary className={s.patternSummary}>
              Pattern observed across the corpus →
            </summary>
            <p className={s.patternNote}>{focus.pattern_note}</p>
          </details>
        )}
      </div>

      {/* Review controls — PR-review pattern, not SaaS buttons */}
      <PrimaryDecisionActions />
    </section>
  );
}
