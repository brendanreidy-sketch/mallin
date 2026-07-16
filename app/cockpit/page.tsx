import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import { AppSignOut } from "@/components/auth/sign-out-button";
import { UpgradeButton } from "@/components/UpgradeButton";
import { getHelpUsage } from "@/lib/billing/help-usage";
import { loadTenantDeals, type Deal } from "@/lib/cockpit/load-tenant-deals";
import AppShell from "@/components/app-shell/AppShell";
import { initialsOf } from "@/components/app-shell/chrome";
import s from "@/components/app-shell/surfaces.module.css";
import Link from "next/link";
import type { CSSProperties } from "react";

const OPTION_CARD: CSSProperties = {
  display: "block",
  textDecoration: "none",
  padding: "16px 18px",
  border: "0.5px solid var(--ck-rule)",
  borderRadius: 10,
  background: "var(--ck-paper)",
};
const OPTION_CARD_PRIMARY: CSSProperties = {
  ...OPTION_CARD,
  border: "1px solid var(--ck-ink)",
};
const OPTION_TITLE: CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: "var(--ck-ink)",
  margin: "0 0 4px",
};
const OPTION_DESC: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "var(--ck-ink-2)",
  margin: 0,
};

/**
 * /cockpit — Home. The daily brief: greeting, a focus card for the deal that
 * needs the rep, and the rest as a watch list. Wrapped in the app shell
 * (sidebar). Content is all live data via loadTenantDeals; no placeholders.
 */
export const dynamic = "force-dynamic";

const TONE_COLOR: Record<Deal["tone"], string> = {
  critical: "var(--ck-crit)",
  caution: "var(--ck-warn)",
  neutral: "var(--ck-good)",
};

export default async function CockpitHome() {
  const { orgId, userId } = await auth();
  if (!userId) redirect("/sign-in");

  if (!orgId) {
    if (await hasCockpitAccess()) redirect("/cockpit-views");
    redirect("/welcome");
  }

  const load = await loadTenantDeals(orgId);
  if (load.kind === "no-tenant") return <EmptyState tenantName={null} />;
  if (load.kind === "no-deals") redirect("/new?mode=upcoming");
  const { tenantName, needsYou, onTrack } = load;
  const usage = await getHelpUsage(load.tenantId);

  const user = await currentUser().catch(() => null);
  const firstName =
    user?.firstName ?? (user?.username ? user.username.split(/[._-]/)[0] : null);
  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    null;
  const initials = initialsOf(fullName);
  const hour = new Date().getHours();
  const greetWord =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const greetingLine = firstName ? `${greetWord}, ${firstName}` : greetWord;
  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const focus = needsYou[0] ?? null;
  const restNeeds = needsYou.slice(1);
  const brief =
    needsYou.length > 0
      ? `${needsYou.length} ${needsYou.length === 1 ? "deal needs" : "deals need"} you today${
          onTrack.length ? `, ${onTrack.length} on track` : ""
        }. I'd start with ${needsYou[0].name}.`
      : onTrack.length > 0
        ? `Nothing urgent right now — ${onTrack.length} ${
            onTrack.length === 1 ? "deal" : "deals"
          } on track.`
        : "No active deals yet.";

  return (
    <AppShell
      name={firstName}
      initials={initials}
      topbar={
        <>
          <span className={s.dstage}>{tenantName ?? "Home"}</span>
          <UpgradeButton
            href="/new?mode=upcoming"
            label="+ New deal"
            locked={usage.over}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--ck-paper)",
              background: "var(--ck-ink)",
              padding: "7px 12px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          />
        </>
      }
    >
      <p
        style={{
          fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.06em",
          color: "var(--ck-ink-3)",
          margin: 0,
        }}
      >
        {dateLabel}
      </p>
      <h1 className={s.h1} style={{ margin: "8px 0 10px" }}>
        {greetingLine}
      </h1>
      <p className={s.brief}>{brief}</p>
      <div className={s.pulse}>
        {needsYou.length > 0 && (
          <span>
            <span className={s.dot} style={{ background: "var(--ck-crit)" }} />
            {needsYou.length} need{needsYou.length === 1 ? "s" : ""} attention
          </span>
        )}
        {onTrack.length > 0 && (
          <span>
            <span className={s.dot} style={{ background: "var(--ck-good)" }} />
            {onTrack.length} on track
          </span>
        )}
      </div>

      {focus && (
        <>
          <div className={s.lbl}>
            <span>Focus now</span>
            <i />
          </div>
          <Link
            href={`/prep?dealId=${focus.id}`}
            className={s.focus}
            style={{ borderLeftColor: TONE_COLOR[focus.tone] }}
          >
            <div className={s.fhead}>
              <span className={s.fname}>{focus.name}</span>
              <span className={s.fchip}>{focus.live ? "Live brief" : "Pre-call"}</span>
            </div>
            <p className={s.freason}>{focus.why}</p>
            <span className={s.fcta}>Open deal →</span>
          </Link>
        </>
      )}

      {restNeeds.length > 0 && (
        <>
          <div className={s.lbl}>
            <span>Also needs you</span>
            <i />
          </div>
          <DealRows deals={restNeeds} />
        </>
      )}

      {onTrack.length > 0 && (
        <>
          <div className={s.lbl}>
            <span>Also watching</span>
            <i />
          </div>
          <DealRows deals={onTrack} />
        </>
      )}
    </AppShell>
  );
}

