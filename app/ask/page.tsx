import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import AppShell from "@/components/app-shell/AppShell";
import { shellUser } from "@/components/app-shell/chrome";
import s from "@/components/app-shell/surfaces.module.css";

export const dynamic = "force-dynamic";

/**
 * /ask — Ask Mallín, the pipeline-level conversational surface.
 *
 * Design page for now: the question/answer is representative. Wires to the
 * coach engine in a later pass. Kept in the app shell so the nav is complete
 * and it demos as a finished product.
 */
export default async function AskPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { name, initials } = await shellUser();

  return (
    <AppShell name={name} initials={initials} topbar={<span className={s.dstage}>Ask Mallín</span>}>
      <div className={s.qrow}>
        <span className={s.qav}>{initials}</span>
        <span className={s.q}>What needs my attention across the pipeline this week?</span>
      </div>
      <div className={s.arow}>
        <span className={s.aav}>M</span>
        <div style={{ flex: 1 }}>
          <p className={s.aline}>
            One thing is genuinely urgent: <b>Cast &amp; Crew</b>. An unauthorized pricing
            concession has frozen the redline — it won&apos;t move until clean, approved terms are
            in writing, and the board committee needs a defensible pricing story before they vote.
          </p>
          <p className={`${s.aline} ${s.sub}`}>
            Rate/Kenny Greene and Sprout Social are both pre-call and on track — no action needed
            until you prep for those first meetings.
          </p>
          <div className={s.ground}>
            grounded in
            <span className={s.gpill}>call transcripts</span>
            <span className={s.gpill}>3 deals</span>
          </div>
          <div className={s.chips}>
            <span className={s.chip2}>Draft the Cast &amp; Crew pricing note ↗</span>
            <span className={s.chip2}>Prep me for the Sprout Social call ↗</span>
            <span className={s.chip2}>What&apos;s blocking Cast &amp; Crew? ↗</span>
          </div>
        </div>
      </div>
      <div className={s.askbar} style={{ marginTop: 26 }}>
        <span className="ph" style={{ flex: 1, color: "var(--ck-ink-4)", fontSize: 14 }}>
          Ask a follow-up…
        </span>
        <span className="go" style={{ fontSize: 13, color: "var(--ck-ink-2)", border: "0.5px solid var(--ck-rule-2)", borderRadius: 8, padding: "7px 13px" }}>
          Send
        </span>
      </div>
    </AppShell>
  );
}
