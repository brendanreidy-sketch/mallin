/**
 * Dev-only: let the founder SEE the proactive email path end-to-end. Opening
 * this URL (signed in as the founder) will:
 *   1. drop a real SAMPLE draft into your Gmail Drafts — if Gmail is connected;
 *   2. send the heads-up digest to your inbox (WorkWave marked "drafted in
 *      Gmail" when step 1 worked).
 *
 * Gated by the logged-in Clerk session + an email allowlist; the sample draft is
 * addressed to YOU (not a real prospect), so nothing can leak even if you hit
 * send. Safe to delete this file after you've seen it.
 *
 * Open: https://mallin.io/api/dev/example-nudge  (in a browser signed in as the founder)
 */
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sendRepNudgeDigest } from "@/lib/email/resend";
import { getGmailConnectionStatus } from "@/lib/auth/gmail-oauth";
import { createDraft } from "@/lib/adapters/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECIPIENT = "builtalone@gmail.com";

const SAMPLE_SUBJECT = "Re: WorkWave — before Kevin's board deck";
const SAMPLE_BODY =
  "Greg,\n\nQuick one before the board deck goes out. I want to make sure whatever you put in front of Kevin holds up the moment he starts asking — so before I put a timeline or a number to it, I'd like to grab 20 minutes with John to confirm the consolidation won't touch the product data model. Once that's clear I can give you a real range you can stand behind, not a placeholder.\n\nCould you intro me to John this week? I'll keep it strictly to the integration boundary.\n\nThanks,\nRyan";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new NextResponse("Sign in to mallin.io first, then reload.", { status: 401 });
  }
  const user = await currentUser().catch(() => null);
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress ??
    null;
  if ((email ?? "").toLowerCase() !== RECIPIENT) {
    return new NextResponse("Only the founder account can trigger this.", { status: 403 });
  }

  // 1. Drop a real sample draft into your Gmail (only if Gmail is connected).
  //    Addressed to YOU for the test; the real feature addresses the prospect.
  let gmailConnected = false;
  let draftCreated = false;
  try {
    const status = await getGmailConnectionStatus(userId);
    gmailConnected = status.connected;
    if (gmailConnected) {
      const bodyHtml = SAMPLE_BODY.split("\n\n")
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      await createDraft(userId, {
        to: RECIPIENT,
        subject: SAMPLE_SUBJECT,
        bodyText: SAMPLE_BODY,
        bodyHtml,
      });
      draftCreated = true;
    }
  } catch {
    /* draft is best-effort — the digest still goes out */
  }

  // 2. Send the heads-up digest. WorkWave is marked as drafted-in-Gmail when
  //    step 1 succeeded, so you see the "Open Gmail" version.
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
        move: "Send Greg a two-line check-in and lock the 20-minute session with John.",
        emailSubject: SAMPLE_SUBJECT,
        emailBody: SAMPLE_BODY,
        gmailDrafted: draftCreated,
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

  return NextResponse.json({
    ok: res.ok,
    gmailConnected,
    draftCreated,
    digestSent: res.ok,
    hint: gmailConnected
      ? "Open Gmail → Drafts to see the sample email that just landed."
      : "Connect Gmail first (Settings → Integrations), then reload this URL.",
  });
}
