"use client";

/**
 * InteractiveSystem — the cockpit-as-stack visualization.
 *
 * Rep in the center. Six surrounding tools (Salesforce, HubSpot, Gmail,
 * Slack, Calls, Calendar). Lines connect each tool to the rep with a
 * "Mallín layer" sitting in the middle. Hovering or auto-cycling a
 * tool highlights it + shows what Mallín does there.
 *
 * Design intent (baseten.co-style):
 *   - Central focal point = the rep (the human)
 *   - Radial orbit of systems they touch
 *   - Mallín shown as the layer between, not the center
 *   - Subtle pulse animation suggests data flowing through Mallín
 *   - Hover/auto-cycle reveals what's automated at each touchpoint
 */

import { useEffect, useRef, useState } from "react";
import s from "./interactiveSystem.module.css";

interface Tool {
  id: string;
  label: string;
  /** Two-part value-prop split — surfaces the automation/focus contrast
   *  on every tool. mallin_handles is what disappears from the AE's
   *  workload; ae_focuses_on is what they get to do instead. */
  mallin_handles: string;
  ae_focuses_on: string;
  /** Brand color for the node accent. */
  color: string;
  /** Compact SVG mark — same set as the integration grid. */
  icon: React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    id: "salesforce",
    label: "Salesforce",
    color: "#00A1E0",
    mallin_handles:
      "CRM hygiene — field updates, MEDDPICC progress, audit trail. Every Mallín write goes through Stage 1 Suggest with full rationale.",
    ae_focuses_on:
      "the next move, not the data-entry tax. No more 'I'll update SF after this call' that becomes Friday's homework.",
    icon: <SalesforceIcon />,
  },
  {
    id: "hubspot",
    label: "HubSpot",
    color: "#FF7A59",
    mallin_handles:
      "deal records + custom MEDDPICC properties. Same trust progression as Salesforce — Mallín is CRM-neutral by design.",
    ae_focuses_on:
      "the conversation in the deal. The CRM stays current without thinking about it.",
    icon: <HubSpotIcon />,
  },
  {
    id: "gmail",
    label: "Gmail",
    color: "#EA4335",
    mallin_handles:
      "drafting follow-ups in the AE's voice from the call substrate. Drops in Drafts, or sends with one click. Never sends without the click.",
    ae_focuses_on:
      "reviewing + sending in 30 seconds. No more 'I need an hour after this block to write recaps.'",
    icon: <GmailIcon />,
  },
  {
    id: "slack",
    label: "Slack",
    color: "#36C5F0",
    mallin_handles:
      "verification-gap alerts — DMs the AE, loops in the manager when severity warrants. Same thread, no status meeting required.",
    ae_focuses_on:
      "having the conversation Mallín surfaced. The 'what's at risk' work happens before the rep walks into the next call.",
    icon: <SlackIcon />,
  },
  {
    id: "calls",
    label: "Calls",
    color: "#9aa1ad",
    mallin_handles:
      "listening to every transcript — Gong, Chorus, manual upload. Commitments, thinning signal, qualification gaps surface automatically.",
    ae_focuses_on:
      "the next call. The AE walks in knowing exactly what's been said + what to ask, without re-listening or note-scraping.",
    icon: <CallsIcon />,
  },
  {
    id: "calendar",
    label: "Calendar",
    color: "#4a7186",
    mallin_handles:
      "the pre-call brief in and the post-call pipeline out. Who's in the room, what's at risk, what to ask — assembled before the meeting starts.",
    ae_focuses_on:
      "showing up prepared. After the call, the substrate updates, alerts fire, drafts queue. The AE doesn't touch the operational layer.",
    icon: <CalendarIcon />,
  },
];

const AUTO_CYCLE_MS = 3500;

