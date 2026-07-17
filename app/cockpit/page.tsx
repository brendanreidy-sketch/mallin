import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/db/client";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import { AppSignOut } from "@/components/auth/sign-out-button";
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
 * /cockpit — post-sign-in landing route.
 *
 * Resolves the current user's tenant from their Clerk session, finds
 * the most-recent opportunity in that tenant, and redirects to
 * /prep?dealId=<their-opp-uuid>.
 *
 * NOTE (2026-07-17): a deals-home overview render (both the app-shell and the
 * greeting-card versions of this page) throws an auth-gated Server Components
 * render error in production (digest 223926392) that could not be reproduced
 * locally (Clerk-gated). This page is intentionally back to the simple,
 * last-known-good redirect below until that render bug is isolated. The old
 * DealsHome/DealGroup/DealRow components live in git history for that fix.
 *
 * Terminal states:
 *   1. Tenant + opp → redirect to /prep?dealId=<uuid>
 *   2. Tenant exists, no opp → render empty-state ("data not ready")
 *   3. Signed in, no org, but a cockpit owner → /cockpit-views (the book).
 *   4. Signed in, no org, not an owner → /welcome (self-serve provisioning).
 *   5. No Clerk session → /sign-in
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
    // Otherwise a freshly signed-up user with no workspace yet — /welcome
    // creates their personal org + tenant, activates it, and sends them back.
    redirect("/welcome");
  }

  // Resolve tenant by Clerk org_id (stored as tenants.slug).
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", orgId)
    .maybeSingle();

  if (!tenant) {
    // Logged in but no tenant row yet — data-not-ready empty state.
    return <EmptyState tenantName={null} />;
  }

  // The most-recent opportunity for this tenant.
  const { data: opps } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!opps || opps.length === 0) {
    // Fresh self-serve user, no deal yet — straight into intake.
    redirect("/new?mode=upcoming");
  }

  // Land the rep on their most-recent deal, which /prep renders reliably.
  redirect(`/prep?dealId=${opps[0].id}`);
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
