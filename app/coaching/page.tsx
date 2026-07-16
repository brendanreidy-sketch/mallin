import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import { loadTenantDeals } from "@/lib/cockpit/load-tenant-deals";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /coaching — Team intelligence (nav label "Team"). Reads real cross-deal
 * patterns from the tenant's briefs: how many deals need attention, and where
 * they're stalling (the blocking/high risks across the pipeline). Multi-rep
 * coaching comes online once the workspace has a team; until then this is the
 * single-rep view of the same patterns. Routed to /coaching (marketing owns /team).
 */
export default async function CoachingPage() {
  const { orgId, userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) {
    if (await hasCockpitAccess()) redirect("/cockpit-views");
    redirect("/welcome");
  }
  const load = await loadTenantDeals(orgId);
  const { name, initials } = await shellUser();
  const { needsYou, onTrack, briefs } =
    load.kind === "ok" ? load : { needsYou: [], onTrack: [], briefs: [] };

  // Real "where deals are stalling" — the blocking/high risks across the
  // pipeline, each tied to its deal. This is the pattern layer that becomes
  // per-rep coaching once there's a team.
  const stalls = briefs.flatMap((b) =>
    (b.artifact.critical_risks ?? [])
      .filter((r) => r.severity === "blocking" || r.severity === "high")
      .slice(0, 1)
      .map((r) => ({ deal: b.name, title: r.title, posture: r.recommended_posture })),
  );

  const total = needsYou.length + onTrack.length;

  return (
    <AppShell
      name={name}
      initials={initials}
      topbar={
        <>
          <span className={s.dstage}>Team intelligence</span>
          <span className={s.badge}>Solo · patterns across your deals</span>
        </>
      }
    >
      <p className={s.brief} style={{ marginBottom: 24 }}>
        The patterns across your pipeline — where deals stall and what needs you. When your reps
        join Mallín, this becomes per-rep coaching on the same signals.
      </p>
      <div className={s.tiles}>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>Open deals</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-ink)" }}>{total}</div></div>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>Need you</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-crit)" }}>{needsYou.length}</div></div>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>On track</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-ink)" }}>{onTrack.length}</div></div>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>Live briefs</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-ink)" }}>{briefs.length}</div></div>
      </div>
      <div className={s.lbl}><span>Where your deals are stalling</span><i /></div>
      {stalls.length > 0 ? (
        <div>
          {stalls.map((st, i) => (
            <div className={s.coach} key={i}>
              <span className={s.cav}>{st.deal.slice(0, 2).toUpperCase()}</span>
              <div className={s.cnm}>{st.deal}<div style={{ fontSize: 11.5, color: "var(--ck-ink-4)", marginTop: 1, fontWeight: 400 }}>{st.title}</div></div>
              <div className={s.cwhy}>{st.posture}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className={s.muted}>No blocking risks across your deals right now — everything&apos;s moving.</p>
      )}
    </AppShell>
  );
}