export default function InteractiveSystem() {
  const [activeId, setActiveId] = useState<string>(TOOLS[0].id);
  const [paused, setPaused] = useState(false);
  const cycleRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-cycle the highlight unless the rep is hovering.
  useEffect(() => {
    if (paused) {
      if (cycleRef.current) clearInterval(cycleRef.current);
      return;
    }
    cycleRef.current = setInterval(() => {
      setActiveId((prev) => {
        const i = TOOLS.findIndex((t) => t.id === prev);
        return TOOLS[(i + 1) % TOOLS.length].id;
      });
    }, AUTO_CYCLE_MS);
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
    };
  }, [paused]);

  const active = TOOLS.find((t) => t.id === activeId) ?? TOOLS[0];

  return (
    <section className={s.section} aria-label="Where Mallín sits in the stack">
      <div className={s.head}>
        <p className={s.eyebrow}>The system around the AE</p>
        <h2 className={s.title}>
          Mallín runs the operational layer.
          <br />
          The AE runs the conversation.
        </h2>
        <p className={s.lede}>
          Every tool the AE lives in — CRM, email, calls, Slack, calendar —
          has a layer of operational work that costs hours every week.
          Mallín automates that layer. The AE gets the time back for the
          things only they can do: hear the customer, build the
          relationship, run the play.
        </p>
      </div>

      <div
        className={s.stage}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className={s.diagram}>
          {/* The orbit + central rep + Mallín layer. Pure SVG so it
              scales cleanly across viewport sizes. Tools render below
              the SVG as positioned <button>s for hover/click. */}
          <svg
            viewBox="0 0 600 600"
            className={s.svg}
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="mallinGlow" cx="50%" cy="50%" r="50%">
                <stop
                  offset="0%"
                  stopColor="rgba(74, 113, 134, 0.20)"
                />
                <stop
                  offset="100%"
                  stopColor="rgba(74, 113, 134, 0)"
                />
              </radialGradient>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(74, 113, 134, 0.45)" />
                <stop offset="100%" stopColor="rgba(74, 113, 134, 0.1)" />
              </linearGradient>
            </defs>

            {/* Mallín layer — soft ring between rep and tools */}
            <circle
              cx="300"
              cy="300"
              r="160"
              fill="url(#mallinGlow)"
              className={s.mallinRing}
            />
            <circle
              cx="300"
              cy="300"
              r="160"
              fill="none"
              stroke="#4a7186"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="2 4"
              className={s.mallinRingStroke}
            />

            {/* Connecting lines from rep to each orbit node */}
            {TOOLS.map((tool, i) => {
              const angle = orbitAngle(i, TOOLS.length);
              const x = 300 + Math.cos(angle) * 230;
              const y = 300 + Math.sin(angle) * 230;
              const isActive = tool.id === activeId;
              return (
                <line
                  key={tool.id}
                  x1="300"
                  y1="300"
                  x2={x}
                  y2={y}
                  stroke={isActive ? tool.color : "url(#lineGrad)"}
                  strokeOpacity={isActive ? 0.8 : 1}
                  strokeWidth={isActive ? "2" : "1"}
                  className={`${s.line} ${isActive ? s.lineActive : ""}`}
                />
              );
            })}

            {/* Animated pulses moving toward + from the center on the
                active line. Two circles travel the path simultaneously
                in opposite directions to suggest two-way flow. */}
            {(() => {
              const i = TOOLS.findIndex((t) => t.id === activeId);
              if (i < 0) return null;
              const angle = orbitAngle(i, TOOLS.length);
              const xEnd = 300 + Math.cos(angle) * 230;
              const yEnd = 300 + Math.sin(angle) * 230;
              return (
                <>
                  <circle
                    r="4"
                    fill={active.color}
                    className={s.pulseIn}
                  >
                    <animate
                      attributeName="cx"
                      from={xEnd}
                      to="300"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      from={yEnd}
                      to="300"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </circle>
                  <circle
                    r="4"
                    fill="#4a7186"
                    className={s.pulseOut}
                  >
                    <animate
                      attributeName="cx"
                      from="300"
                      to={xEnd}
                      dur="1.6s"
                      repeatCount="indefinite"
                      begin="0.8s"
                    />
                    <animate
                      attributeName="cy"
                      from="300"
                      to={yEnd}
                      dur="1.6s"
                      repeatCount="indefinite"
                      begin="0.8s"
                    />
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      dur="1.6s"
                      repeatCount="indefinite"
                      begin="0.8s"
                    />
                  </circle>
                </>
              );
            })()}

            {/* Center — the AE (account executive) */}
            <circle
              cx="300"
              cy="300"
              r="72"
              fill="#1a2230"
              stroke="#faf7ef"
              strokeWidth="3"
              className={s.repCircle}
            />
            <text
              x="300"
              y="296"
              textAnchor="middle"
              fontSize="22"
              fontWeight="700"
              letterSpacing="0.06em"
              fill="#faf7ef"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              AE
            </text>
            <text
              x="300"
              y="316"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="600"
              letterSpacing="0.12em"
              fill="rgba(250, 247, 239, 0.55)"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              ACCOUNT EXECUTIVE
            </text>
            <text
              x="300"
              y="334"
              textAnchor="middle"
              fontSize="7.5"
              fontWeight="500"
              letterSpacing="0.18em"
              fill="rgba(135, 184, 213, 0.85)"
              fontFamily="var(--font-jetbrains-mono), monospace"
            >
              FOCUS: CUSTOMER
            </text>

            {/* Mallín label on the ring */}
            <text
              x="300"
              y="142"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              letterSpacing="0.18em"
              fill="#4a7186"
              fontFamily="var(--font-jetbrains-mono), monospace"
              className={s.mallinLabel}
            >
              MALLIN
            </text>
          </svg>

          {/* Tool nodes — positioned absolutely on top of the SVG */}
          {TOOLS.map((tool, i) => {
            const angle = orbitAngle(i, TOOLS.length);
            const xPct = 50 + (Math.cos(angle) * 230 * 100) / 600;
            const yPct = 50 + (Math.sin(angle) * 230 * 100) / 600;
            const isActive = tool.id === activeId;
            return (
              <button
                key={tool.id}
                type="button"
                className={`${s.node} ${isActive ? s.nodeActive : ""}`}
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  borderColor: isActive ? tool.color : undefined,
                }}
                onMouseEnter={() => setActiveId(tool.id)}
                onFocus={() => setActiveId(tool.id)}
                aria-label={`${tool.label} — Mallín handles ${tool.mallin_handles}`}
                aria-pressed={isActive}
              >
                <span
                  className={s.nodeIcon}
                  style={isActive ? { background: `${tool.color}15` } : undefined}
                >
                  {tool.icon}
                </span>
                <span className={s.nodeLabel}>{tool.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active-tool callout — two-part split: what Mallín handles +
            what the AE gets to focus on instead. Fades on change. */}
        <div className={s.callout} key={activeId}>
          <div className={s.calloutHead}>
            <span
              className={s.calloutDot}
              style={{ background: active.color }}
            />
            <span className={s.calloutTool}>
              At <strong>{active.label}</strong>
            </span>
          </div>

          <div className={s.calloutSplit}>
            <div className={s.calloutHalf}>
              <div
                className={s.calloutHalfLabel}
                style={{ color: active.color }}
              >
                MALLIN HANDLES
              </div>
              <p className={s.calloutHalfBody}>{active.mallin_handles}</p>
            </div>
            <div className={s.calloutHalf}>
              <div className={s.calloutHalfLabel}>AE FOCUSES ON</div>
              <p className={s.calloutHalfBody}>{active.ae_focuses_on}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={s.foot}>
        Mallín handles every system around the AE.
        <strong className={s.footStrong}> The AE handles the customer.</strong>
      </div>
    </section>
  );
}

/** Place tools around the orbit starting from the top (12 o'clock)
 *  and going clockwise. Returns the angle in radians. */
function orbitAngle(i: number, total: number): number {
  return -Math.PI / 2 + (i / total) * Math.PI * 2;
}

// ─── Compact icons (reused style from integrations grid) ──────────────────

function SalesforceIcon() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none" aria-hidden="true">
      <path
        d="M13.5 9.5a5.4 5.4 0 0 1 9.8 1.6 4.2 4.2 0 0 1 1.7-.4 4.6 4.6 0 0 1 .7 9.1 3.6 3.6 0 0 1-3.5 2.7c-.6 0-1.2-.1-1.7-.4a4.1 4.1 0 0 1-7.6.4 3.3 3.3 0 0 1-1.4.3 3.6 3.6 0 0 1-3.4-4.6 3.9 3.9 0 0 1 .9-7.7c.4 0 .9.1 1.3.2a4.5 4.5 0 0 1 3.2-1.2Z"
        fill="#00A1E0"
      />
    </svg>
  );
}

function HubSpotIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z"
        fill="#FF7A59"
      />
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <rect x="13" y="2" width="4" height="13" rx="2" fill="#36C5F0" />
      <rect x="2" y="17" width="13" height="4" rx="2" fill="#2EB67D" />
      <rect x="17" y="13" width="13" height="4" rx="2" fill="#ECB22E" />
      <rect x="13" y="17" width="4" height="13" rx="2" fill="#E01E5A" />
    </svg>
  );
}

function CallsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.05-.24 11.36 11.36 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.58 1 1 0 0 1-.24 1.05Z"
        fill="#1a2230"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="#1a2230" strokeWidth="2" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="#1a2230" strokeWidth="2" />
      <line x1="8" y1="3" x2="8" y2="7" stroke="#1a2230" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="3" x2="16" y2="7" stroke="#1a2230" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.5" fill="#4a7186" />
    </svg>
  );
}
