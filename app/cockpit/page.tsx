import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/db/client";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import { AppSignOut } from "@/components/auth/sign-out-button";
import { SettingsLink } from "@/components/nav/settings-link";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import AccountLogo from "@/components/AccountLogo";
import { UpgradeButton } from "@/components/UpgradeButton";
import { getHelpUsage } from "@/lib/billing/help-usage";
import { dealPriority } from "@/lib/cockpit/deal-priority";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import type { AccountIntelligenceArtifact } from "@/lib/intelligence/types";
import Link from "next/link";
import type { CSSProperties } from "react";
import s from "./cockpit.module.css";

// The visitor's IANA timezone, from Vercel's edge geolocation header
// (e.g. "America/Denver"). Validated before use because Intl.DateTimeFormat
// throws a RangeError on an unknown/malformed zone. Returns null when the
// header is absent (local dev / non-Vercel) or invalid, so callers fall back.
function resolveTimeZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

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
 * /cockpit — post-sign-in landing route.
 *
 * Resolves the current user's tenant from their Clerk session, finds
 * the most-recent opportunity in that tenant, and redirects to
 * /prep?dealId=<their-opp-uuid>.
 *
 * Why this exists: ClerkProvider's signInFallbackRedirectUrl is a
 * static string — it can't know which deal belongs to which tenant.
 * /cockpit does the per-tenant lookup at request time.
 *
 * Terminal states:
 *   1. Tenant + opp → redirect to /prep?dealId=<uuid>
 *   2. Tenant exists, no opp → render empty-state ("data not ready")
 *      — used while substrate is being provisioned manually
 *   3. Signed in, no org, but a cockpit owner → /cockpit-views (the book).
 *      The owner gate is org-independent (email allowlist), so the owner
 *      must not be bounced just because they have no tenant org. Without
 *      this, a successful sign-in lands on /cockpit, finds no orgId, and
 *      redirects back to /sign-in — indistinguishable from a failed login.
 *   4. No Clerk session → /sign-in
 */
export const dynamic = "force-dynamic";

