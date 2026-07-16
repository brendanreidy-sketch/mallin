import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import AskPanel from "@/components/app-shell/AskPanel";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /ask — Ask Mallín, pipeline-level. The panel streams answers from
 * /api/ask, which grounds Claude in the rep's real deals + briefs.
 */
export default async function AskPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { name, initials } = await shellUser();

  const starters = [
    "What needs my attention this week?",
    "Which deal is most at risk, and why?",
    "What's blocking my deals from closing?",
  ];

  return (
    <AppShell name={name} initials={initials} topbar={<span className={s.dstage}>Ask Mallín</span>}>
      <h1 className={s.h1} style={{ marginBottom: 8 }}>
        Ask Mallín
      </h1>
      <p className={s.brief} style={{ marginBottom: 24 }}>
        Ask anything about your pipeline — Mallín answers from your real deals, their calls, and
        their briefs.
      </p>
      <AskPanel starters={starters} />
    </AppShell>
  );
}
