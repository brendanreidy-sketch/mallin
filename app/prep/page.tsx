/**
 * ============================================================================
 *  PrepArtifact Web View — dark-theme, hierarchy-driven (Phase A r2)
 * ============================================================================
 *
 *  Rebuild after the first redesign rendered jumbled (Tailwind isn't
 *  installed in this project — utility classes were no-ops). This version
 *  uses a scoped CSS module (`prep.module.css`) with proper typography
 *  hierarchy, breathing room, and visual structure.
 *
 *  Loads BOTH the PrepArtifact and the source substrate so the page can
 *  render account/stakeholder context. Filename pattern:
 *    <name>.pass3-merged.pass4-output.json → <name>.json
 *
 *  Phase B (next): wire the Ask bar to /api/coach with streaming Claude.
 * ============================================================================
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  PrepArtifact,
  CriticalRisk,
} from "@/lib/contracts/execution-agent-output";
import { loadDealFromDB } from "@/lib/db/load-deal";
import { generateFollowupDraft } from "@/lib/agents/draft-followup";
import { deriveCrmSuggestions } from "@/lib/agents/derive-crm-suggestions";
import { getProviderName } from "@/lib/crm";
import { after } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordBriefView } from "@/lib/cockpit/record-brief-view";
import { getGmailConnectionStatus } from "@/lib/auth/gmail-oauth";
import { resolveDeckRecipients } from "@/lib/deck/resolve-deck-recipients";
import { isTenantDemo, isTenantSolo, getCurrentTenantId } from "@/lib/auth/tenant-context";
import { getHelpUsage } from "@/lib/billing/help-usage";
import { UpgradeButton } from "@/components/UpgradeButton";
import { checkOpportunityAccess } from "@/lib/auth/opportunity-access";
import s from "./prep.module.css";
import { BackLink } from "@/components/BackLink";
import SimModeBanner from "./SimModeBanner";
import LogTouchComposer, {
  type ComposerStakeholder,
} from "./LogTouchComposer";
import AskBar from "./AskBar";
import IntelligenceRefresh from "./IntelligenceRefresh";
import EmailComposer from "./EmailComposer";
import SuggestedUpdates from "./SuggestedUpdates";
import CockpitWorkspace from "./CockpitWorkspace";
import PrimaryDecisionFocus, {
  type PrimaryDecisionFocusData,
} from "./PrimaryDecisionFocus";
import CockpitInstrumentation from "./CockpitInstrumentation";
import AccountIntelligence from "./AccountIntelligence";
import GenerateDeckButton from "./GenerateDeckButton";
import LiveCoach from "./LiveCoach";
import PrepGreeting from "./PrepGreeting";
import ArtifactVersionPicker from "./ArtifactVersionPicker";
import StakeholderEngagement from "./StakeholderEngagement";
import DeliverablesChecklist from "./DeliverablesChecklist";
import HowYouWin from "./HowYouWin";
import ThemeProvider from "./ThemeProvider";
import IntelAutoRefresh from "./IntelAutoRefresh";
import ThemeModeToggle from "./ThemeModeToggle";
import MallinMark from "@/components/MallinMark";
import { AppSignOut } from "@/components/auth/sign-out-button";
import DealOutcome from "./DealOutcome";
import BriefFeedback from "./BriefFeedback";
import {
  loadAccountIntelligenceByOpp,
  loadOpportunityShellByDealId,
} from "@/lib/db/load-account-intelligence";
import SlackActivity from "./SlackActivity";
import ActionQueue from "./ActionQueue";
import RiskQueueActions from "./RiskQueueActions";
import { listForDeal as listQueueForDeal } from "@/lib/action-queue/queue";

export const dynamic = "force-dynamic";

const DEFAULT_ARTIFACT =
  "hooli-holdings.pass4-output.json";

// Access gating moved to tenant-membership check via
// `checkOpportunityAccess` (see lib/auth/opportunity-access.ts).
// The legacy DEMO_ALLOWED_DEAL_IDS env-var allowlist was retired
// May 20 2026 — see memory: intake_primitive_doctrine.md.

// ────────────────────────────────────────────────────────────────────────────
// Substrate type (only the fields we read here)
// ────────────────────────────────────────────────────────────────────────────

interface Substrate {
  opportunity?: {
    id?: string;
    tenant_id?: string;
    name?: string;
    stage_label?: string;
    stage_position?: number;
    total_stages?: number;
    amount?: number | null;
    currency?: string | null;
    close_date?: string | null;
    last_activity_at?: string | null;
  };
  account?: {
    id?: string;
    name?: string;
    industry?: string;
    headquarters?: string;
    size_descriptor?: string;
    /** Macro frame from the Intelligence Agent. */
    strategic_priority?: string;
    /** External observations (news, leadership, funding) from the
     *  Intelligence Agent. Sourced from public_signals table. */
    public_signals?: Array<{
      summary: string;
      observed_at: string;
      source: string;
      source_url?: string;
    }>;
  };
  calls?: Array<{
    id: string;
    title?: string;
    started_at?: string;
    duration_seconds?: number;
    summary?: string;
    attendee_emails?: string[];
  }>;
  stakeholders?: Array<{
    id: string;
    name: string;
    title?: string;
    company?: string;
    committee_role?: string;
    deal_disposition?: string;
    email?: string;
  }>;
  internal_participants?: Array<{
    id?: string;
    name?: string;
    email?: string;
    title?: string;
    role?: string;
  }>;
  activities?: Array<{
    id: string;
    type: string;
    occurred_at: string;
    subject?: string;
    summary?: string | null;
    source_system?: string;
    with_stakeholder_id?: string;
    crm_sync?: {
      status: "synced" | "failed" | "pending" | "not_configured";
      http_status?: number;
      error?: string;
      attempted_at?: string;
      succeeded_at?: string;
      webhook_url?: string;
    };
  }>;
}

