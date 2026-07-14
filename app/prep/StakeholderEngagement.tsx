"use client";

import { useEffect, useState } from "react";
import s from "./prep.module.css";
import {
  recordCockpitAction,
  fetchCockpitActions,
  type FlagReason,
} from "./cockpitActions";

/** Minimal shapes — mirror the page's local Substrate (page.tsx) + the
 *  artifact's stakeholder_strategy (execution-agent-output). */
type Stakeholder = {
  id: string;
  name: string;
  title?: string;
  email?: string;
  committee_role?: string;
};
type Call = { id: string; attendee_emails?: string[] };
type Strategy = {
  stakeholder_id: string;
  stakeholder_name: string;
  role?: string;
  relevance?: string;
  engagement_tier?: "engaged" | "needs_engaging" | "watch";
};

type Tier = "engaged" | "needs_engaging" | "watch";

type Row = {
  id: string;
  name: string;
  email?: string;
  roleLine: string;
  tier: Tier;
  callCount: number;
};

/** The four correction reasons, in the v5 order. */
const FLAG_REASONS: { key: FlagReason; label: string }[] = [
  { key: "wrong_person", label: "Wrong person" },
  { key: "wrong_role", label: "Wrong role" },
  { key: "no_longer_here", label: "No longer here" },
  { key: "not_involved", label: "Not involved" },
];

/**
 * Stakeholder engagement map (rail panel) — the approved v5 design.
 *
 * A flat list of customer-side stakeholders, each tagged with an
 * engagement tier:
 *   • engaged        — has been on ≥1 call (shows the call count)
 *   • needs engaging  — never on a call (amber row — the gap to close)
 *   • watch          — peripheral / not-yet-active; NOT a gap to chase
 *
 * Correction loop (feature D): the brief agentically best-guesses the
 * committee, so any row can be wrong. Each row carries a "not the right
 * person?" control → pick a reason → the row dims to "✓ Flagged — Mallín
 * will learn" and the correction persists (/api/cockpit-action). AI
 * proposes, the rep (ground truth) governs; the correction is both the
 * fix and the lesson. See stakeholder_correction_loop.md.
 */
export default function StakeholderEngagement({
  stakeholders,
  calls,
  strategies = [],
  dealId,
}: {
  stakeholders: Stakeholder[];
  calls: Call[];
  strategies?: Strategy[];
  /** Deal UUID for flag persistence. Null on static/fixture briefs —
   *  flags then apply optimistically without a server write. */
  dealId?: string | null;
}) {
  // Hydrate which stakeholders this rep already flagged (survives reload).
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    void fetchCockpitActions(dealId ?? null).then((actions) => {
      if (!alive) return;
      const flagged = new Set<string>();
      for (const a of actions) {
        if (a.action_type === "stakeholder_flagged" && a.target_ref) {
          flagged.add(a.target_ref);
        }
      }
      if (flagged.size) setFlaggedIds(flagged);
    });
    return () => {
      alive = false;
    };
  }, [dealId]);

  if (!stakeholders || stakeholders.length === 0) return null;

  // How many calls each email has appeared on.
  const callCountByEmail = new Map<string, number>();
  for (const call of calls ?? []) {
    for (const email of call.attendee_emails ?? []) {
      const key = email.trim().toLowerCase();
      if (key) callCountByEmail.set(key, (callCountByEmail.get(key) ?? 0) + 1);
    }
  }

  const strategyFor = (st: Stakeholder): Strategy | undefined => {
    const byId = strategies.find((x) => x.stakeholder_id === st.id);
    if (byId) return byId;
    const n = norm(st.name);
    return strategies.find((x) => norm(x.stakeholder_name) === n);
  };

  const rows: Row[] = stakeholders.map((st) => {
    const strat = strategyFor(st);
    const callCount = st.email
      ? callCountByEmail.get(st.email.trim().toLowerCase()) ?? 0
      : 0;
    const tier: Tier =
      strat?.engagement_tier === "watch"
        ? "watch"
        : callCount > 0
          ? "engaged"
          : "needs_engaging";
    const role = st.title || strat?.role || roleFromCommittee(st.committee_role);
    const roleLine = [role, strat?.relevance].filter(Boolean).join(" · ");
    return {
      id: st.id,
      name: st.name,
      email: st.email,
      roleLine,
      tier,
      callCount,
    };
  });

  // v5 order: engaged, then needs-engaging, then watch.
  const order: Record<Tier, number> = {
    engaged: 0,
    needs_engaging: 1,
    watch: 2,
  };
  rows.sort((a, b) => order[a.tier] - order[b.tier]);

  const engagedCount = rows.filter((r) => r.tier === "engaged").length;
  const trackable = rows.filter((r) => r.tier !== "watch").length;

  return (
    <section className={s.railPanel}>
      <header className={s.railPanelHead}>
        <span className={s.railPanelTitle}>Stakeholders</span>
        <span className={s.railPanelCount}>
          {engagedCount}/{trackable} engaged · auto from calls
        </span>
      </header>
      <div className={s.engList}>
        {rows.map((r) => (
          <StakeholderRow
            key={r.id}
            row={r}
            dealId={dealId ?? null}
            initiallyFlagged={flaggedIds.has(r.id)}
          />
        ))}
      </div>
    </section>
  );
}

