import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /knowledge — institutional memory. Design page: the entries are
 * representative of the vision. The real version captures plays from the
 * team's deals as they happen.
 */
const ENTRIES = [
  {
    eyebrow: "Competitive play",
    title: "Winning against Rillet when they re-price aggressively",
    body: "Rillet returns with a cheaper revised commercial late in the cycle. The counter isn't price — it's proving your pricing is locked and honest in writing before they get a formal meeting.",
    meta: "from 3 deals · updated Jul 15",
  },
  {
    eyebrow: "Approval pattern",
    title: "Getting CFO sign-off at PE-backed companies",
    body: "The signer isn't the champion. Pre-brief the board-committee member on the pricing change — one paragraph, forwarded by your champion before the room — or the vote defers.",
    meta: "from 5 deals · updated Jul 12",
  },
  {
    eyebrow: "Deal trap",
    title: "The unauthorized pricing concession",
    body: "Conceding a rate verbally without deal-desk authorization freezes the redline and re-opens closed evaluations. Never quote a portfolio rate live without written pre-clearance.",
    meta: "from Cast & Crew · updated today",
  },
];

export default async function KnowledgePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { name, initials } = await shellUser();

  return (
    <AppShell
      name={name}
      initials={initials}
      topbar={
        <>
          <span className={s.dstage}>Knowledge</span>
          <span className={s.badge}>Vision</span>
        </>
      }
    >
      <h1 className={s.h1}>Institutional memory</h1>
      <p className={s.brief} style={{ marginBottom: 26 }}>
        Every hard-won lesson your team learns, captured as it happens and handed back as strategy —
        so the next rep doesn&apos;t relearn it. <span className={s.muted}>Example entries below.</span>
      </p>
      <div className={s.kgrid}>
        {ENTRIES.map((e) => (
          <div className={s.kcard} key={e.title}>
            <div className={s.keyb}>{e.eyebrow}</div>
            <div className={s.ktitle}>{e.title}</div>
            <div className={s.kbody}>{e.body}</div>
            <div className={s.kmeta}>{e.meta}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
