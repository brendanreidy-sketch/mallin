import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import { loadTenantDeals } from "@/lib/cockpit/load-tenant-deals";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /knowledge — institutional memory, built from the plays and traps already
 * captured in each deal's brief (how_you_win + critical_risks). Real data;
 * grows automatically as deals produce briefs. When a real capture pipeline
 * (the coaching engine) lands, it feeds the same surface.
 */
type Entry = { eyebrow: string; title: string; body: string; meta: string };

export default async function KnowledgePage() {
  const { orgId, userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) {
    if (await hasCockpitAccess()) redirect("/cockpit-views");
    redirect("/welcome");
  }
  const load = await loadTenantDeals(orgId);
  const { name, initials } = await shellUser();
  const briefs = load.kind === "ok" ? load.briefs : [];

  const entries: Entry[] = [];
  for (const b of briefs) {
    const a = b.artifact;
    if (a.how_you_win) {
      entries.push({
        eyebrow: "Winning play",
        title: `How you win ${b.name}`,
        body: a.how_you_win,
        meta: `from ${b.name}`,
      });
    }
    const topRisk = (a.critical_risks ?? []).find(
      (r) => r.severity === "blocking" || r.severity === "high",
    );
    if (topRisk) {
      entries.push({
        eyebrow: "Deal trap",
        title: topRisk.title,
        body: topRisk.recommended_posture || topRisk.description,
        meta: `from ${b.name}`,
      });
    }
  }

  return (
    <AppShell
      name={name}
      initials={initials}
      topbar={
        <>
          <span className={s.dstage}>Knowledge</span>
          {entries.length === 0 && <span className={s.badge}>Building</span>}
        </>
      }
    >
      <h1 className={s.h1}>Institutional memory</h1>
      <p className={s.brief} style={{ marginBottom: 26 }}>
        Every hard-won lesson your team learns, captured from your deals and handed back as
        strategy — so the next rep doesn&apos;t relearn it.
      </p>
      {entries.length > 0 ? (
        <div className={s.kgrid}>
          {entries.map((e, i) => (
            <div className={s.kcard} key={i}>
              <div className={s.keyb}>{e.eyebrow}</div>
              <div className={s.ktitle}>{e.title}</div>
              <div className={s.kbody}>{e.body}</div>
              <div className={s.kmeta}>{e.meta}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className={s.muted}>
          No plays captured yet — they&apos;ll appear here as your deals produce briefs.
        </p>
      )}
    </AppShell>
  );
}
