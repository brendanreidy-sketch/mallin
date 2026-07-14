import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { getAutonomy, getTargetSeniority } from "@/lib/sdr/outbound/config-store";
import type { Prospect } from "@/lib/sdr/outbound/sourcing-agent";
import AutonomyBanner from "./AutonomyBanner";
import SeniorityControl from "./SeniorityControl";
import ProspectCard from "./ProspectCard";
import styles from "./outbound.module.css";

/**
 * /outbound — the prospect review queue.
 *
 * Server component: loads the tenant's sourced prospects + autonomy state,
 * renders the autonomy banner with the kill-switch and the prospect list. The
 * button posts are handled by client children (AutonomyBanner, ProspectCard).
 *
 * First structural pass: auth-gated, tuned on deploy. Send is stubbed — the
 * queue reflects disposition status but nothing hits an email API.
 */
export const dynamic = "force-dynamic";

interface ProspectRow {
  id: string;
  prospect: Prospect;
  status: string;
  created_at: string;
}

export default async function OutboundQueuePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    redirect("/outbound/setup");
  }

  const [{ data: rows }, autonomy, seniority] = await Promise.all([
    supabaseAdmin
      .from("outbound_prospects")
      .select("id, prospect, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    getAutonomy(tenantId),
    getTargetSeniority(tenantId),
  ]);

  const prospects = (rows ?? []) as ProspectRow[];
  const count = (s: string) => prospects.filter((p) => p.status === s).length;
  const funnel = [
    { n: prospects.length, label: "Sourced" },
    { n: count("pending"), label: "To review", accent: true },
    { n: count("approved"), label: "Approved" },
    { n: count("queued_send") + count("sent"), label: "Sent" },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.agentRow}>
          <h1 className={styles.title}>Prospecting agent</h1>
          <span className={styles.agentStatus}>working the list</span>
        </div>
        <p className={styles.lede}>
          The agent sources, researches, and drafts on its own — and stops for
          you at the approval gate. You set the leash and clear the queue.
        </p>
        <div className={styles.funnel}>
          {funnel.map((f) => (
            <div key={f.label} className={styles.funnelCell}>
              <div className={`${styles.funnelNum} ${f.accent ? styles.funnelAccent : ""}`}>
                {f.n}
              </div>
              <div className={styles.funnelLabel}>{f.label}</div>
            </div>
          ))}
        </div>
      </header>

      <AutonomyBanner level={autonomy.level} paused={autonomy.paused} />

      <SeniorityControl preset={seniority.preset ?? "ae"} />

      {prospects.length === 0 ? (
        <div className={styles.empty}>
          No prospects yet. <Link href="/outbound/setup">Set up your targeting</Link>{" "}
          so the agent can source your first batch.
        </div>
      ) : (
        <>
          <div className={styles.queueLabel}>
            Awaiting your approval · {count("pending")}
          </div>
          <div className={styles.list}>
            {prospects.map((row) => (
              <ProspectCard
                key={row.id}
                id={row.id}
                prospect={row.prospect}
                status={row.status}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