function StakeholderRow({
  row,
  dealId,
  initiallyFlagged,
}: {
  row: Row;
  dealId: string | null;
  initiallyFlagged: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [flagged, setFlagged] = useState(initiallyFlagged);

  // Reflect late-arriving hydration (fetch resolves after first paint).
  useEffect(() => {
    if (initiallyFlagged) setFlagged(true);
  }, [initiallyFlagged]);

  const copy = async () => {
    if (!row.email) return;
    try {
      await navigator.clipboard.writeText(row.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — silent no-op */
    }
  };

  const flag = (reason: FlagReason) => {
    setReasonsOpen(false);
    setFlagged(true); // optimistic
    void recordCockpitAction({
      dealId,
      actionType: "stakeholder_flagged",
      targetRef: row.id,
      reason,
      detail: { name: row.name, role: row.roleLine || undefined },
    });
  };

  const badge =
    row.tier === "engaged"
      ? `engaged · ${row.callCount} ${row.callCount === 1 ? "call" : "calls"}`
      : row.tier === "needs_engaging"
        ? "needs engaging"
        : "watch";

  const rowClass = [
    s.engRow,
    row.tier === "needs_engaging" ? s.engRowNeeds : "",
    flagged ? s.engRowFlagged : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      <span className={`${s.engIcon} ${iconClass(row.tier)}`} aria-hidden>
        {tierIcon(row.tier)}
      </span>
      <div className={s.engBody}>
        <div className={s.engTopLine}>
          <span className={s.engName}>{row.name}</span>
          <span className={`${s.engBadge} ${badgeClass(row.tier)}`}>{badge}</span>
        </div>
        {row.roleLine && <div className={s.engRole}>{row.roleLine}</div>}
        {row.tier !== "watch" && row.email && (
          <button type="button" className={s.engEmailLink} onClick={copy}>
            {copied ? "email copied" : row.email}
          </button>
        )}

        {/* Correction loop */}
        {flagged ? (
          <div className={s.flaggedNote}>✓ Flagged — Mallín will learn</div>
        ) : reasonsOpen ? (
          <div className={s.flagReasons} role="group" aria-label="Why is this wrong?">
            {FLAG_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={s.flagReason}
                onClick={() => flag(r.key)}
              >
                {r.label}
              </button>
            ))}
            <button
              type="button"
              className={s.flagCancel}
              onClick={() => setReasonsOpen(false)}
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={s.flagCtl}
            onClick={() => setReasonsOpen(true)}
          >
            Not the right person?
          </button>
        )}
      </div>
    </div>
  );
}

function iconClass(t: Tier): string {
  return t === "engaged"
    ? s.engIconGood
    : t === "needs_engaging"
      ? s.engIconWarn
      : s.engIconMuted;
}
function badgeClass(t: Tier): string {
  return t === "engaged"
    ? s.engBadgeGood
    : t === "needs_engaging"
      ? s.engBadgeWarn
      : s.engBadgeMuted;
}

function tierIcon(t: Tier) {
  if (t === "engaged") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M5 8.2l2 2 4-4.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (t === "needs_engaging") {
    return (
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M8 4.5v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.2" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
      <circle cx="6.3" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2.2 13c0-2.3 1.8-3.7 4.1-3.7 1 0 1.9.3 2.6.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M12 9.2v4M10 11.2h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function roleFromCommittee(role?: string): string {
  if (!role) return "";
  const map: Record<string, string> = {
    champion: "Champion",
    eb: "Economic buyer",
    economic_buyer: "Economic buyer",
    blocker: "Blocker",
    user: "User",
  };
  return map[role.toLowerCase()] ?? "";
}

function norm(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}
