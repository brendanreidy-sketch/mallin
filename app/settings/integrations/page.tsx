/**
 * /settings/integrations — minimal "Connect Gmail / Connect HubSpot"
 * page. Server component that reads connection status and renders
 * Connect / Disconnect buttons accordingly.
 *
 * This is intentionally simple — first surface for the rep to wire
 * their own Gmail. Visual polish is downstream; what matters is the
 * flow works.
 */
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getGmailConnectionStatus } from "@/lib/auth/gmail-oauth";
import { getHubspotConnectionStatus } from "@/lib/auth/hubspot-oauth";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import styles from "./integrations.module.css";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    gmail?: string;
    hubspot?: string;
    email?: string;
    domain?: string;
    reason?: string;
  }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let tenantId: string | null = null;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    // user without an active org — show the page but disable per-tenant integrations
  }

  const gmailStatus = await getGmailConnectionStatus(userId);
  const hubspotStatus = tenantId
    ? await getHubspotConnectionStatus(tenantId)
    : { connected: false as const };
  const sp = await searchParams;
  const status = gmailStatus; // back-compat for downstream JSX below

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Integrations</h1>
        <p className={styles.lede}>
          Connect Mallín to the tools you already use. Each integration
          is per-user — your Gmail tokens belong to you and stay scoped
          to your Mallín account.
        </p>
      </header>

      {sp.gmail === "connected" && sp.email ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          ✓ Gmail connected as <strong>{sp.email}</strong>
        </div>
      ) : null}
      {sp.gmail === "denied" ? (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          You declined the Google consent screen. Click Connect to try
          again.
        </div>
      ) : null}
      {sp.gmail === "error" ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          Something went wrong: {sp.reason ?? "unknown error"}. Try again
          or reach out at hello@mallin.io.
        </div>
      ) : null}
      {sp.gmail === "disconnected" ? (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          Gmail disconnected. Your tokens have been removed.
        </div>
      ) : null}

      <section className={styles.integration}>
        <div className={styles.integrationHead}>
          <h2 className={styles.integrationName}>Gmail</h2>
          {status.connected ? (
            <span className={styles.statusConnected}>
              ● Connected{status.googleEmail ? ` · ${status.googleEmail}` : ""}
            </span>
          ) : (
            <span className={styles.statusDisconnected}>○ Not connected</span>
          )}
        </div>
        <p className={styles.integrationBody}>
          Drafts written in your voice go into your Gmail Drafts folder.
          Mallín never sends — you click Send from your own inbox.
        </p>
        <div className={styles.actions}>
          {status.connected ? (
            <form action="/api/gmail/disconnect" method="POST">
              <button type="submit" className={styles.btnSecondary}>
                Disconnect Gmail
              </button>
            </form>
          ) : (
            <a href="/api/gmail/connect" className={styles.btnPrimary}>
              Connect Gmail
            </a>
          )}
        </div>
      </section>

      {sp.hubspot === "connected" ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          ✓ HubSpot connected{sp.domain ? ` to portal ${sp.domain}` : ""}
        </div>
      ) : null}
      {sp.hubspot === "denied" ? (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          You declined the HubSpot consent screen. Click Connect to try again.
        </div>
      ) : null}
      {sp.hubspot === "error" ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          Something went wrong with HubSpot: {sp.reason ?? "unknown error"}.
        </div>
      ) : null}
      {sp.hubspot === "disconnected" ? (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          HubSpot disconnected. Tokens removed for this tenant.
        </div>
      ) : null}

      <section className={styles.integration}>
        <div className={styles.integrationHead}>
          <h2 className={styles.integrationName}>HubSpot</h2>
          {hubspotStatus.connected ? (
            <span className={styles.statusConnected}>
              ● Connected
              {hubspotStatus.hubDomain ? ` · ${hubspotStatus.hubDomain}` : ""}
            </span>
          ) : (
            <span className={styles.statusDisconnected}>○ Not connected</span>
          )}
        </div>
        <p className={styles.integrationBody}>
          Read + write deal records, MEDDPICC fields, contacts, and companies.
          One connection per tenant — whoever connects, the whole team uses
          the shared token.
        </p>
        <div className={styles.actions}>
          {hubspotStatus.connected ? (
            <form action="/api/hs/disconnect" method="POST">
              <button type="submit" className={styles.btnSecondary}>
                Disconnect HubSpot
              </button>
            </form>
          ) : tenantId ? (
            <a href="/api/hs/connect" className={styles.btnPrimary}>
              Connect HubSpot
            </a>
          ) : (
            <span className={styles.statusDisconnected}>
              Set up a Clerk organization first
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
