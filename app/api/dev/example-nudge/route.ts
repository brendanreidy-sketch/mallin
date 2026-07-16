/**
 * Dev-only: send the founder ONE example proactive-nudge digest, from prod
 * (where RESEND_API_KEY lives). So you can see exactly what a rep receives.
 *
 * Gated by CRON_SECRET, and the recipient is HARDCODED to the founder's own
 * address — so even with the secret this can never email a third party.
 *
 * Fire: curl -H "Authorization: Bearer <CRON_SECRET>" https://mallin.io/api/dev/example-nudge
 * Safe to delete this file after you've seen the example.
 */
import { NextRequest, NextResponse } from "next/server";
import { sendRepNudgeDigest } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECIPIENT = "builtalone@gmail.com";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const res = await sendRepNudgeDigest({
    email: RECIPIENT,
    name: "Brendan",
    items: [
      {
        opportunityId: "06513ea7-a81b-4c39-ba1b-c682b8c80293",
        dealName: "WorkWave — NetSuite expansion (Doran, CFO)",
        headline: "Gone quiet — 9 days since the last touch.",
        reason:
          "Silence past a week usually means the deal is drifting. Re-open it before it stalls.",
        move: "Send Greg a two-line check-in: confirm the 20-minute session with John is on the calendar and that the working notes reached Denise. Don't put a number on the table yet.",
        emailSubject: "Re: WorkWave — before Kevin's board deck",
        emailBody:
          "Greg,\n\nQuick one before the board deck goes out. I want to make sure whatever you put in front of Kevin holds up the moment he starts asking — so before I put a timeline or a number to it, I'd like to grab 20 minutes with John to confirm the consolidation won't touch the product data model. Once that's clear I can give you a real range you can stand behind, not a placeholder.\n\nCould you intro me to John this week? I'll keep it strictly to the integration boundary.\n\nThanks,\nRyan",
      },
      {
        opportunityId: "b1f9b0c2-0000-4000-8000-000000000002",
        dealName: "Rate & Rate — payments platform",
        headline: "Showing the stall signature.",
        reason:
          "The economic buyer went quiet after the pricing conversation and there's no next step booked.",
        move: "Go back to the champion, not the buyer: ask what changed since pricing and what she needs to move it internally.",
      },
      {
        opportunityId: "c2a0d1e3-0000-4000-8000-000000000003",
        dealName: "Cast & Crew — NetSuite ERP",
        headline: "Closed lost about 4 months ago — worth a win-back look.",
        reason:
          "Why it closed: lost on trust after a premature number; they went with the incumbent.",
        move: "Reach out for a light check-in — are they getting what they signed up for with the vendor they chose? If there's a gap, that's your opening to come back in.",
      },
    ],
  });

  return NextResponse.json({ ok: res.ok, to: RECIPIENT, error: res.error ?? null });
}