export default async function CockpitRedirectPage() {
  const { orgId, userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (!orgId) {
    // No tenant org. Cockpit owners still have a home — the book — gated by
    // email, not org membership.
    if (await hasCockpitAccess()) {
      redirect("/cockpit-views");
    }
    // Otherwise this is a freshly signed-up user with no workspace yet (the
    // B2C self-serve path, or any signup that didn't get manually provisioned).
    // /welcome creates their personal org + tenant, activates it, and sends
    // them back here. This is the trigger for self-serve provisioning.
    redirect("/welcome");
  }

  // Signed-in rep identity for the operating-layer sidebar (the same helper the
  // other shell surfaces use; Clerk dedupes the read within the request). This
  // is UI identity only — it does not touch deal, tenant, ranking, or data logic.
  const { name, initials } = await shellUser();

  // Resolve tenant by Clerk org_id (stored as tenants.slug)
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, is_demo, name")
    .eq("slug", orgId)
    .maybeSingle();

  if (!tenant) {
    // Logged in but no tenant row yet — fall through to empty state,
    // seated inside the operating-layer shell like the deals home.
    return (
      <AppShell name={name} initials={initials}>
        <EmptyState tenantName={null} />
      </AppShell>
    );
  }

  // Free-tier meter — gate the "+ New deal" button up front when over limit.
  const usage = await getHelpUsage(tenant.id);

  // Every opportunity for this tenant — the deals home. (Was a redirect to
  // the single most-recent deal, which stranded every other deal.)
  const { data: opps } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, account_id, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (!opps || opps.length === 0) {
    // Fresh self-serve user, no deal yet — straight into intake.
    redirect("/new?mode=upcoming");
  }

  // Resolve account names/logos + each deal's CURRENT brief (live = a processed
  // call in execution_artifacts; pre-call = account_intelligence only). The
  // artifacts feed the priority engine, so the home can rank "what needs you."
  const accountIds = [...new Set(opps.map((o) => o.account_id).filter(Boolean))];
  const oppIds = opps.map((o) => o.id);
  const [accountsRes, liveRes, intelRes] = await Promise.all([
    accountIds.length
      ? supabaseAdmin.from("accounts").select("id, name, domain").in("id", accountIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; domain: string | null }[] }),
    supabaseAdmin
      .from("execution_artifacts")
      .select("opportunity_id, artifact")
      .in("opportunity_id", oppIds)
      .eq("is_current", true),
    supabaseAdmin
      .from("account_intelligence_artifacts")
      .select("opportunity_id, artifact")
      .in("opportunity_id", oppIds)
      .eq("is_current", true),
  ]);
  const acctById = new Map((accountsRes.data ?? []).map((a) => [a.id, a]));
  const liveById = new Map(
    (liveRes.data ?? []).map((r) => [r.opportunity_id, r.artifact as PrepArtifact]),
  );
  const intelById = new Map(
    (intelRes.data ?? []).map((r) => [
      r.opportunity_id,
      r.artifact as AccountIntelligenceArtifact,
    ]),
  );

  const now = new Date();
  const deals: Deal[] = opps.map((o) => {
    const acct = o.account_id ? acctById.get(o.account_id) : null;
    const live = liveById.get(o.id) ?? null;
    const intel = intelById.get(o.id) ?? null;
    const name = o.name || acct?.name || "Untitled deal";
    const prio = dealPriority({ id: o.id, name, live, intel }, now);
    return {
      id: o.id,
      name,
      accountName: acct?.name ?? null,
      domain: acct?.domain ?? null,
      live: Boolean(live),
      createdAt: o.created_at as string,
      ...prio,
    };
  });

  // Needs-you first (most urgent on top), then on-track (most recent first —
  // they're already created_at desc from the query).
  const needsYou = deals.filter((d) => d.needsYou).sort((a, b) => b.score - a.score);
  const onTrack = deals.filter((d) => !d.needsYou);

  // Daily-brief framing — the "Mallín is driving" greeting on the deals home.
  // Everything here is derived from real data: the rep's Clerk first name, the
  // live needs-you / on-track counts, and the top-priority deal. No placeholders.
  const greetUser = await currentUser().catch(() => null);
  const firstName =
    greetUser?.firstName ??
    (greetUser?.username ? greetUser.username.split(/[._-]/)[0] : null);
  // Greeting + date reflect the visitor's LOCAL calendar day, from the same
  // `now` instant, using their edge-geolocated timezone. Thresholds:
  //   morning 00:00–11:59 · afternoon 12:00–16:59 · evening 17:00–23:59.
  // When the timezone is unavailable/invalid we can't know their time of day,
  // so we drop to a neutral, never-wrong greeting and the server-default date.
  const tz = resolveTimeZone((await headers()).get("x-vercel-ip-timezone"));
  const localHour =
    tz === null
      ? null
      : Number(
          new Intl.DateTimeFormat("en-US", {
            hour: "2-digit",
            hourCycle: "h23",
            timeZone: tz,
          }).format(now),
        );
  const greetWord =
    localHour === null
      ? null
      : localHour < 12
        ? "Good morning"
        : localHour < 17
          ? "Good afternoon"
          : "Good evening";
  const greetingLine = greetWord
    ? firstName
      ? `${greetWord}, ${firstName}`
      : greetWord
    : firstName
      ? `Welcome back, ${firstName}`
      : "Welcome back";
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(tz ? { timeZone: tz } : {}),
  });
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
    <AppShell name={name} initials={initials}>
      <DealsHome
        tenantName={tenant.name}
        greetingLine={greetingLine}
        dateLabel={dateLabel}
        brief={brief}
        needsYou={needsYou}
        onTrack={onTrack}
        overLimit={usage.over}
      />
    </AppShell>
  );
}

interface Deal {
  id: string;
  name: string;
  accountName: string | null;
  domain: string | null;
  live: boolean;
  createdAt: string;
  needsYou: boolean;
  score: number;
  why: string;
  tone: "critical" | "caution" | "neutral";
}

/**
 * DealsHome — the post-sign-in home. Lists every deal so the rep can get
 * back into any of them (and add the next call), instead of being dropped on
 * whichever deal happened to be most recent.
 */
