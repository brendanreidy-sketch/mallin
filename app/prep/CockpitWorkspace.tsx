"use client";

/**
 * CockpitWorkspace — focused-surface tab control for /prep.
 *
 * Replaces the old "render every section as a long scroll" layout with
 * a focused workspace: ONE active surface at a time, fast switching
 * between them via the tab bar.
 *
 * The principle: the top of the brief answers "what's happening" within
 * 5 seconds. The workspace below answers "what should I do next" by
 * letting the rep land on a single contextual surface (Email / CRM /
 * Slack / Ask) without scrolling past everything else.
 *
 * Tabs render conditionally based on what's available for this deal
 * (don't show CRM if no suggestions, don't show Slack if no candidate
 * ids). The "Overview" tab is the default — it carries the action
 * queue, pre-mortem, talk-track, and contextual info.
 *
 * Panels stay mounted via CSS visibility (display:none) so internal
 * state (email draft edits, ask-bar history) survives tab switching.
 * Cost: all panels render once on mount; benefit: instant tab switch
 * with no re-fetch / no lost draft.
 */

import { useState, type ReactNode } from "react";
import s from "./cockpitWorkspace.module.css";

export type WorkspaceTab = "overview" | "email" | "crm" | "slack" | "ask";

interface TabDef {
  id: WorkspaceTab;
  label: string;
  emoji: string;
  count?: number;
  visible: boolean;
}

interface Props {
  overview: ReactNode;
  email?: ReactNode;
  crm?: ReactNode;
  slack?: ReactNode;
  ask?: ReactNode;
  emailCount?: number;
  crmCount?: number;
  slackCount?: number;
  /** Default landing tab. Defaults to "overview". */
  initial?: WorkspaceTab;
}

export default function CockpitWorkspace({
  overview,
  email,
  crm,
  slack,
  ask,
  emailCount,
  crmCount,
  slackCount,
  initial = "overview",
}: Props) {
  const [active, setActive] = useState<WorkspaceTab>(initial);

  const tabs: TabDef[] = [
    {
      id: "overview",
      label: "Overview",
      emoji: "◎",
      visible: true,
    },
    {
      id: "email",
      label: "Draft email",
      emoji: "✉",
      count: emailCount,
      visible: Boolean(email),
    },
    {
      id: "crm",
      label: "CRM updates",
      emoji: "✎",
      count: crmCount,
      visible: Boolean(crm),
    },
    {
      id: "slack",
      label: "Slack",
      emoji: "✦",
      count: slackCount,
      visible: Boolean(slack),
    },
    {
      id: "ask",
      label: "Ask Mallín",
      emoji: "→",
      visible: Boolean(ask),
    },
  ];

  return (
    <div className={s.workspace}>
      <nav className={s.tabBar} aria-label="Cockpit workspace">
        {tabs
          .filter((t) => t.visible)
          .map((t) => {
            const isActive = active === t.id;
            const isAsk = t.id === "ask";
            return (
              <button
                key={t.id}
                type="button"
                className={`${s.tab} ${isActive ? s.tabActive : ""} ${
                  isAsk ? s.tabPrimary : ""
                }`}
                onClick={() => setActive(t.id)}
                aria-pressed={isActive}
              >
                <span className={s.tabEmoji} aria-hidden="true">
                  {t.emoji}
                </span>
                <span className={s.tabLabel}>{t.label}</span>
                {typeof t.count === "number" && t.count > 0 ? (
                  <span className={s.tabCount}>{t.count}</span>
                ) : null}
              </button>
            );
          })}
      </nav>

      <div className={s.panels}>
        <div
          className={s.panel}
          style={{ display: active === "overview" ? undefined : "none" }}
          aria-hidden={active !== "overview"}
        >
          {overview}
        </div>
        {email && (
          <div
            className={s.panel}
            style={{ display: active === "email" ? undefined : "none" }}
            aria-hidden={active !== "email"}
          >
            {email}
          </div>
        )}
        {crm && (
          <div
            className={s.panel}
            style={{ display: active === "crm" ? undefined : "none" }}
            aria-hidden={active !== "crm"}
          >
            {crm}
          </div>
        )}
        {slack && (
          <div
            className={s.panel}
            style={{ display: active === "slack" ? undefined : "none" }}
            aria-hidden={active !== "slack"}
          >
            {slack}
          </div>
        )}
        {ask && (
          <div
            className={s.panel}
            style={{ display: active === "ask" ? undefined : "none" }}
            aria-hidden={active !== "ask"}
          >
            {ask}
          </div>
        )}
      </div>
    </div>
  );
}
