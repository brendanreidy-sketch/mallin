/**
 * AccountIntelligence — renders the Pass 0 / Account Intelligence
 * artifact in the cockpit. Stable cognition contract; same component
 * regardless of whether the data was populated manually or by a future
 * Crunchbase / Apollo / Contify integration.
 *
 * Renders ABOVE the Primary Decision Focus when a Pass 0 artifact
 * exists. When a Pass 4 (substrate-derived) artifact also exists,
 * both render — Account Intelligence is the cold pre-call brief,
 * Primary Decision Focus is the warm deal-state read after calls
 * have been processed.
 *
 * Visual rules (per product north star):
 *   - Monochrome with one accent (subtle)
 *   - Evidence + source traceability as visual primitives
 *   - Operator voice, not analyst register
 *   - Confidence shown where it matters (low confidence flagged)
 *
 * Progressive disclosure (May 20 2026):
 *   - Header + one-line + Primary Decision Focus stay always visible
 *   - The 5 supporting sections (Recent events, Strategic priorities,
 *     Stakeholders, Competitive context, Walking in) collapse behind
 *     chips by default. Click a chip to expand a section inline.
 *   - Activates the queued pull signal from `pull_signal_log.md` #5:
 *     "recommendation compression — progressive disclosure not less
 *      intelligence." Same intelligence, less visual weight on entry.
 */

import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import s from "./accountIntelligence.module.css";
import { RepNotesPanel } from "./notes/RepNotesPanel";
import CollapsibleSections, {
  type CollapsibleSection,
} from "./CollapsibleSections";
import StakeholderList from "./StakeholderList";

