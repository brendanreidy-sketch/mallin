import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /coaching — Team intelligence (nav label "Team"). Design page: the reps
 * and coaching notes are a representative example of the vision (a solo
 * workspace has no team yet). The real version aggregates across the team's
 * live deals. Routed to /coaching because /team is the marketing page.
 */
const COACHING = [
  { in: "SC", who: "Sarah Chen", sub: "$310k pipeline", why: "3 open deals single-threaded — coach to multithread before sending proposals." },
  { in: "MW", who: "Marcus Webb", sub: "$180k pipeline", why: "Discovery runs shallow — no budget or timeline captured on 4 deals." },
  { in: "PN", who: "Priya Nair", sub: "$240k pipeline", why: "Discounts early — offers terms before value is agreed on most deals." },
];

export default async function CoachingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { name, initials } = await shellUser();

  return (
    <AppShell
      name={name}
      initials={initials}
      topbar={
        <>
          <span className={s.dstage}>Team intelligence</span>
          <span className={s.badge}>Vision · needs your team</span>
        </>
      }
    >
      <p className={s.brief} style={{ marginBottom: 24 }}>
        When your reps are in Mallín, this is where the patterns surface — one repeated failure,
        turned into coaching. <span className={s.muted}>Example view below.</span>
      </p>
      <div className={s.tiles}>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>Win rate</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-ink)" }}>41%</div></div>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>Avg deal</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-ink)" }}>$92k</div></div>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>At risk now</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-crit)" }}>$610k</div></div>
        <div className={s.tile}><div className="k" style={{ fontSize: 12.5, color: "var(--ck-ink-4)", marginBottom: 7 }}>Reps</div><div style={{ fontSize: 23, fontWeight: 600, color: "var(--ck-ink)" }}>5</div></div>
      </div>
      <div className={s.lbl}><span>Where I&apos;d coach this week</span><i /></div>
      <div>
        {COACHING.map((c) => (
          <div className={s.coach} key={c.in}>
            <span className={s.cav}>{c.in}</span>
            <div className={s.cnm}>{c.who}<div style={{ fontSize: 11.5, color: "var(--ck-ink-4)", marginTop: 1, fontWeight: 400 }}>{c.sub}</div></div>
            <div className={s.cwhy}>{c.why}</div>
            <button className={s.cbtn}>Coach ↗</button>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
