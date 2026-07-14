/**
 * SanitizedCockpit — public read-only render of an Account Intelligence
 * artifact for the /share/[token] route.
 *
 * Sanitization rules (vs. the rep-internal /prep view):
 *   - DROP `role_in_deal.rationale`     (rep-coaching narrative)
 *   - DROP `watch_for[]`                (behavioral surveillance cues)
 *   - DROP `landmines[]`                (don't-do-this tactical advice)
 *   - DROP `questions_to_qualify[].rationale` (exposes rep thinking)
 *   - DROP `competitive_context.internal_competitors` (silent-competitor frame)
 *   - DROP `pre_call_brief.primary_objective` headline ("decision that matters most")
 *   - DROP `metadata.confidence_overall` / `metadata.gaps` (rep-internal calibration)
 *   - KEEP one-line, account profile, recent events + relevance, stakeholders
 *     (name/title/background/LinkedIn/visible_priorities), strategic priorities,
 *     direct competitors, market position, opening_angle, questions list
 *     (without rationale)
 *
 * Audience: SPC / prospects / curious viewers. They see substrate quality
 * and operator voice; they do NOT see rep tactics or internal calibration.
 */

import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import s from "./share.module.css";

interface Props {
  artifact: AccountIntelligenceArtifact;
  accountName: string;
}

export default function SanitizedCockpit({ artifact: a, accountName }: Props) {
  return (
    <div className={s.shell}>
      {/* Header — Mallín branding, account name */}
      <header className={s.header}>
        <div className={s.brand}>
          <span className={s.brandMark}>~</span>
          <span className={s.brandWord}>Mallín</span>
        </div>
        <div className={s.headerMeta}>
          <span className={s.eyebrow}>Pre-call brief · Account intelligence</span>
          <span className={s.account}>{accountName}</span>
        </div>
      </header>

      {/* One-line account summary */}
      <section className={s.oneLine}>
        <p>{a.account.one_line.value}</p>
      </section>

      {/* Account facts strip */}
      <section className={s.factsStrip}>
        <div className={s.factCol}>
          <span className={s.factLabel}>Industry</span>
          <p className={s.factValue}>{a.account.industry.value}</p>
        </div>
        {a.account.geography?.[0] && (
          <div className={s.factCol}>
            <span className={s.factLabel}>Headquarters</span>
            <p className={s.factValue}>{a.account.geography[0].value}</p>
          </div>
        )}
        {a.account.revenue_estimate?.value && (
          <div className={s.factCol}>
            <span className={s.factLabel}>Revenue</span>
            <p className={s.factValue}>{a.account.revenue_estimate.value}</p>
          </div>
        )}
        {a.account.headcount_range?.value && (
          <div className={s.factCol}>
            <span className={s.factLabel}>Headcount</span>
            <p className={s.factValue}>{a.account.headcount_range.value}</p>
          </div>
        )}
      </section>

      {/* Recent events with operator-grade relevance */}
      {a.recent_events.length > 0 && (
        <section className={s.block}>
          <h2 className={s.blockLabel}>Recent events</h2>
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
                  <span className={s.eventHeadline}>{e.headline}</span>
                </div>
                <p className={s.eventRelevance}>{e.relevance}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Strategic priorities */}
      {a.account.strategic_priorities.length > 0 && (
        <section className={s.block}>
          <h2 className={s.blockLabel}>Strategic priorities</h2>
          <ul className={s.priorityList}>
            {a.account.strategic_priorities.map((p, i) => (
              <li key={i} className={s.priority}>
                {p.value}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stakeholders — public-safe fields only */}
      {a.stakeholders.length > 0 && (
        <section className={s.block}>
          <h2 className={s.blockLabel}>In the room</h2>
          {a.stakeholders.map((sh, i) => (
            <div key={i} className={s.stakeholder}>
              <div className={s.stakeholderHead}>
                {sh.linkedin_url ? (
                  <a
                    className={s.stakeholderName}
                    href={sh.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {sh.name} <span className={s.linkIcon} aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <span className={s.stakeholderName}>{sh.name}</span>
                )}
                {sh.title?.value && (
                  <span className={s.stakeholderTitle}>{sh.title.value}</span>
                )}
              </div>
              <p className={s.stakeholderBg}>{sh.background.value}</p>
              {sh.visible_priorities.length > 0 && (
                <ul className={s.priorityList}>
                  {sh.visible_priorities.slice(0, 3).map((vp, j) => (
                    <li key={j} className={s.priority}>
                      {vp.value}
                    </li>
                  ))}
                </ul>
              )}
              {/*
                Intentionally NOT rendered (rep-internal):
                - sh.role_in_deal.rationale
                - sh.watch_for[]
                - sh.role_in_deal.confidence
              */}
            </div>
          ))}
        </section>
      )}

      {/* Competitive context — only the buyer-side competitors, not the
          internal "silent competitor" frame */}
      {a.competitive_context?.direct_competitors?.length > 0 && (
        <section className={s.block}>
          <h2 className={s.blockLabel}>Competitive context</h2>
          {a.competitive_context.market_position?.value && (
            <p className={s.marketPosition}>
              {a.competitive_context.market_position.value}
            </p>
          )}
          <ul className={s.priorityList}>
            {a.competitive_context.direct_competitors.map((c, i) => (
              <li key={i} className={s.priority}>
                {c.value}
              </li>
            ))}
          </ul>
          {/* internal_competitors intentionally omitted — silent-competitor
              framing is rep-only intel */}
        </section>
      )}

      {/* Walking in — opening angle + questions (no rationale, no landmines) */}
      {a.pre_call_brief && (
        <section className={s.block}>
          <h2 className={s.blockLabel}>Walking in</h2>
          {a.pre_call_brief.opening_angle && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>How to open</span>
              <p className={s.briefRowText}>{a.pre_call_brief.opening_angle}</p>
            </div>
          )}
          {a.pre_call_brief.questions_to_qualify?.length > 0 && (
            <div className={s.briefRow}>
              <span className={s.briefRowLabel}>Questions to qualify</span>
              <ol className={s.questionList}>
                {a.pre_call_brief.questions_to_qualify.map((q, i) => (
                  <li key={i} className={s.questionItem}>
                    {q.question}
                    {/* q.rationale intentionally omitted */}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {/* landmines intentionally omitted */}
        </section>
      )}

      <footer className={s.footer}>
        <div>
          <strong>Mallín</strong> · Pre-call briefs that read like an
          operator wrote them
        </div>
        <a className={s.footerCta} href="https://mallin.io">
          mallin.io →
        </a>
      </footer>
    </div>
  );
}