/** "Fresh" = surfaced within the last 24h by the daily refresh job.
 *  Events flagged fresh get a quiet NEW badge so the rep can scan
 *  for what changed since their last look. */
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
function isFresh(capturedAt: string | undefined): boolean {
  if (!capturedAt) return false;
  const t = new Date(capturedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < FRESH_WINDOW_MS;
}

/** Compact relative-time formatter for the header. Operator voice:
 *  "updated 2h ago" beats "captured 2026-05-13T14:00:00Z". */
function formatRefreshedAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "recently";
  const seconds = Math.max(0, (Date.now() - t) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  artifact: AccountIntelligenceArtifact;
  /** Mallín opportunity id — required for rep-notes write-through. When
   *  absent (legacy file-based loads), the notes panel hides itself. */
  opportunityId?: string;
  /** Mallín account id — passed through to the notes panel for future
   *  account-attached notes (v2). Optional. */
  accountId?: string;
  /** Provider label (e.g. "HubSpot") resolved from tenant.crm_provider.
   *  Rendered in the sync chip as "Synced to <label>". When null, the
   *  chip falls back to the generic "Synced to CRM" string. */
  providerLabel?: string | null;
}

export default function AccountIntelligence({
  artifact,
  opportunityId,
  accountId,
  providerLabel,
}: Props) {
  const a = artifact;

  // ── Build the collapsible section content as JSX ────────────────────
  // These render only when the rep expands the chip. The content is
  // server-rendered and passed to the client component as ReactNode.
  const sections: CollapsibleSection[] = [];

  if (a.recent_events.length > 0) {
    sections.push({
      id: "recent-events",
      label: "Recent events",
      content: (
        <ul className={s.eventsList}>
          {a.recent_events.map((e, i) => (
            <li key={i} className={s.event}>
              <div className={s.eventHead}>
                <span className={s.eventDate}>
                  {new Date(e.date).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {isFresh(e.captured_at) && (
                  <span className={s.newBadge} title={`Surfaced ${e.captured_at}`}>
                    New
                  </span>
                )}
                <span className={s.eventHeadline}>{e.headline}</span>
              </div>
              <p className={s.eventRelevance}>{e.relevance}</p>
            </li>
          ))}
        </ul>
      ),
    });
  }

  if (a.account.strategic_priorities.length > 0) {
    sections.push({
      id: "strategic-priorities",
      label: "Strategic priorities",
      content: (
        <ul className={s.priorityList}>
          {a.account.strategic_priorities.map((p, i) => (
            <li key={i} className={s.priority}>
              {p.value}
            </li>
          ))}
        </ul>
      ),
    });
  }

  if (a.stakeholders.length > 0) {
    sections.push({
      id: "stakeholders",
      label: "In the room",
      content: (
        <StakeholderList
          stakeholders={a.stakeholders}
          dealId={opportunityId ?? ""}
        />
      ),
    });
  }

  // Competitive context — newly surfaced in the cockpit. Direct
  // competitors are who the buyer is up against in their market;
  // internal competitors are who Mallín's user is up against on
  // THIS deal.
  const cc = a.competitive_context;
  const hasCc =
    (cc?.direct_competitors?.length ?? 0) > 0 ||
    cc?.market_position?.value ||
    (cc?.internal_competitors?.length ?? 0) > 0;
  if (hasCc) {
    sections.push({
      id: "competitive-context",
      label: "Competitive context",
      content: (
        <>
          {cc.direct_competitors.length > 0 && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>Direct competitors</span>
              <ul className={s.landmineList}>
                {cc.direct_competitors.map((c, i) => (
                  <li key={i}>{c.value}</li>
                ))}
              </ul>
            </div>
          )}
          {cc.market_position?.value && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>Market position</span>
              <p className={s.briefRowText}>{cc.market_position.value}</p>
            </div>
          )}
          {cc.internal_competitors && cc.internal_competitors.length > 0 && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>Competing for this deal</span>
              <ul className={s.landmineList}>
                {cc.internal_competitors.map((c, i) => (
                  <li key={i}>{c.value}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ),
    });
  }

  if (a.pre_call_brief) {
    sections.push({
      id: "walking-in",
      label: "Walking in",
      content: (
        <>
          <div className={s.briefRow}>
            <span className={s.briefRowLabel}>How to open</span>
            <p className={s.briefRowText}>{a.pre_call_brief.opening_angle}</p>
          </div>

          {a.pre_call_brief.questions_to_qualify.length > 0 && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>Questions to qualify</span>
              <ol className={s.questionList}>
                {a.pre_call_brief.questions_to_qualify.map((q, i) => (
                  <li key={i} className={s.questionItem}>
                    <p className={s.questionText}>{q.question}</p>
                    <p className={s.questionRationale}>
                      <span className={s.smallLabel}>why</span> {q.rationale}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {a.pre_call_brief.landmines.length > 0 && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>Landmines</span>
              <ul className={s.landmineList}>
                {a.pre_call_brief.landmines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ),
    });
  }

  return (
    <section className={s.intel} aria-label="Account intelligence">
      <header className={s.head}>
        <span className={s.eyebrow}>Pre-call brief · Account intelligence</span>
        <span className={s.generatedAt} title={a.metadata.generated_at}>
          updated {formatRefreshedAgo(a.metadata.generated_at)}
        </span>
      </header>

      {/* Account one-line — the operator-grade summary */}
      <div className={s.oneLine}>
        <span className={s.accountName}>{a.account.name}</span>
        <span className={s.oneLineText}>{a.account.one_line.value}</span>
      </div>

      {/* Primary Decision Focus — always visible. Per product_north_star:
          ONE primary thing. Cannot be collapsed; lives outside the
          collapsible set. */}
      {a.pre_call_brief?.primary_objective && (
        <div className={s.primaryFocus}>
          <div className={s.primaryFocusLabel}>
            <span className={s.primaryFocusDot} aria-hidden="true" />
            The decision that matters most
          </div>
          <p className={s.primaryFocusText}>
            {a.pre_call_brief.primary_objective}
          </p>
        </div>
      )}

      {/* Everything else is collapsed-by-default behind chips. The rep
          expands what they need; the cockpit doesn't dump every section
          on entry. */}
      <CollapsibleSections sections={sections} />

      {/* Confidence + gaps footer — kept always visible because low
          confidence is a trust calibration signal, not content. */}
      {(a.metadata.confidence_overall === "low" ||
        (a.metadata.gaps && a.metadata.gaps.length > 0)) && (
        <details className={s.gaps}>
          <summary className={s.gapsSummary}>
            What we&apos;re missing · confidence: {a.metadata.confidence_overall}
          </summary>
          <ul className={s.gapsList}>
            {a.metadata.gaps?.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          {a.metadata.notes && <p className={s.gapsNote}>{a.metadata.notes}</p>}
        </details>
      )}

      {/* Rep contribution layer — write-through to the customer CRM via
          lib/crm.createNote(). The brief above is what the agent
          generated; the panel below is where the rep adds judgment that
          travels back into the CRM AND into Mallín's pattern memory for
          future similar deals. See memory:write_through_operating_layer.md. */}
      {opportunityId && (
        <RepNotesPanel
          opportunityId={opportunityId}
          accountId={accountId ?? null}
          providerLabel={providerLabel ?? null}
        />
      )}
    </section>
  );
}