function DealsHome({
  tenantName,
  greetingLine,
  dateLabel,
  brief,
  needsYou,
  onTrack,
  overLimit,
}: {
  tenantName: string | null;
  greetingLine: string;
  dateLabel: string;
  brief: string;
  needsYou: Deal[];
  onTrack: Deal[];
  overLimit: boolean;
}) {
  return (
    <main className={s.main}>
      <div className={s.container}>
        <header className={s.header}>
          <div className={s.brand}>
            <MallinMark />
            Mallín
            {tenantName && (
              <span className={s.tenant} title={tenantName}>
                {tenantName}
              </span>
            )}
          </div>
          <div className={s.controls}>
            <SettingsLink />
            <AppSignOut />
          </div>
        </header>

        <div className={s.masthead}>
          <p className={s.eyebrow}>{dateLabel}</p>
          <h1 className={s.greeting}>{greetingLine}</h1>
          <p className={s.brief}>{brief}</p>
        </div>

        <div className={s.dealsHead}>
          <h2 className={s.dealsHeading}>Your deals</h2>
          <UpgradeButton
            href="/new?mode=upcoming"
            label="+ New deal"
            locked={overLimit}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ck-paper)",
              background: "var(--ck-ink)",
              padding: "9px 14px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          />
        </div>

        {needsYou.length > 0 && (
          <DealGroup
            label={`Needs you · ${needsYou.length}`}
            labelColor="var(--ck-crit)"
            deals={needsYou}
            attention
          />
        )}
        {onTrack.length > 0 && (
          <DealGroup
            label={`On track · ${onTrack.length}`}
            labelColor="var(--ck-ink-3)"
            deals={onTrack}
            marginTop={needsYou.length > 0 ? 20 : 0}
          />
        )}
      </div>
    </main>
  );
}

function DealGroup({
  label,
  labelColor,
  deals,
  marginTop = 0,
  attention = false,
}: {
  label: string;
  labelColor: string;
  deals: Deal[];
  marginTop?: number;
  attention?: boolean;
}) {
  return (
    <div style={marginTop ? { marginTop } : undefined}>
      <div className={s.groupLabel} style={{ color: labelColor }}>
        {label}
      </div>
      <ul className={attention ? s.attentionList : s.list}>
        {deals.map((d) => (
          <li key={d.id}>
            <DealRow d={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DealRow({ d }: { d: Deal }) {
  return (
    <Link href={`/prep?dealId=${d.id}`} className={s.row} data-tone={d.tone}>
      <span className={s.dot} data-tone={d.tone} aria-hidden="true" />
      <span className={s.rowMain}>
        <span className={s.name}>{d.name}</span>
        <span className={s.why} title={d.why}>
          {d.why}
        </span>
      </span>
      <span className={s.pill} data-live={d.live ? "true" : undefined}>
        {d.live ? "Live brief" : "Pre-call"}
      </span>
      <span className={s.arrow} aria-hidden="true">
        →
      </span>
    </Link>
  );
}

/**
 * Empty state — shown when the tenant exists but no opportunity has
 * been seeded yet. This is the expected state for a blank-canvas
 * demo partner between "tenant provisioned" and "transcripts loaded."
 * Quiet, branded, honest about what's happening.
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

        <p
          style={{
            margin: "-4px 0 0",
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ck-ink-2)",
          }}
        >
          Two jobs, one workspace. Pick where to start — you can do the other
          anytime.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Prep — leads with the intelligent prep form (upcoming call), not
              "paste a call": a new rep's first move is usually an upcoming intro
              call with no transcript yet. */}
          <Link href="/new?mode=upcoming" style={OPTION_CARD_PRIMARY}>
            <div style={OPTION_TITLE}>Prep me for my sales calls →</div>
            <div style={OPTION_DESC}>
              Tell Mallín who you&rsquo;re meeting; it researches the account and
              the people before the call, then keeps your brief current as you
              roll call to call.
            </div>
          </Link>

          {/* Inbound qualification — the governed SDR agent. */}
          <Link href="/sdr/setup" style={OPTION_CARD}>
            <div style={OPTION_TITLE}>Qualify my inbound prospects →</div>
            <div style={OPTION_DESC}>
              An AI SDR that triages visitors on your site — work now, nurture,
              or pass — by your rules, and acts on the decision.
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
          Already had the call? <span style={{ textDecoration: "underline" }}>Paste a transcript instead →</span>
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
            <Link
              href="mailto:hello@mallin.io"
              style={{ color: "var(--ck-blue)", textDecoration: "underline" }}
            >
              hello@mallin.io
            </Link>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
            <Link
              href="/"
              style={{
                color: "var(--ck-ink-3)",
                textDecoration: "none",
                fontSize: 12,
              }}
            >
              ← Mallín home
            </Link>
            <AppSignOut />
          </span>
        </div>
      </div>
    </main>
  );
}

/**
 * Brand mark — the same navy-circle + stream-blue chart-line glyph used on
 * the sign-in page (app/sign-in/.../page.tsx). Replaces the old orange square
 * so the post-sign-in landing reads as one brand with sign-in and the cockpit.
 */
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
      <path
        d="M7 22 L25 22"
        stroke="#f4f1ea"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