function loadSubstrate(artifactFilename: string): Substrate | null {
  const substrateFilename = artifactFilename.replace(
    /\.pass3-merged\.pass4-output\.json$/,
    ".json",
  );
  const path = resolve(process.cwd(), "scripts/_fixtures", substrateFilename);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Substrate;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default async function PrepPage({
  searchParams,
}: {
  searchParams: Promise<{
    file?: string;
    dealId?: string;
    savedTouch?: string;
    v?: string;
    artifactId?: string;
  }>;
}) {
  const { file, dealId, savedTouch, v, artifactId } = await searchParams;
  // Feature flag for the v0 lite cut. Above-the-fold only:
  //   strategic frame + ONE path + signal dots + AskBar.
  // Everything else is hidden. See Brendan's spec: hard cut, no
  // expandable "more" sections, no half-measures.
  const liteMode = v === "lite";

  let artifact: PrepArtifact;
  let substrate: Substrate | null;
  let touchTarget: string;
  // The coach surface needs a stable deal UUID. Only the dealId path
  // produces one; the legacy file path leaves it null and the coach
  // surface gracefully degrades.
  let coachDealId: string | null = null;
  let previousArtifact: PrepArtifact | null = null;
  let regenInFlight = false;
  let latestTouchAt: string | null = null;
  let artifactVersions: import("@/lib/db/load-deal").ArtifactVersionSummary[] =
    [];
  let currentArtifactId: string | null = null;
  // Solo (individual self-serve) workspaces hide team-only cockpit surfaces.
  // Defaults to false (team) — only the dealId path can flip it true.
  let isSolo = false;
  let overLimit = false;

  // ── Path A: dealId → load from Supabase (the deployed path) ───────────────
  if (dealId) {
    const safeDealId = dealId.replace(/[^a-fA-F0-9-]/g, "");

    // Tenant-membership gate: the opportunity must belong to the
    // current user's tenant. Replaces the previous env-var allowlist.
    const userTenantId = await getCurrentTenantId().catch(() => null);
    isSolo = userTenantId ? await isTenantSolo(userTenantId) : false;
    // Free-tier meter — gate the "+ Add the call" buttons up front when over.
    overLimit = userTenantId
      ? (await getHelpUsage(userTenantId)).over
      : false;
    const access = await checkOpportunityAccess(safeDealId, userTenantId);
    if (!access.ok) {
      const message =
        access.reason === "not_found"
          ? `Deal not found: ${safeDealId}`
          : access.reason === "no_tenant_in_context"
            ? "Sign in to view this opportunity."
            : "This opportunity belongs to a different tenant.";
      return (
        <div className={s.page}>
          <div className={s.shell}>
            <div style={{ padding: "48px 36px", color: "var(--ck-ink-3)" }}>
              {message}
            </div>
          </div>
        </div>
      );
    }

    const safeArtifactId = artifactId
      ? artifactId.replace(/[^a-fA-F0-9-]/g, "")
      : undefined;
    // Retention signal: record that this rep opened this deal's brief (access
    // is confirmed above). Throttled + non-blocking via after() — telemetry
    // never affects the page or the brief.
    const { userId: viewerId } = await auth();
    if (viewerId && userTenantId) {
      const vTenant = userTenantId;
      after(() =>
        recordBriefView({
          tenantId: vTenant,
          opportunityId: safeDealId,
          userId: viewerId,
        }),
      );
    }

    const loaded = await loadDealFromDB(safeDealId, safeArtifactId);
    if (!loaded) {
      return (
        <div className={s.page}>
          <div className={s.shell}>
            <div style={{ padding: "48px 36px", color: "var(--ck-ink-3)" }}>
              Deal not found: <code>{safeDealId}</code>
            </div>
          </div>
        </div>
      );
    }
    if (!loaded.artifact) {
      // No Pass 4 substrate-derived artifact yet — but a Pass 0 /
      // Account Intelligence artifact may exist (cold pre-call brief
      // populated from public research while waiting for call
      // transcripts). Render that if available.
      const intel = await loadAccountIntelligenceByOpp(safeDealId);
      const shell = await loadOpportunityShellByDealId(safeDealId);
      const intelTenantId = shell?.tenant_id ?? null;
      const intelIsDemo = intelTenantId
        ? await isTenantDemo(intelTenantId)
        : false;

      // Resolve the customer's CRM provider so the rep-notes sync chip
      // can render "Synced to HubSpot" / "Synced to Salesforce" / etc.
      // Provider-neutral at the component level — string is render-time
      // only. Falls back to null → generic "Synced to CRM" when the
      // tenant has no provider configured (demo tenants).
      let intelProviderLabel: string | null = null;
      if (intelTenantId) {
        try {
          intelProviderLabel = await getProviderName(intelTenantId);
        } catch {
          intelProviderLabel = null;
        }
      }

      const greetUser = await currentUser().catch(() => null);
      const greetFirstName =
        greetUser?.firstName ??
        (greetUser?.username ? greetUser.username.split(/[._-]/)[0] : null);

      return (
        <div className={s.page}>
          <ThemeProvider />
          <SimModeBanner isDemo={intelIsDemo} />
          <PrepGreeting
            firstName={greetFirstName}
            accountName={shell?.account_name ?? "Deal"}
            accountDomain={intel?.account?.domain ?? null}
          />
          <div className={s.shell}>
            {intel ? (
              <>
                {/* Pre-call framing + the loop-closing CTA: once the call
                    happens, "+ Add the call" deep-links into /new on this
                    deal (follow-up mode) → it becomes a full deal brief. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 22px",
                    borderBottom: "1px solid var(--ck-rule)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--ck-blue)",
                    }}
                  >
                    — Before your call · no call logged yet
                  </span>
                  <UpgradeButton
                    href={`/new?dealId=${safeDealId}`}
                    label="+ Add the call"
                    locked={overLimit}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 13px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ck-blue)",
                      border: "1px solid var(--ck-blue)",
                      borderRadius: 7,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  />
                </div>
                <AccountIntelligence
                  artifact={intel}
                  opportunityId={safeDealId}
                  accountId={shell?.account_id ?? undefined}
                  providerLabel={intelProviderLabel}
                />
              </>
            ) : (
              <div style={{ padding: "48px 36px", color: "var(--ck-ink-3)" }}>
                <h2 style={{ color: "var(--ck-ink)", fontSize: 18, margin: 0 }}>
                  {shell?.account_name ?? "Deal"}
                </h2>
                <p style={{ marginTop: 12, lineHeight: 1.6, maxWidth: 560 }}>
                  No pre-call brief yet. Account intelligence will appear
                  here once it&apos;s loaded; call analysis will appear
                  once transcripts are processed.
                </p>
              </div>
            )}
            {/* Deck / PPT generator — same control the cockpit rail has.
                Works pre-call: the customer deck falls back to a basic deck
                without a transcript, and the private "Prep notes" .pptx builds
                straight from this account-intelligence brief. */}
            {intel && (
              <div style={{ padding: "10px 36px 2px" }}>
                <GenerateDeckButton dealId={safeDealId} />
              </div>
            )}
            {/* Live coach — real-time in-call advisor. Available
                whenever a deal is loaded (works with or without Pass 4). */}
            {intel && (
              <LiveCoach
                dealId={safeDealId}
                accountName={shell?.account_name ?? null}
              />
            )}
          </div>
        </div>
      );
    }
    artifact = loaded.artifact;
    substrate = loaded.substrate as Substrate;
    touchTarget = `dealId:${safeDealId}`;
    coachDealId = safeDealId;
    previousArtifact = loaded.previousArtifact;
    regenInFlight = loaded.regenInFlight;
    latestTouchAt = loaded.latestTouchAt;
    artifactVersions = loaded.artifactVersions;
    currentArtifactId = loaded.currentArtifactId;
  } else {
    // ── Path B: file → load from JSON fixture (legacy local path) ───────────
    const safe = (file ?? "").replace(/[^\w.-]/g, "");
    const filename = safe || DEFAULT_ARTIFACT;
    const raw = readFileSync(
      resolve(process.cwd(), "scripts/_fixtures", filename),
      "utf-8",
    );
    artifact = JSON.parse(raw) as PrepArtifact;
    substrate = loadSubstrate(filename);
    touchTarget = filename;
  }

  // ── Banner-state machine (data-inferred, no schema state) ──────────────
  //
  //   bannerState         meaning                                   shown when
  //   ─────────────────   ─────────────────────────────────────     ─────────────
  //   "in_flight"         regen is running — page auto-refreshes    touch newer than artifact, < 5min old
  //   "saved_succeeded"   regen completed, brief is fresh            savedTouch=1 + artifact newer than touch
  //   "saved_failed"      regen never finished (5-min window expired) savedTouch=1 + touch newer than artifact > 5min
  //   "none"              normal page load                            otherwise
  //
  // Diff pills only render in "saved_succeeded" — never when regen is
  // still pending or failed, so the user is never told "look at the
  // pills" when no regeneration actually happened.
  let bannerState: "in_flight" | "saved_succeeded" | "saved_failed" | "none" =
    "none";
  if (regenInFlight) {
    bannerState = "in_flight";
  } else if (savedTouch) {
    const artTime = artifact.metadata?.generated_at
      ? new Date(artifact.metadata.generated_at).getTime()
      : 0;
    const touchTime = latestTouchAt ? new Date(latestTouchAt).getTime() : 0;
    bannerState = artTime > touchTime ? "saved_succeeded" : "saved_failed";
  }

  // Diff pills strictly gated on saved_succeeded — see truth table above.
  const decisionFrameChanged =
    bannerState === "saved_succeeded" &&
    previousArtifact !== null &&
    hasDecisionFrameChanged(artifact, previousArtifact);
  const walkInWithChanged =
    bannerState === "saved_succeeded" &&
    previousArtifact !== null &&
    hasWalkInWithChanged(artifact, previousArtifact);

  // Pull the body of whatever touch the rep just saved, so the banner
  // can echo it back instead of saying "Touch saved" generically.
  // The latest off_platform_touch in substrate IS the one just saved
  // (substrate.activities is sorted ascending; we pick the last).
  const latestTouchBody =
    bannerState !== "none"
      ? findLatestTouchBody(substrate)
      : null;

  // ── EmailComposer prep — check whether the current user has Gmail
  //    connected + resolve their own email. If no Clerk session (e.g. local
  //    dev with auth bypassed), gmailConnected stays false and the composer
  //    renders in disabled state with a Connect prompt.
  let gmailConnected = false;
  let repEmail: string | null = null;
  try {
    const { userId } = await auth();
    if (userId) {
      const status = await getGmailConnectionStatus(userId);
      gmailConnected = status.connected;
    }
    const user = await currentUser().catch(() => null);
    repEmail =
      user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      null;
  } catch {
    // Either no auth context, or supabase unreachable in this env. Keep
    // gmailConnected = false — composer degrades gracefully.
  }

  // Generate the substrate-driven follow-up draft. Pass the rep's own email
  // so the auto-picked recipient can never resolve to the rep themselves.
  const followupDraft = await generateFollowupDraft(substrate ?? {}, artifact, {
    rep_email: repEmail ?? undefined,
  });

  // ── Deck-send recipients — resolve buyer-side attendees ONLY. Never the
  //    rep's own inbox: internal_participants + the rep's Clerk email are
  //    excluded, and any stakeholder on a seller-side domain is dropped.
  //    Empty when no buyer email is known — SendDeckToRoom then starts blank.
  const repEmails = [
    repEmail,
    ...(substrate?.internal_participants ?? []).map((p) => p.email),
  ].filter((e): e is string => typeof e === "string" && e.length > 0);
  const deckRecipients = resolveDeckRecipients({
    stakeholders: substrate?.stakeholders,
    internalParticipantEmails: (substrate?.internal_participants ?? []).map(
      (p) => p.email,
    ),
    repEmail,
  });

  // ── SuggestedUpdates prep — derive CRM suggestions from Pass 4 artifact
  //    + substrate. Resolve provider name for the badge ("Salesforce" /
  //    "HubSpot") via lib/crm. If tenant_id can't be resolved (legacy
  //    file-loaded path, JSON fixtures), skip the panel — there's no
  //    real deal to write back to.
  const crmSuggestions = deriveCrmSuggestions(substrate ?? {}, artifact);
  const tenantIdForCrm = substrate?.opportunity?.tenant_id;
  const dealRefForCrm = substrate?.opportunity?.id;
  let providerNameForBadge = "Salesforce";
  if (tenantIdForCrm) {
    try {
      const pname = await getProviderName(tenantIdForCrm);
      providerNameForBadge = pname === "hubspot" ? "HubSpot" : "Salesforce";
    } catch {
      // Stay on the default badge if resolution fails.
    }
  }
  const showSuggestedUpdates =
    !!tenantIdForCrm && !!dealRefForCrm && crmSuggestions.length > 0;

  // ── SlackActivity prep — pass both candidate IDs (substrate UUID +
  //    external CRM id) so the panel can match audit rows written by
  //    either path. Only render when at least one is known.
  const slackCandidateIds = [
    substrate?.opportunity?.id,
    dealRefForCrm,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  const showSlackActivity = slackCandidateIds.length > 0;

  // ── ActionQueue prep — read queue items for this deal. Same candidate-id
  //    lookup as SlackActivity since both audit tables store opportunity_id
  //    as text (substrate UUID OR external CRM id, whichever the writer had).
  const queueCandidateIds = slackCandidateIds;
  const queueItems =
    queueCandidateIds.length > 0
      ? await listQueueForDeal(queueCandidateIds, { limit: 25 })
      : [];
  const showActionQueue = queueCandidateIds.length > 0;
  const pendingQueueCount = queueItems.filter(
    (i) => i.status === "queued" || i.status === "approved_pending",
  ).length;

  // (Action-bar chip prep removed — CockpitWorkspace renders its own
  //  tab bar derived directly from which panels are passed.)

  // Demo-tenant check for sim-mode banner. Read the tenant id off the
  // loaded substrate; falls back to false if anything's off so the
  // banner never accidentally shows for real tenants.
  const tenantIdForDemoCheck = substrate?.opportunity?.tenant_id ?? null;
  const isDemo = tenantIdForDemoCheck
    ? await isTenantDemo(tenantIdForDemoCheck)
    : false;

  return (
    <div className={s.page}>
      {/* Applies the user's stored theme (cream default / dark) on load.
          Without this on the main brief path, a saved dark choice reverts
          to cream on reload (the toggle still flips live in-session). */}
      <ThemeProvider />
      <SimModeBanner isDemo={isDemo} />
      {/* On-access freshness: if this deal's intelligence is stale, refresh it
          now (in the background) instead of a nightly cron paying to refresh
          every deal whether or not anyone opens it. */}
      {coachDealId && <IntelAutoRefresh dealId={coachDealId} />}
      {/* Behavioral instrumentation — server gates writes on is_demo,
          but we still scope the client recorder to demo tenants only
          so we don't ship extra JS to real-tenant pages. */}
      {isDemo && <CockpitInstrumentation />}
      {/* While regen is in flight we self-refresh until the new artifact
          lands. 8s cadence — fast enough to feel responsive, slow enough
          to not hammer the DB. The tag only renders when regenInFlight
          is true, so once regen completes, the next refresh stops the
          loop. */}
      {bannerState === "in_flight" && (
        <meta httpEquiv="refresh" content="8" />
      )}
      <div className={s.shell}>
        <BackLink href="/cockpit" label="All deals" />
        {bannerState === "in_flight" && (
          <RegeneratingBanner touchBody={latestTouchBody} />
        )}
        {bannerState === "saved_succeeded" && (
          <SavedTouchBanner regenStatus="ok" touchBody={latestTouchBody} />
        )}
        {bannerState === "saved_failed" && (
          <SavedTouchBanner regenStatus="failed" touchBody={latestTouchBody} />
        )}
        <TopBar
          artifact={artifact}
          substrate={substrate}
          filename={touchTarget}
          overLimit={overLimit}
        />
        <Header artifact={artifact} substrate={substrate} liteMode={liteMode} />
        {/* Command-center shell — chrome above stays full-width; the rest of
            the cockpit splits into a primary column (briefing content) and a
            right rail. The rail currently holds the deck controls; the
            stakeholder-engagement / commercial / timeline panels from the v5
            mockup land here in a later pass. Collapses to a single column
            under 1000px (see .cockpitGrid media query). */}
        {!liteMode && artifact.deliverables && (
          <DeliverablesChecklist deliverables={artifact.deliverables} />
        )}
        <div className={s.cockpitGrid}>
          <div className={s.cockpitMain}>
        {/* Last call — anchored at the top per Gianna's feedback (May 16
            2026): reps cognitively anchor on "what just happened" before
            "long-term thesis." Pinned here so the most-recent ground
            truth is the first substantive block on the page. */}
        {artifact.post_call_synthesis && (
          <PriorCallBlock artifact={artifact} substrate={substrate} />
        )}
        {/* Primary Decision Focus — the center-of-gravity block.
            Replaces the previous DecisionFrameHero / disclosure. Reads
            the curated focus payload off artifact.primary_decision_focus;
            if absent (legacy artifacts), falls back to the older
            disclosure so we never render a blank space. */}
        {/* Open loop from last brief — closes the action→outcome loop. Read-only:
            surfaces the prior brief's prescribed move so the rep confirms it
            happened before this call. Only renders when a prior brief exists
            (so pre-call / first-brief deals show nothing). */}
        {(() => {
          const priorMove = (
            previousArtifact as unknown as {
              primary_decision_focus?: { next_move?: string };
            } | null
          )?.primary_decision_focus?.next_move?.trim();
          if (!priorMove) return null;
          return (
            <div
              style={{
                margin: "0 22px 4px",
                padding: "12px 16px",
                background: "var(--ck-surface)",
                border: "0.5px solid var(--ck-rule)",
                borderLeft: "3px solid var(--ck-blue)",
                borderRadius: "0 8px 8px 0",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--ck-blue)",
                }}
              >
                — Open loop from last call
              </span>
              <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--ck-ink)" }}>
                Last time, the move was: <b>{priorMove}</b>
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ck-ink-3)" }}>
                Did it happen? Close it before this call.
              </p>
            </div>
          );
        })()}
        {(() => {
          const focus = (artifact as unknown as {
            primary_decision_focus?: PrimaryDecisionFocusData;
          }).primary_decision_focus;
          if (focus) {
            return (
              <PrimaryDecisionFocus
                focus={focus}
                generatedAt={artifact.metadata?.generated_at}
              />
            );
          }
          return (
            <DecisionFrameHero artifact={artifact} changed={decisionFrameChanged} />
          );
        })()}
        <HowYouWin
          howYouWin={artifact.how_you_win}
          whatCouldGoWrong={artifact.what_could_go_wrong}
          dealId={coachDealId}
        />
        {!liteMode ? (
          <CockpitWorkspace
            emailCount={undefined}
            crmCount={
              showSuggestedUpdates ? crmSuggestions.length : undefined
            }
            slackCount={
              showSlackActivity ? slackCandidateIds.length : undefined
            }
            overview={
              <>
                {showActionQueue && queueItems.length > 0 && (
                  <ActionQueue items={queueItems} />
                )}
                <PreMortemSection
                  artifact={artifact}
                  substrate={substrate}
                  liteMode={liteMode}
                />
                <WalkInWith
                  artifact={artifact}
                  changed={walkInWithChanged}
                />
                <CompetingPriorities artifact={artifact} />
                {!isSolo && (
                  <ManagerNote artifact={artifact} substrate={substrate} />
                )}
                <IntelligenceSection
                  substrate={substrate}
                  dealId={coachDealId}
                />
                <ContextDisclosure
                  artifact={artifact}
                  substrate={substrate}
                  defaultOpen={Boolean(savedTouch)}
                  isSolo={isSolo}
                />
              </>
            }
            email={
              <EmailComposer
                initialDraft={followupDraft}
                gmailConnected={gmailConnected}
              />
            }
            crm={
              showSuggestedUpdates ? (
                <SuggestedUpdates
                  suggestions={crmSuggestions}
                  tenantId={tenantIdForCrm!}
                  dealRef={dealRefForCrm!}
                  providerName={providerNameForBadge}
                />
              ) : undefined
            }
            slack={
              !isSolo && showSlackActivity ? (
                <SlackActivity candidateIds={slackCandidateIds} />
              ) : undefined
            }
            ask={
              coachDealId ? (
                <div
                  id="cockpit-ask"
                  className={s.askBarAnchor}
                >
                  <AskBar dealId={coachDealId} />
                </div>
              ) : undefined
            }
          />
        ) : (
          // Lite mode keeps its existing focused layout — pre-mortem +
          // sticky AskBar only. Bypasses the workspace tabs entirely.
          <>
            <PreMortemSection
              artifact={artifact}
              substrate={substrate}
              liteMode={liteMode}
            />
            {coachDealId && (
              <div
                id="cockpit-ask"
                className={s.askBarSticky}
              >
                <AskBar dealId={coachDealId} />
              </div>
            )}
          </>
        )}
        <BriefFeedback opportunityId={artifact.metadata.opportunity_id} />
          </div>
          <div className={s.rail}>
            {/* Customer-facing deck — mints/reuses the share_token and links the
                sanitized /deck/[token] view + .pptx export. Non-lite only; needs
                the stable deal UUID. */}
            {!liteMode && coachDealId && (
              <GenerateDeckButton
                dealId={coachDealId}
                gmailConnected={gmailConnected}
                recipients={deckRecipients}
                repEmails={repEmails}
              />
            )}
            <ArtifactVersionPicker
              versions={artifactVersions}
              currentArtifactId={currentArtifactId}
            />
            {!liteMode && substrate && (
              <StakeholderEngagement
                stakeholders={substrate.stakeholders ?? []}
                calls={substrate.calls ?? []}
                strategies={artifact.stakeholder_strategy ?? []}
                dealId={coachDealId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Diff helpers — surface "what changed" on top sections
// ────────────────────────────────────────────────────────────────────────────

function hasDecisionFrameChanged(
  current: PrepArtifact,
  prev: PrepArtifact,
): boolean {
  // Compare formed-thesis fields when both sides are formed; status flips
  // also count as a change. Indeterminate-only data lives in
  // indeterminate_reason which we don't surface above the fold.
  const cur = current.deal_thesis;
  const old = prev.deal_thesis;
  if (cur?.status !== old?.status) return true;
  const curFrame = cur?.status === "formed" ? cur.decision_frame : "";
  const oldFrame = old?.status === "formed" ? old.decision_frame : "";
  const curWhy = cur?.status === "formed" ? cur.why_this_matters : "";
  const oldWhy = old?.status === "formed" ? old.why_this_matters : "";
  return (
    curFrame !== oldFrame ||
    curWhy !== oldWhy ||
    current.top_line?.posture !== prev.top_line?.posture ||
    current.top_line?.text !== prev.top_line?.text
  );
}

function hasWalkInWithChanged(
  current: PrepArtifact,
  prev: PrepArtifact,
): boolean {
  const cur = current.talk_track;
  const old = prev.talk_track;
  if (cur?.opening_angle !== old?.opening_angle) return true;
  if (cur?.opening_rationale !== old?.opening_rationale) return true;
  const curTop2 = (cur?.key_questions ?? [])
    .slice(0, 2)
    .map((q) => q.question)
    .join("|");
  const oldTop2 = (old?.key_questions ?? [])
    .slice(0, 2)
    .map((q) => q.question)
    .join("|");
  return curTop2 !== oldTop2;
}

// ────────────────────────────────────────────────────────────────────────────
// Components
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pull a one-line echo of the touch the rep just saved. We trim and
 * truncate so the banner reads as a confirmation, not a transcript.
 * Returns null when no recent off-platform touch exists in substrate.
 */
function findLatestTouchBody(substrate: Substrate | null): string | null {
  const touches = (substrate?.activities ?? [])
    .filter((a) => a.type === "off_platform_touch")
    .sort((a, b) =>
      String(b.occurred_at ?? "").localeCompare(String(a.occurred_at ?? "")),
    );
  const body = touches[0]?.summary?.trim();
  if (!body) return null;
  // Trim to a single line; truncate at ~110 chars for the banner.
  const oneLine = body.replace(/\s+/g, " ");
  return oneLine.length > 110 ? `${oneLine.slice(0, 107)}…` : oneLine;
}

function RegeneratingBanner({ touchBody }: { touchBody: string | null }) {
  return (
    <div className={`${s.savedBanner} ${s.savedBannerProgress}`}>
      <span className={s.savedBannerSpinner} aria-hidden>
        ◐
      </span>
      <span className={s.savedBannerText}>
        {touchBody ? (
          <>
            Saved — <em className={s.savedBannerEcho}>{touchBody}</em>
            <span className={s.savedBannerSubtle}> · updating brief…</span>
          </>
        ) : (
          <>Saved · updating brief…</>
        )}
      </span>
    </div>
  );
}

function SavedTouchBanner({
  regenStatus,
  touchBody,
}: {
  regenStatus: "ok" | "failed" | null;
  touchBody: string | null;
}) {
  // Voice rule: confirm what was captured, don't explain the system.
  // The diff pills below speak for themselves — the banner doesn't
  // need to point at them.
  const echo = touchBody ? (
    <>
      Saved — <em className={s.savedBannerEcho}>{touchBody}</em>
    </>
  ) : (
    <>Saved.</>
  );

  if (regenStatus === "failed") {
    return (
      <div className={`${s.savedBanner} ${s.savedBannerWarn}`}>
        <span className={s.savedBannerCheckWarn}>!</span>
        <span className={s.savedBannerText}>
          {echo}
          <span className={s.savedBannerSubtle}>
            {" "}
            · brief didn&apos;t regenerate — refresh to retry
          </span>
        </span>
      </div>
    );
  }

  // regenStatus === "ok" or null — same compact confirmation.
  return (
    <div className={s.savedBanner}>
      <span className={s.savedBannerCheck}>✓</span>
      <span className={s.savedBannerText}>{echo}</span>
    </div>
  );
}

function TopBar({
  artifact,
  substrate,
  filename,
  overLimit,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
  filename: string;
  overLimit: boolean;
}) {
  const opportunityId = artifact.metadata.opportunity_id;
  // Quiet right-aligned utilities — LogTouch only. Removed:
  //   - Breadcrumb (rep already knows they're on a brief)
  //   - Brand chip (logo isn't needed inside an authenticated tool)
  //   - SearchBar (power-user feature; not first-impression material)
  // The brief should open with deal name + status, not with chrome.
  const composerStakeholders: ComposerStakeholder[] =
    substrate?.stakeholders?.map((sh) => ({
      id: sh.id,
      name: sh.name,
      title: sh.title,
      email: sh.email,
    })) ?? [];
  return (
    <div className={s.topbar}>
      <span className={s.topbarBrand}>
        <MallinMark size={20} surfaceColor="var(--ck-ink)" streamColor="var(--ck-blue-2)" />
        Mallín
      </span>
      <div className={s.topbarSpacer} />
      <UpgradeButton
        href={`/new?dealId=${opportunityId}`}
        label="+ Add next call"
        locked={overLimit}
        className={s.topbarAddCall}
      />
      <span style={{ marginRight: 12, display: "inline-flex" }}>
        <ThemeModeToggle />
      </span>
      <span style={{ marginRight: 12, display: "inline-flex" }}>
        <AppSignOut />
      </span>
      <DealOutcome opportunityId={opportunityId} />
      <LogTouchComposer
        filename={filename}
        stakeholders={composerStakeholders}
      />
    </div>
  );
}

const POSTURE_CLASS: Record<string, string> = {
  advancing: s.advancing,
  at_risk: s.atRisk,
  stalled: s.stalled,
  indeterminate: s.indeterminate,
};
const POSTURE_LABEL: Record<string, string> = {
  advancing: "Advancing",
  at_risk: "At risk",
  stalled: "Stalled",
  indeterminate: "Unclear",
};

function Header({
  artifact,
  substrate,
  liteMode = false,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
  liteMode?: boolean;
}) {
  const posture = artifact.top_line.posture;
  // Strip parenthetical (e.g. "(vs a competitor)") and pull the first
  // segment so the meta row stays terse.
  const rawStage = substrate?.opportunity?.stage_label ?? "";
  const stageLabel = rawStage.replace(/\s*\([^)]*\)\s*$/, "").split("/")[0]?.trim();
  const dealName =
    substrate?.opportunity?.name ?? artifact.metadata.opportunity_id;

  const amount = substrate?.opportunity?.amount;
  const currency = substrate?.opportunity?.currency ?? "USD";
  const closeDate = substrate?.opportunity?.close_date;

  if (liteMode) {
    // Lite cut: name + top_line + dot signals only. Drop the meta row
    // (posture/stage/amount/close date) — that's drill-down info, not
    // glance-before-call info.
    return (
      <div className={s.headerLite}>
        <h1 className={s.h1Lite}>{dealName}</h1>
        {artifact.top_line?.text && (
          <p className={s.stakesLite}>{artifact.top_line.text}</p>
        )}
        <DealSignals artifact={artifact} substrate={substrate} liteMode />
      </div>
    );
  }

  return (
    <div className={s.header}>
      <div className={s.metaRow}>
        <span
          className={`${s.posturePill} ${POSTURE_CLASS[posture] ?? s.indeterminate}`}
        >
          {POSTURE_LABEL[posture] ?? posture}
        </span>
        {stageLabel && <span className={s.metaItem}>{stageLabel}</span>}
        {typeof amount === "number" && amount > 0 && (
          <span className={s.metaItem}>
            {formatAmount(amount, currency)}
          </span>
        )}
        {closeDate && (
          <span className={s.metaItem}>
            Close · {formatCloseDate(closeDate)}
          </span>
        )}
        <BriefFreshness artifact={artifact} />
      </div>
      <h1 className={s.h1}>{dealName}</h1>
      {artifact.top_line?.text && (
        <p className={s.stakes}>{artifact.top_line.text}</p>
      )}
      <DealSignals artifact={artifact} substrate={substrate} />
    </div>
  );
}

/**
 * Deal-strength signals — three composite flags computed from substrate.
 *
 * Maps to the team's existing R/Y/G convention (used in SF next-steps).
 * Each flag answers a different deal-loss mode:
 *   - stakeholder: "do we know who decides + are they aligned?"
 *   - commercial:  "is the path to paper clear?"
 *   - momentum:    "is this thing actually moving?"
 *
 * Reason cited for each flag traces to a substrate signal — keeps the
 * "no claim without evidence" doctrine consistent with the rest of
 * the system. Read-only chips, no interaction.
 */
type FlagColor = "green" | "yellow" | "red" | "grey";
interface DealSignal {
  dimension: "stakeholder" | "commercial" | "momentum";
  color: FlagColor;
  reason: string;
}

const FLAG_LABEL: Record<DealSignal["dimension"], string> = {
  stakeholder: "Stakeholder",
  commercial: "Commercial",
  momentum: "Momentum",
};
const FLAG_CLASS: Record<FlagColor, string> = {
  green: s.flagGreen,
  yellow: s.flagYellow,
  red: s.flagRed,
  grey: s.flagGrey,
};

function DealSignals({
  artifact,
  substrate,
  liteMode = false,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
  liteMode?: boolean;
}) {
  const flags = computeDealSignals(artifact, substrate);
  if (liteMode) {
    // Dots + label only. Reason hidden behind native title tooltip
    // for hover/tap-to-reveal. No inline explanations competing for
    // eye attention.
    return (
      <div className={s.flagStripLite}>
        {flags.map((f) => (
          <span
            key={f.dimension}
            className={`${s.flagChipLite} ${FLAG_CLASS[f.color]}`}
            title={f.reason}
          >
            <span className={s.flagDot} aria-hidden />
            <span className={s.flagLabelLite}>{FLAG_LABEL[f.dimension]}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={s.flagStrip}>
      {flags.map((f) => (
        <div
          key={f.dimension}
          className={`${s.flagChip} ${FLAG_CLASS[f.color]}`}
          title={f.reason}
        >
          <span className={s.flagDot} aria-hidden />
          <span className={s.flagLabel}>{FLAG_LABEL[f.dimension]}</span>
          <span className={s.flagReason}>{f.reason}</span>
        </div>
      ))}
    </div>
  );
}

function computeDealSignals(
  artifact: PrepArtifact,
  substrate: Substrate | null,
): DealSignal[] {
  return [
    computeStakeholderSignal(artifact, substrate),
    computeCommercialSignal(artifact, substrate),
    computeMomentumSignal(substrate),
  ];
}

function computeStakeholderSignal(
  artifact: PrepArtifact,
  substrate: Substrate | null,
): DealSignal {
  // Voice rule for these strings: write them like a peer rep would say
  // them out loud. Names not "EB". "Where they stand" not
  // "disposition". Short, plain, concrete.
  const stakeholders = substrate?.stakeholders ?? [];
  if (stakeholders.length === 0) {
    return {
      dimension: "stakeholder",
      color: "grey",
      reason: "No one mapped yet",
    };
  }
  const strategy = artifact.stakeholder_strategy ?? [];
  const championStrategy = strategy.find(
    (s) => s.current_state?.disposition === "champion",
  );
  const championName =
    championStrategy?.stakeholder_name ??
    stakeholders.find((s) => s.committee_role === "champion")?.name;
  // Approval gate = economic_buyer or decision_maker (CRMs populate one
  // or the other; semantically the same lever).
  const eb = stakeholders.find(
    (s) =>
      s.committee_role === "economic_buyer" ||
      s.committee_role === "decision_maker",
  );
  // Match strategy by stakeholder_id first (works when both sides use the
  // same id-space); fall back to name match. DB-loaded substrate uses
  // UUIDs while artifact strategy can use slug ids — name match closes
  // that gap so the signal actually reflects the disposition we have.
  const ebStrategy = eb
    ? (strategy.find((s) => s.stakeholder_id === eb.id) ??
       strategy.find(
         (s) =>
           s.stakeholder_name &&
           eb.name &&
           s.stakeholder_name.toLowerCase() === eb.name.toLowerCase(),
       ))
    : undefined;
  const ebDispo = ebStrategy?.current_state?.disposition;
  const ebFirstName = eb?.name?.split(/\s+/)[0];

  if (!championName) {
    return {
      dimension: "stakeholder",
      color: "red",
      reason: "No one selling internally",
    };
  }
  if (!eb) {
    return {
      dimension: "stakeholder",
      color: "yellow",
      reason: `${championName.split(/\s+/)[0]} championing — no one with sign-off mapped`,
    };
  }
  if (ebDispo === "blocker") {
    return {
      dimension: "stakeholder",
      color: "red",
      reason: `${ebFirstName} pushing back`,
    };
  }
  if (ebDispo === "skeptic") {
    return {
      dimension: "stakeholder",
      color: "red",
      reason: `${ebFirstName} not bought in`,
    };
  }
  if (ebDispo === "champion" || ebDispo === "supporter") {
    return {
      dimension: "stakeholder",
      color: "green",
      reason: `${championName.split(/\s+/)[0]} and ${ebFirstName} are both bought in`,
    };
  }
  // Differentiate "EB never engaged" (red — bigger problem) from
  // "EB has engaged but stance unclear" (yellow — needs read).
  // Proxy: if no email is captured for the EB, the team has never had
  // a two-way thread with them — they haven't engaged. The call table
  // doesn't carry attendee_emails so we can't check call attendance
  // directly; email-presence is the cleanest available signal.
  const ebHasEmail = Boolean(eb?.email && eb.email.trim());
  if (!ebHasEmail) {
    return {
      dimension: "stakeholder",
      color: "red",
      reason: `Haven't connected with ${ebFirstName} yet — no read on stance`,
    };
  }
  return {
    dimension: "stakeholder",
    color: "yellow",
    reason: `Haven't confirmed where ${ebFirstName} stands`,
  };
}

function computeCommercialSignal(
  artifact: PrepArtifact,
  substrate: Substrate | null,
): DealSignal {
  const amount = substrate?.opportunity?.amount;
  const closeDate = substrate?.opportunity?.close_date;
  const hasAmount = typeof amount === "number" && amount > 0;
  const hasClose = Boolean(closeDate);

  // Detect active competitive comparison from the deal narrative.
  // Vendor-agnostic and vertical-agnostic: we scan the brief text for
  // generic competition language the pipeline surfaced — no hardcoded
  // competitor list and no assumption about the seller's category.
  const narrativeBlob = [
    artifact.top_line?.text ?? "",
    ...(artifact.critical_risks ?? []).map(
      (r) => `${r.title ?? ""} ${r.description ?? ""}`,
    ),
    ...(artifact.stakeholder_strategy ?? []).map(
      (s) => `${s.call_strategy ?? ""} ${(s.do_list ?? []).join(" ")}`,
    ),
  ]
    .join(" ")
    .toLowerCase();
  const COMPETITION_SIGNALS = [
    "competitor",
    "competitive",
    "competing",
    "incumbent",
    "bake-off",
    "bake off",
    "displace",
    "alternative vendor",
    "other vendor",
    "evaluating other",
    " vs ",
    "vs.",
  ];
  const matchedCompetitor = COMPETITION_SIGNALS.some((sig) =>
    narrativeBlob.includes(sig),
  );

  // Critical risks tagged commercial?
  const commercialRiskTitles = (artifact.critical_risks ?? [])
    .map((r) => `${r.title ?? ""} ${r.description ?? ""}`.toLowerCase())
    .filter(
      (t) =>
        t.includes("commercial") ||
        t.includes("pricing") ||
        t.includes("redline") ||
        t.includes("contract") ||
        t.includes("budget"),
    );
  const hasCommercialRisk = commercialRiskTitles.length > 0;

  if (!hasAmount && !hasClose) {
    return {
      dimension: "commercial",
      color: "grey",
      reason: "No price or close date yet",
    };
  }
  if (matchedCompetitor) {
    return {
      dimension: "commercial",
      color: "yellow",
      reason: `Active competitive comparison`,
    };
  }
  if (hasAmount && hasClose && !hasCommercialRisk) {
    return {
      dimension: "commercial",
      color: "green",
      reason: `${formatAmount(
        amount as number,
        substrate?.opportunity?.currency ?? "USD",
      )} · closing ${formatCloseDate(closeDate as string)}`,
    };
  }
  if (hasCommercialRisk) {
    return {
      dimension: "commercial",
      color: "yellow",
      reason: "Commercial terms still open",
    };
  }
  return {
    dimension: "commercial",
    color: "yellow",
    reason: hasAmount ? "No close date set" : "No price quoted yet",
  };
}

function computeMomentumSignal(substrate: Substrate | null): DealSignal {
  // opportunities.last_activity_at is a denormalized cache and can drift
  // stale (touches log to the touches table; this column isn't auto-
  // bumped). So we compute the real "most recent activity" from the
  // merged activities set (which includes touches via load-deal.ts) and
  // take the latest of the two.
  const cached = substrate?.opportunity?.last_activity_at
    ? new Date(substrate.opportunity.last_activity_at).getTime()
    : 0;
  const acts = substrate?.activities ?? [];
  const fromActs = acts.reduce((max, a) => {
    if (!a.occurred_at) return max;
    const t = new Date(a.occurred_at).getTime();
    return t > max ? t : max;
  }, 0);
  const lastActivityMs = Math.max(cached, fromActs);
  if (lastActivityMs === 0) {
    return {
      dimension: "momentum",
      color: "grey",
      reason: "Nothing logged yet",
    };
  }
  const ageMs = Date.now() - lastActivityMs;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const recent14 = acts.filter((a) => {
    if (!a.occurred_at) return false;
    return (
      Date.now() - new Date(a.occurred_at).getTime() <
      14 * 24 * 60 * 60 * 1000
    );
  }).length;

  if (days <= 7 && recent14 >= 3) {
    return {
      dimension: "momentum",
      color: "green",
      reason: `${recent14} touches in 2 weeks`,
    };
  }
  if (days <= 7) {
    return {
      dimension: "momentum",
      color: "green",
      reason:
        days === 0
          ? "Talked today"
          : days === 1
            ? "Talked yesterday"
            : `Talked ${days}d ago`,
    };
  }
  if (days <= 21) {
    return {
      dimension: "momentum",
      color: "yellow",
      reason: `${days}d since last touch`,
    };
  }
  return {
    dimension: "momentum",
    color: "red",
    reason: `Going cold — ${days}d since last touch`,
  };
}

function formatAmount(amount: number, currency: string): string {
  // Compact format — $185K reads better than $185,000 in the meta-row.
  // Falls back to currency-symbol if Intl can't resolve the code.
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

function formatCloseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Freshness chip — answers "can I trust this?" at a glance.
 *
 * Three visual states:
 *   < 5 min          → "Updated X min ago" + green dot ("current")
 *   5-60 min         → "Updated X min ago" + neutral dot
 *   ≥ 60 min         → "Last updated: <date, time>" + neutral dot
 *
 * Server-rendered (computed at request time). The page is dynamic so a
 * refresh always recomputes; for active sessions where the user keeps
 * the page open without saving, the time will skew — acceptable for
 * MVP since save flows trigger a full reload via savedTouch=1.
 */
function BriefFreshness({ artifact }: { artifact: PrepArtifact }) {
  const generatedAt = artifact.metadata?.generated_at;
  if (!generatedAt) return null;

  // Voice rule (same as the flag chips): write like a peer rep talks
  // about time. "This morning" / "yesterday" / "last week" instead of
  // formal timestamps. The rep should never have to parse "May 6,
  // 2:14 PM" to know if the brief is current.
  const now = new Date();
  const then = new Date(generatedAt);
  const ageMs = now.getTime() - then.getTime();
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  const isFresh = minutes < 5;
  let label: string;

  if (minutes < 1) {
    label = "Updated just now";
  } else if (minutes < 60) {
    label = `Updated ${minutes} min ago`;
  } else if (sameCalendarDay(now, then)) {
    // Same day, more than an hour back — surface as a phase of the day.
    const h = then.getHours();
    if (h < 12) label = "Updated this morning";
    else if (h < 17) label = "Updated earlier today";
    else label = "Updated this evening";
  } else if (isYesterday(now, then)) {
    label = "Updated yesterday";
  } else if (days < 7) {
    label = `Updated ${days} days ago`;
  } else if (days < 14) {
    label = "Updated last week";
  } else {
    // Older — clean date, no time of day.
    const month = then.toLocaleString("en-US", { month: "short" });
    const day = then.getDate();
    const sameYear = then.getFullYear() === now.getFullYear();
    label = sameYear
      ? `Updated ${month} ${day}`
      : `Updated ${month} ${day}, ${then.getFullYear()}`;
  }

  return (
    <span
      className={`${s.freshness} ${isFresh ? s.freshnessFresh : ""}`}
      title={`Brief regenerated at ${generatedAt}`}
    >
      <span className={s.freshnessDot} aria-hidden />
      {label}
    </span>
  );
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(now: Date, then: Date): boolean {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return sameCalendarDay(y, then);
}

// ── Decision Frame HERO ────────────────────────────────────────────────────

/**
 * DecisionFrameDisclosure — quiet expandable under the risk pills.
 *
 * Replaces the previous full-width "WHAT DECIDES THIS DEAL" hero block,
 * which duplicated the top-of-fold narrative + risk pills. The decision
 * frame is the rationale BEHIND the risks — it belongs as a one-click
 * expand for readers who want depth, not a hero for everyone.
 *
 * Collapsed state is a single quiet line: "Why Mallín reads this as at
 * risk →". Expanded reveals the decision frame + why_this_matters.
 * Posture-tone class still applies inside.
 */
function DecisionFrameHero({
  artifact,
  changed = false,
}: {
  artifact: PrepArtifact;
  changed?: boolean;
}) {
  const thesis = artifact.deal_thesis;
  if (!thesis) return null;
  const posture = artifact.top_line?.posture;
  const postureLabel =
    posture === "advancing"
      ? "advancing"
      : posture === "at_risk"
        ? "at risk"
        : posture === "stalled"
          ? "stalled"
          : "unclear";

  const isFormed = thesis.status === "formed";
  const frameText = isFormed
    ? thesis.decision_frame
    : "Indeterminate — frame not yet formable from substrate";
  const whyText = isFormed
    ? thesis.why_this_matters
    : thesis.indeterminate_reason;

  return (
    <details className={s.decisionDisclosure}>
      <summary className={s.decisionSummary}>
        <span className={s.decisionSummaryText}>
          Why Mallín reads this as {postureLabel}
        </span>
        {changed && <UpdatedPill />}
        <span className={s.decisionChevron} aria-hidden="true">
          →
        </span>
      </summary>
      <div className={s.decisionBody}>
        <div className={s.decisionFrame}>{frameText}</div>
        {whyText && <div className={s.decisionWhy}>{whyText}</div>}
      </div>
    </details>
  );
}

function UpdatedPill() {
  return <span className={s.updatedPill}>● updated</span>;
}

/**
 * Pre-mortem section — situational anticipation.
 *
 * Renders the model-emitted (and post-filtered) pre_mortem_paths under
 * the Decision Frame. Strict UI per spec:
 *   - max 3 rows
 *   - each row = 1-line failure path + 1-line "if you do nothing" + 1
 *     bolded forcing move
 *   - no expansion, no interaction, no coach crossover
 *
 * Section omits entirely when the artifact has zero paths — keeps the
 * page from showing a hollow "what could go wrong" header on deals
 * where the model judged no path passed the contract.
 */
/**
 * Account intelligence — collapsed by default.
 *
 * The strategic_priority field is INTENTIONALLY not rendered as its own
 * block here. Pass 4 already weaves it into top_line.text (substrate
 * read), so duplicating it as a section creates redundant noise.
 * "Intelligence should change the sentence, not add a section."
 *
 * What's visible by default: a single quiet line with the signal count,
 * last-swept timestamp, and Refresh button. Findings are hidden inside
 * a native <details> expand for "See sources" — available on demand
 * but doesn't compete with the substantive layers (paths, talk track,
 * etc.).
 *
 * The intel pipeline is correct (public_signals → loadDealFromDB →
 * substrate.account → Pass 4). What changed here is render volume.
 */
function IntelligenceSection({
  substrate,
  dealId,
}: {
  substrate: Substrate | null;
  dealId: string | null;
}) {
  const signals = substrate?.account?.public_signals ?? [];
  const strategicPriority = substrate?.account?.strategic_priority?.trim();
  const hasIntel = signals.length > 0 || Boolean(strategicPriority);

  if (!hasIntel) {
    if (!dealId) return null;
    return (
      <div className={s.intelLine}>
        <span className={s.intelLineEmpty}>no external context yet</span>
        <IntelligenceRefresh dealId={dealId} />
      </div>
    );
  }

  const lastSweptAt = signals[0]?.observed_at;
  const sourceCount = signals.length;

  return (
    <div className={s.intelLine}>
      <span className={s.intelLineMeta}>
        {sourceCount} {sourceCount === 1 ? "signal" : "signals"}
        {lastSweptAt && ` · updated ${formatTouchTime(lastSweptAt)}`}
      </span>
      {sourceCount > 0 && (
        <details className={s.intelDetails}>
          <summary className={s.intelDetailsSummary}>see sources</summary>
          <div className={s.intelList}>
            {signals.map((sig, i) => (
              <IntelligenceFinding key={`${sig.observed_at}-${i}`} signal={sig} />
            ))}
          </div>
        </details>
      )}
      {dealId && <IntelligenceRefresh dealId={dealId} />}
    </div>
  );
}

function IntelligenceFinding({
  signal,
}: {
  signal: NonNullable<NonNullable<Substrate["account"]>["public_signals"]>[number];
}) {
  // public_signals.summary is encoded by the runner as:
  //   <summary>
  //
  //   Implication: <implication>
  // Split on that marker for cleaner rendering.
  const text = signal.summary ?? "";
  const implMatch = text.match(/Implication:\s*([\s\S]*?)(?:\n\n|$)/);
  const summary = text.split("\n\n")[0] ?? text;
  const implication = implMatch?.[1]?.trim();

  return (
    <div className={s.intelFinding}>
      <p className={s.intelSummary}>{summary}</p>
      {implication && (
        <p className={s.intelImplication}>
          <span className={s.intelImplLabel}>Why it matters:</span> {implication}
        </p>
      )}
      {signal.source_url && (
        <div className={s.intelMeta}>
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={s.intelSource}
          >
            {signal.source} ↗
          </a>
        </div>
      )}
    </div>
  );
}

function formatTouchTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Manager note / Pricing play — RVP-level coaching surface. Two modes:
 *
 *   1. Manual override: `artifact.manager_note` set on the artifact wins.
 *   2. Auto-fire: when a pricing-related pre-mortem path exists AND no
 *      manual note is set, surface the exec-connect script — a rep-voice
 *      ask the rep can deliver verbatim to the champion. Pulls RVP name
 *      from substrate.internal_participants, signer name from
 *      stakeholders (decision_maker / economic_buyer).
 *
 * The exec-connect ask is a load-bearing pricing move: getting RVP and
 * signer on the call together changes the negotiation altitude. It
 * shouldn't depend on the manager remembering to add it per deal.
 */
const PRICING_DRIVERS = new Set([
  "pricing",
  "discount_approval",
  "redline",
  "contract",
  "contract_terms",
  "negotiation",
  "concession",
  "best_and_final",
  "approval",
]);

function ManagerNote({
  artifact,
  substrate,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
}) {
  const manualNote = artifact.manager_note?.trim();

  // Auto-fire path: pricing on the agenda?
  const hasPricingPath = (artifact.pre_mortem_paths ?? []).some((p) =>
    PRICING_DRIVERS.has(p.primary_driver),
  );

  let note: string | null = manualNote || null;
  let label = "Manager note";

  if (!note && hasPricingPath) {
    // Find the signer (decision_maker or economic_buyer).
    const signer = (substrate?.stakeholders ?? []).find(
      (s) =>
        s.committee_role === "decision_maker" ||
        s.committee_role === "economic_buyer",
    );

    // Suppression: if the signer is already supporter or champion in the
    // strategy, the exec-connect ask is noise — they're already in. The
    // Pricing play exists to *bring an unaligned signer into alignment*,
    // not to nag once they've approved. Match strategy by id OR name to
    // bridge the UUID/slug id-space gap.
    const signerStrategy = signer
      ? ((artifact.stakeholder_strategy ?? []).find(
          (s) => s.stakeholder_id === signer.id,
        ) ??
        (artifact.stakeholder_strategy ?? []).find(
          (s) =>
            s.stakeholder_name &&
            signer.name &&
            s.stakeholder_name.toLowerCase() === signer.name.toLowerCase(),
        ))
      : undefined;
    const signerDispo = signerStrategy?.current_state?.disposition;
    const signerAlreadyIn =
      signerDispo === "supporter" || signerDispo === "champion";

    if (signerAlreadyIn) {
      // Skip auto-fire. Manager can still set manager_note manually if
      // they want a different exec-level play for this stage.
    } else {
      // RVP: prefer internal_participant whose role/title includes RVP/VP.
      const internalParticipants = substrate?.internal_participants ?? [];
      const rvp =
        internalParticipants.find((p) =>
          /RVP|Regional Vice President/i.test(
            `${p.title ?? ""} ${p.role ?? ""}`,
          ),
        ) ??
        internalParticipants.find((p) =>
          /\bVP\b|Vice President/i.test(`${p.title ?? ""} ${p.role ?? ""}`),
        );
      const rvpName = rvp?.name?.trim();
      const signerFirstName = signer?.name?.split(/\s+/)[0];
      if (signerFirstName) {
        const vpPhrase = rvpName ? `my VP ${rvpName}` : "my VP";
        note = `It is always my recommendation to get ${vpPhrase} and your signer on a call. Would ${signerFirstName} be open to that, regarding helping you get the best deal possible?`;
        label = "Pricing play";
      }
    }
  }

  if (!note) return null;
  return (
    <div className={s.managerNoteWrap}>
      <span className={s.managerNoteLabel}>{label}</span>
      <p className={s.managerNoteBody}>{note}</p>
    </div>
  );
}

/**
 * Competing priorities — the buyer-side commercial reality the rep is up
 * against. Sources `commercial_reality.situation_summary` (free-prose
 * context that captures stack rank, what's competing for the signer's
 * attention, and the unlock structure if any).
 *
 * Placed between Decision Frame and Pre-Mortem so the rep sees what
 * they're competing with before reading what could break.
 *
 * Section omits when the field is missing — this is opt-in until Pass 4
 * starts emitting it consistently.
 */
function CompetingPriorities({ artifact }: { artifact: PrepArtifact }) {
  const summary = artifact.commercial_reality?.situation_summary?.trim();
  if (!summary) return null;
  return (
    <div className={s.competingWrap}>
      <div className={s.competingHead}>
        <span className={s.competingLabel}>Competing priorities</span>
      </div>
      <p className={s.competingBody}>{summary}</p>
    </div>
  );
}

function PreMortemSection({
  artifact,
  substrate,
  liteMode = false,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
  liteMode?: boolean;
}) {
  const allPaths = artifact.pre_mortem_paths ?? [];
  // Lite cut: ONLY the first (highest-priority) path. Brendan's spec.
  const paths = liteMode ? allPaths.slice(0, 1) : allPaths;
  if (paths.length === 0) return null;

  // Best-effort label of the upcoming event for the section header.
  // We don't have a structured "next event" field on the substrate yet,
  // so we use close_date as the cleanest signal — falls back to a
  // generic header when not available. (When SF integration ships,
  // this becomes a real "next milestone" lookup.)
  const closeDate = substrate?.opportunity?.close_date;
  const eventLabel = closeDate
    ? `before ${formatCloseDate(closeDate)}`
    : "before the next event";

  return (
    <div className={s.preMortemWrap}>
      <div className={s.preMortemHint}>{eventLabel}</div>
      <div className={s.preMortemList}>
        {paths.map((p, i) => (
          <div key={p.primary_driver + i} className={s.preMortemRow}>
            <div className={s.preMortemActor}>{p.actor_name}</div>
            <p className={s.preMortemPath}>{p.failure_path}</p>
            <p className={s.preMortemMove}>{p.forcing_move}</p>
            {p.coaching_prompt && (
              <p className={s.preMortemCoach}>{p.coaching_prompt}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WalkInWith({
  artifact,
  changed = false,
}: {
  artifact: PrepArtifact;
  changed?: boolean;
}) {
  const tt = artifact.talk_track;
  const primary = tt?.opening_angle?.trim();
  const because = tt?.opening_rationale?.trim();
  const supporting = (tt?.key_questions ?? [])
    .slice(0, 2)
    .map((q) => q.question?.trim())
    .filter((q): q is string => Boolean(q));

  if (!primary && supporting.length === 0) return null;

  return (
    <div className={s.walkWrap}>
      <div className={s.walk}>
        <div className={s.walkLabel}>
          ◆ Walk in with this
          {changed && <UpdatedPill />}
        </div>

        {/* Primary — the ONE thing */}
        {primary && (
          <div className={s.walkPrimary}>
            <span className={s.walkPrimaryN}>01</span>
            <div>
              <div className={s.walkPrimaryBody}>{primary}</div>
              {because && (
                <div className={s.walkBecause}>
                  <span className={s.walkBecauseLabel}>Because</span>
                  {because}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Supporting — demoted */}
        {supporting.length > 0 && (
          <>
            <div className={s.walkDivider} />
            <div className={s.walkSecondaryLabel}>
              If there&apos;s time
            </div>
            <div className={s.walkSecondary}>
              {supporting.map((q, i) => (
                <div key={i} className={s.walkSecondaryItem}>
                  <span className={s.walkSecondaryN}>
                    {String(i + 2).padStart(2, "0")}
                  </span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContextDisclosure({
  artifact,
  substrate,
  defaultOpen = false,
  isSolo = false,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
  defaultOpen?: boolean;
  isSolo?: boolean;
}) {
  const offPlatformTouches = (substrate?.activities ?? [])
    .filter((a) => a.type === "off_platform_touch")
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const sections: string[] = [];
  if (offPlatformTouches.length > 0)
    sections.push(
      `${offPlatformTouches.length} off-platform ${offPlatformTouches.length === 1 ? "touch" : "touches"}`,
    );
  // "last call" is rendered above the Primary Decision Focus now; no
  // longer listed in the context disclosure (would be duplicate).
  if ((artifact.talk_track?.key_questions ?? []).length > 0)
    sections.push("questions");
  if ((artifact.stakeholder_strategy ?? []).length > 0)
    sections.push("stakeholders");
  if (substrate?.account) sections.push("company");
  if ((artifact.critical_risks ?? []).length > 0) sections.push("risks");
  const hint = sections.length > 0 ? sections.join(" · ") : null;

  return (
    <div className={s.contextWrap}>
      <details className={s.contextOpen} open={defaultOpen}>
        <summary className={s.contextSummary}>
          <span className={s.contextLabel}>Show context</span>
          {hint && <span className={s.contextHint}>{hint}</span>}
          <span className={s.contextChevron}>›</span>
        </summary>
        <div className={s.contextBody}>
          {offPlatformTouches.length > 0 && (
            <OffPlatformTouches
              touches={offPlatformTouches}
              substrate={substrate}
            />
          )}
          {/* PriorCallBlock moved to the top of the page (above Primary
              Decision Focus) per Gianna's feedback May 16 2026. */}
          <QuestionsRanked artifact={artifact} />
          <WhosInTheRoom artifact={artifact} substrate={substrate} />
          {substrate?.account && <CompanyContext substrate={substrate} />}
          <CriticalRisksBlock artifact={artifact} isSolo={isSolo} />
          <NotesBlock />
        </div>
      </details>
    </div>
  );
}

function SyncBadge({
  sync,
}: {
  sync?: NonNullable<Substrate["activities"]>[number]["crm_sync"];
}) {
  if (!sync || sync.status === "not_configured") {
    return (
      <span
        className={`${s.syncBadge} ${s.syncBadgeIdle}`}
        title="No CRM webhook configured. Set CRM_WEBHOOK_URL in .env.local to enable bi-directional sync."
      >
        rep log only
      </span>
    );
  }
  if (sync.status === "synced") {
    return (
      <span
        className={`${s.syncBadge} ${s.syncBadgeOk}`}
        title={`Synced to CRM at ${sync.succeeded_at ?? "(unknown)"}`}
      >
        ✓ synced to CRM
      </span>
    );
  }
  if (sync.status === "failed") {
    return (
      <span
        className={`${s.syncBadge} ${s.syncBadgeFail}`}
        title={sync.error ?? "Webhook failed"}
      >
        ⚠ CRM sync failed
      </span>
    );
  }
  return (
    <span className={`${s.syncBadge} ${s.syncBadgePending}`}>pending</span>
  );
}

function OffPlatformTouches({
  touches,
  substrate,
}: {
  touches: NonNullable<Substrate["activities"]>;
  substrate: Substrate | null;
}) {
  return (
    <div className={s.block} id="offplatform">
      <div className={s.blockHead}>
        <div className={s.blockTitle}>Off-platform touches</div>
        <div className={s.blockMeta}>
          {touches.length} {touches.length === 1 ? "log" : "logs"} · rep-entered
        </div>
      </div>
      <div className={s.touchList}>
        {touches.map((t) => {
          const stakeholder = t.with_stakeholder_id
            ? substrate?.stakeholders?.find(
                (x) => x.id === t.with_stakeholder_id,
              )
            : null;
          const when = new Date(t.occurred_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
          return (
            <div key={t.id} className={s.touch}>
              <div className={s.touchMeta}>
                {stakeholder ? (
                  <span className={s.touchWith}>{stakeholder.name}</span>
                ) : (
                  <span className={s.touchWithMissing}>
                    no stakeholder selected
                  </span>
                )}
                <span className={s.touchDot}>·</span>
                <span className={s.touchWhen}>{when}</span>
                <SyncBadge sync={t.crm_sync} />
              </div>
              <div className={s.touchBody}>{t.summary}</div>
            </div>
          );
        })}
      </div>
      <div className={s.touchHint}>
        Logged touches become substrate on the next Pass 4 regeneration —
        they will fold into the brief automatically.
      </div>
    </div>
  );
}

function PriorCallBlock({
  artifact,
  substrate,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
}) {
  const syn = artifact.post_call_synthesis;
  if (!syn) return null;
  const call = substrate?.calls?.find((c) => c.id === syn.last_interaction_id);
  let meta: string | undefined;
  if (call) {
    const date = call.started_at
      ? new Date(call.started_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
    const dur =
      call.duration_seconds != null
        ? `${Math.round(call.duration_seconds / 60)} min`
        : null;
    meta = [date, dur, "gong"].filter(Boolean).join(" · ");
  }
  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>What was said last time</div>
        {meta && <div className={s.blockMeta}>{meta}</div>}
      </div>
      <div className={s.priorAnchor}>{syn.last_interaction_label}</div>
      <div className={s.twoCol}>
        <div>
          <div className={`${s.colHead} ${s.surfaced}`}>What surfaced</div>
          <div className={s.colList}>
            {syn.what_surfaced.map((b, i) => (
              <div key={i} className={`${s.colItem} ${s.surfaced}`}>
                {b}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className={`${s.colHead} ${s.thinkThrough}`}>
            To think through internally
          </div>
          <div className={s.colList}>
            {syn.to_think_through.map((b, i) => (
              <div key={i} className={`${s.colItem} ${s.thinkThrough}`}>
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const QUESTION_TAGS: Array<{ kw: RegExp; tag: string; cls: string }> = [
  {
    kw: /\b(metric|hours|cost|headcount|delay|board report|number|how (much|many|long))\b/i,
    tag: "METRICS",
    cls: "metrics",
  },
  {
    kw: /\b(sign|signer|approve|approval|economic buyer|EB|CFO|board\b|sign[- ]off)\b/i,
    tag: "EB",
    cls: "eb",
  },
  {
    kw: /\b(competitor|competition|alternat|other (option|vendor)|evaluat|why us)\b/i,
    tag: "COMPETITION",
    cls: "competition",
  },
  {
    kw: /\b(timeline|when|by (when|date)|implementation date|kickoff|go[- ]live|target date)\b/i,
    tag: "TIMING",
    cls: "timing",
  },
  {
    kw: /\b(pain|problem|frustration|broken|stuck|risk|challenge)\b/i,
    tag: "PAIN",
    cls: "pain",
  },
];

const QUESTION_TAG_COLOR: Record<string, string> = {
  METRICS: "var(--ck-warn)",
  EB: "var(--ck-crit)",
  COMPETITION: "var(--ck-warn)",
  TIMING: "var(--ck-ink-3)",
  PAIN: "var(--ck-ink-3)",
  DISCOVERY: "var(--ck-blue-2)",
};

function classifyQuestion(q: string): string {
  for (const { kw, tag } of QUESTION_TAGS) {
    if (kw.test(q)) return tag;
  }
  return "DISCOVERY";
}

function QuestionsRanked({ artifact }: { artifact: PrepArtifact }) {
  const qs = artifact.talk_track?.key_questions ?? [];
  if (qs.length === 0) return null;
  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>Questions ranked</div>
        <div className={s.blockMeta}>priority order</div>
      </div>
      <div className={s.qList}>
        {qs.slice(0, 5).map((q, i) => {
          const tag = classifyQuestion(q.question);
          return (
            <div key={i} className={s.qRow}>
              <span className={s.qN}>{String(i + 1).padStart(2, "0")}</span>
              <span className={s.qText}>{q.question}</span>
              <span
                className={s.qTag}
                style={{ color: QUESTION_TAG_COLOR[tag] }}
              >
                {tag}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ROLE_STYLES: Record<
  string,
  {
    tag: string;
    color: string;
    avatarBg: string;
    avatarBorder: string;
    avatarText: string;
  }
> = {
  champion: {
    tag: "CHAMPION",
    color: "var(--ck-good)",
    avatarBg: "var(--ck-good-tint)",
    avatarBorder: "var(--ck-good)",
    avatarText: "var(--ck-good)",
  },
  economic_buyer: {
    tag: "ECON BUYER",
    color: "var(--ck-crit)",
    avatarBg: "var(--ck-crit-tint)",
    avatarBorder: "var(--ck-crit)",
    avatarText: "var(--ck-crit)",
  },
  technical_evaluator: {
    tag: "TECH EVAL",
    color: "var(--ck-blue-2)",
    avatarBg: "var(--ck-blue-tint)",
    avatarBorder: "var(--ck-blue-2)",
    avatarText: "var(--ck-blue-2)",
  },
  user: {
    tag: "USER",
    color: "var(--ck-ink-3)",
    avatarBg: "var(--ck-surface-2)",
    avatarBorder: "var(--ck-rule-2)",
    avatarText: "var(--ck-ink)",
  },
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Opens LinkedIn people search in a new tab with name + company as the
 * query. Lightweight bridge — no API, no scraping — just hands the rep
 * the doorway so they can triangulate directly. Matches the manual
 * playbook in stakeholder_triangulation.md (current default until a real
 * Apollo/RocketReach fetcher is build-gated).
 */
function LinkedInSearchLink({
  name,
  company,
}: {
  name: string;
  company: string | null;
}) {
  const query = company ? `${name} ${company}` : name;
  const href = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={s.linkedInBtn}
      title={`Search LinkedIn for ${query}`}
      aria-label={`Search LinkedIn for ${name}`}
    >
      in
    </a>
  );
}

function WhosInTheRoom({
  artifact,
  substrate,
}: {
  artifact: PrepArtifact;
  substrate: Substrate | null;
}) {
  const strategies = artifact.stakeholder_strategy ?? [];
  if (strategies.length === 0) return null;
  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>Who&apos;s in the room</div>
        <div className={s.blockMeta}>
          {strategies.length}{" "}
          {strategies.length === 1 ? "stakeholder" : "stakeholders"}
        </div>
      </div>
      <div className={s.sList}>
        {strategies.map((stk, i) => {
          const sub = substrate?.stakeholders?.find(
            (x) => x.id === stk.stakeholder_id,
          );
          const role =
            sub?.committee_role ?? stk.current_state?.disposition ?? "user";
          const style = ROLE_STYLES[role] ?? ROLE_STYLES.user;
          return (
            <div key={i} className={s.sRow}>
              <div
                className={s.avatar}
                style={{
                  background: style.avatarBg,
                  border: `0.5px solid ${style.avatarBorder}`,
                  color: style.avatarText,
                }}
              >
                {initials(stk.stakeholder_name)}
              </div>
              <div className={s.sInfo}>
                <div>
                  <span className={s.sName}>{stk.stakeholder_name}</span>
                  <LinkedInSearchLink
                    name={stk.stakeholder_name}
                    company={
                      sub?.company ?? substrate?.account?.name ?? null
                    }
                  />
                  {stk.role && (
                    <span className={s.sRole}> · {stk.role}</span>
                  )}
                </div>
                <div className={s.sStrategy}>{stk.call_strategy}</div>
              </div>
              <span className={s.sTag} style={{ color: style.color }}>
                {style.tag}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompanyContext({ substrate }: { substrate: Substrate }) {
  const a = substrate.account ?? {};
  const rows: Array<[string, string]> = [];
  if (a.industry) rows.push(["Industry", a.industry]);
  if (a.headquarters) rows.push(["Headquarters", a.headquarters]);
  if (a.size_descriptor) rows.push(["Size", a.size_descriptor]);
  if (rows.length === 0) return null;
  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>Company context</div>
      </div>
      <div className={s.ctxGrid}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <div className={s.ctxLabel}>{k}</div>
            <div className={s.ctxVal}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  blocking: s.blocking,
  high: s.high,
  medium: s.medium,
};

function CriticalRisksBlock({ artifact, isSolo = false }: { artifact: PrepArtifact; isSolo?: boolean }) {
  const risks = artifact.critical_risks ?? [];
  if (risks.length === 0) return null;
  // Compressed default — May 16 2026 per Gianna feedback ("if the AI recs
  // were a bit shorter"). Default state surfaces severity + headline +
  // one-line consequence (failure_mode) + a "Reasoning" affordance.
  // Expansion reveals causal chain, trigger, in-call signal, recommended
  // posture, and actions. Pattern intentionally isolated to critical
  // risks first so we can observe before propagating to stakeholder
  // strategy + talk track. The expansion reads as "show me the proof,"
  // not "show me more content" — the default surface should still feel
  // opinionated and alive.
  return (
    <div className={s.block}>
      <div className={s.blockHead}>
        <div className={s.blockTitle}>Critical risks</div>
        <div className={s.blockMeta}>
          {risks.length} {risks.length === 1 ? "risk" : "risks"}
        </div>
      </div>
      <div className={s.riskList}>
        {risks.map((r: CriticalRisk) => (
          <details key={r.id} className={s.risk}>
            <summary className={s.riskHead}>
              <span
                className={`${s.riskSeverity} ${SEVERITY_CLASS[r.severity] ?? s.medium}`}
              >
                {r.severity.toUpperCase()}
              </span>
              <span className={s.riskTitle}>{r.title}</span>
              <span className={s.riskReasoningHint}>Reasoning</span>
              <span className={s.riskReasoningChevron} aria-hidden>›</span>
            </summary>
            <div className={s.riskConsequence}>{r.failure_mode}</div>
            <div className={s.riskDetail}>
              <div className={s.riskMutedRow}>
                <span className={s.riskMutedLabel}>Why</span>
                <span>{r.description}</span>
              </div>
              <div className={s.riskMutedRow}>
                <span className={s.riskMutedLabel}>Trigger</span>
                <span>{r.trigger}</span>
              </div>
              <div className={s.riskMutedRow}>
                <span className={s.riskMutedLabel}>In-call signal</span>
                <span>{r.in_call_signal}</span>
              </div>
              <div className={s.riskMutedRow}>
                <span className={s.riskMutedLabel}>Posture</span>
                <span>{r.recommended_posture}</span>
              </div>
              <div className={s.riskAskRow}>
                {!isSolo && (
                  <RiskQueueActions
                    riskId={r.id}
                    riskTitle={r.title}
                    riskSeverity={r.severity}
                  />
                )}
                <a
                  className={s.riskAskBtn}
                  href={buildRiskExplainHref(r)}
                >
                  💡 Explain this risk
                </a>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

/**
 * Build the prompt the "💡 Explain this risk" button hands AskBar. The
 * coach already has the deal context via dealId; we just point it at
 * THIS risk + the substrate evidence underneath.
 */
function buildRiskExplainPrompt(r: CriticalRisk): string {
  return (
    `Explain this critical risk on the deal: "${r.title}" ` +
    `(severity ${r.severity}). ` +
    `What's the actual evidence in the substrate that triggered this — ` +
    `quote it back to me. ` +
    `What's likely to break if we don't act on it? ` +
    `What's the recommended posture, and what specifically should I do ` +
    `on the next call?`
  );
}

/**
 * Build the URL hash for the "💡 Explain this risk" button. Includes
 * surface + label so AskBar shows "Coach context: Critical risk · Power-map gap".
 */
function buildRiskExplainHref(r: CriticalRisk): string {
  const params = new URLSearchParams({
    q: buildRiskExplainPrompt(r),
    auto: "1",
    surface: "critical_risk",
    label: r.title,
  });
  return `#cockpit-ask?${params.toString()}`;
}

function NotesBlock() {
  return (
    <div className={s.notesWrap}>
      <div className={s.notesLabel}>
        Your notes<span className={s.notesPrivate}>· private</span>
      </div>
      <div className={s.notes}>
        Private rep notes will live here. Coming in Phase B alongside the
        coach bot.
      </div>
    </div>
  );
}

/* AskBar moved to app/prep/AskBar.tsx — now a real coach surface, not a stub. */
