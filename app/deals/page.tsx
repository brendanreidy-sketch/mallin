import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { hasCockpitAccess } from "@/lib/cockpit/access";
import Link from "next/link";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import { loadTenantDeals, type Deal } from "@/lib/cockpit/load-tenant-deals";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /deals — the full pipeline: every open deal, grouped needs-you / on-track,
 * with its next step. Live data via loadTenantDeals; wrapped in the app shell.
 */
export default async function DealsPage() {
  const { orgId, userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) {
    if (await hasCockpitAccess()) redirect("/cockpit-views");
    redirect("/welcome");
  }
  const load = await loadTenantDeals(orgId);
  if (load.kind === "no-tenant") redirect("/cockpit");
  if (load.kind === "no-deals") redirect("/new?mode=upcoming");
  const { needsYou, onTrack } = load;
  const { name, initials } = await shellUser();

  return (
    <AppShell
      name={name}
      initials={initials}
      topbar={
        <>
          <span className={s.dstage}>Deals</span>
          <span className={s.dstage}>{needsYou.length + onTrack.length} open</span>
        </>
      }
    >
      <h1 className={s.h1}>Your pipeline</h1>
      {needsYou.length > 0 && (
        <>
          <div className={`${s.dgroup} ${s.need}`}>Needs you · {needsYou.length}</div>
          {needsYou.map((d) => (
            <DealRow key={d.id} deal={d} posture="At risk" postureClass={s.risk} />
          ))}
        </>
      )}
      {onTrack.length > 0 && (
        <>
          <div className={`${s.dgroup} ${s.track}`}>On track · {onTrack.length}</div>
          {onTrack.map((d) => (
            <DealRow key={d.id} deal={d} posture="Advancing" postureClass={s.good} />
          ))}
        </>
      )}
    </AppShell>
  );
}

function DealRow({
  deal,
  posture,
  postureClass,
}: {
  deal: Deal;
  posture: string;
  postureClass: string;
}) {
  return (
    <Link href={`/prep?dealId=${deal.id}`} className={s.drow}>
      <span>
        <span className={s.dnm}>{deal.name}</span>
        <span className={s.dnx}>Next: {deal.why}</span>
      </span>
      <span className={s.dstage}>{deal.live ? "Live brief" : "Pre-call"}</span>
      <span className={`${s.rchip} ${postureClass}`}>{posture}</span>
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
  );
}