function DealRows({ deals }: { deals: Deal[] }) {
  return (
    <div className={s.rows}>
      {deals.map((d) => (
        <Link key={d.id} href={`/prep?dealId=${d.id}`} className={s.row}>
          <span className={s.dot} style={{ background: TONE_COLOR[d.tone] }} />
          <span className={s.rmain}>
            <span className={s.rname}>{d.name}</span>
            <span className={s.rwhy}>{d.why}</span>
          </span>
          <span className={`${s.rchip} ${d.live ? s.good : ""}`}>
            {d.live ? "Live brief" : "Pre-call"}
          </span>
          <svg
            className={s.arrow}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      ))}
    </div>
  );
}

/**
 * Empty state — tenant exists but no opportunity seeded yet. Quiet, branded,
 * honest about what's happening. Not wrapped in the app shell (there are no
 * deals to navigate to yet).
 */
function EmptyState({ tenantName }: { tenantName: string | null }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--ck-paper)",
        color: "var(--ck-ink-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          padding: "36px 36px 32px",
          background: "var(--ck-surface)",
          border: "0.5px solid var(--ck-rule)",
          borderRadius: 14,
          boxShadow: "0 1px 3px rgba(26, 34, 48, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.015em",
          }}
        >
          <MallinMark />
          Mallín
          {tenantName && (
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
                fontSize: 11,
                fontWeight: 500,
                color: "var(--ck-ink-3)",
                letterSpacing: "0.06em",
                marginLeft: 8,
              }}
            >
              {tenantName}
            </span>
          )}
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.018em",
            lineHeight: 1.3,
            color: "var(--ck-ink)",
          }}
        >
          What do you want Mallín to do?
        </h1>

        <p style={{ margin: "-4px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--ck-ink-2)" }}>
          Two jobs, one workspace. Pick where to start — you can do the other anytime.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/new?mode=upcoming" style={OPTION_CARD_PRIMARY}>
            <div style={OPTION_TITLE}>Prep me for my sales calls →</div>
            <div style={OPTION_DESC}>
              Tell Mallín who you&rsquo;re meeting; it researches the account and the people before
              the call, then keeps your brief current as you roll call to call.
            </div>
          </Link>

          <Link href="/sdr/setup" style={OPTION_CARD}>
            <div style={OPTION_TITLE}>Qualify my inbound prospects →</div>
            <div style={OPTION_DESC}>
              An AI SDR that triages visitors on your site — work now, nurture, or pass — by your
              rules, and acts on the decision.
            </div>
          </Link>
        </div>

        <Link
          href="/new"
          style={{
            alignSelf: "flex-start",
            marginTop: -4,
            fontSize: 13,
            color: "var(--ck-ink-3)",
            textDecoration: "none",
          }}
        >
          Already had the call?{" "}
          <span style={{ textDecoration: "underline" }}>Paste a transcript instead →</span>
        </Link>

        <div
          style={{
            marginTop: 6,
            paddingTop: 14,
            borderTop: "0.5px dashed rgba(26, 34, 48, 0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "var(--ck-ink-3)",
          }}
        >
          <span>
            Questions?{" "}
            <Link href="mailto:hello@mallin.io" style={{ color: "var(--ck-blue)", textDecoration: "underline" }}>
              hello@mallin.io
            </Link>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
            <Link href="/" style={{ color: "var(--ck-ink-3)", textDecoration: "none", fontSize: 12 }}>
              ← Mallín home
            </Link>
            <AppSignOut />
          </span>
        </div>
      </div>
    </main>
  );
}

function MallinMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#1a2230" />
      <path
        d="M8 18 L12 14 L16 16 L20 12 L24 16"
        stroke="#88b8d0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M7 22 L25 22" stroke="#f4f1ea" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
