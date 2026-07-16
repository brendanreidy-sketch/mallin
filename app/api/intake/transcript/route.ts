import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { getHelpUsage, freeLimitResponseBody } from "@/lib/billing/help-usage";
import { getFairUseStatus, fairUseResponseBody } from "@/lib/billing/fair-use";
import { recordIntakeTask } from "@/lib/billing/intake-usage";
import { withUsageContext } from "@/lib/billing/usage-context";
import {
  appendCallAndRebuild,
  createDealShell,
  deleteDealShell,
  runIntakePipeline,
} from "@/lib/intake/create-deal-from-transcript";

/**
 * POST /api/intake/transcript — B2C "paste a call → brief".
 *
 * Runs the full pipeline (Pass 0 → 1.5 → 2 → 3 → 4) SYNCHRONOUSLY and returns
 * once the brief is persisted. We tried after() (return fast, build in the
 * background), but Vercel doesn't reliably give post-response work the full
 * maxDuration — so the brief never finished persisting. A normal request
 * function DOES get its full window, so the client awaits this (~3–4 min)
 * behind a build overlay, then opens the brief.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Whole pipeline runs in-request (~250–360s observed: Pass 0 research is the
// long pole). The default 300s ceiling cut it off mid-brief; Fluid Compute is
// enabled on this project, which raises the Pro ceiling to 800s — set there for
// 2× headroom.
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch {
    // Signed in but no workspace yet — send them through provisioning.
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    transcript?: string;
    productContext?: string;
    accountNameHint?: string;
    opportunityId?: string;
    sellerCompany?: string;
    channel?: string;
  };
  const transcript = (body.transcript ?? "").trim();
  // Whether the pasted content is a call transcript or an inbound email.
  const channel = body.channel === "email" ? "email" : "call";
  const productContext = (body.productContext ?? "").trim();
  const accountNameHint = (body.accountNameHint ?? "").trim() || null;
  const sellerCompany = (body.sellerCompany ?? "").trim();
  const opportunityId = (body.opportunityId ?? "").trim() || null;

  if (transcript.length < 100) {
    return NextResponse.json(
      { error: "transcript_too_short", message: "Paste a fuller transcript (at least a few sentences)." },
      { status: 400 },
    );
  }

  // ── Free-tier meter: 3 free CALLS, workspace-wide (one per transcript
  // submitted — the intro plus each follow-up). Counted vs tenants.deal_limit
  // (NULL / demo = exempt); fails OPEN. This one gate covers both the new
  // paste-a-call deal and follow-up calls, and the 402 becomes the upgrade wall.
  const usage = await getHelpUsage(tenantId);
  if (usage.over) {
    return NextResponse.json(freeLimitResponseBody(usage), { status: 402 });
  }

  // ── Pro fair-use backstop ──
  // Pro is unlimited for every real rep; this hard ceiling only trips on a
  // runaway/abusive account and protects margin against unbounded model cost on
  // the flat plan. Free/enterprise/demo are unaffected. Fails open.
  const fairUse = await getFairUseStatus(tenantId);
  if (fairUse.over) {
    return NextResponse.json(fairUseResponseBody(fairUse), { status: 429 });
  }

  // ── Follow-up on an EXISTING deal ──
  // Append the call and rebuild the brief over all the deal's calls; the prior
  // call becomes "what was said last time".
  if (opportunityId) {
    try {
      await withUsageContext({ tenantId, opportunityId }, () =>
        appendCallAndRebuild({ tenantId, opportunityId, transcript, channel }),
      );
    } catch (err) {
      console.error(`[intake] follow-up rebuild failed for ${opportunityId}:`, err);
      return NextResponse.json(
        {
          error: "pipeline_failed",
          message: "We couldn't update that deal's brief. Please try again.",
          detail: ((err as Error)?.message ?? String(err)).slice(0, 300),
        },
        { status: 500 },
      );
    }
    // Follow-up call succeeded → count it as one free-tier task (best-effort).
    await recordIntakeTask({ tenantId, userId, kind: "follow_up", opportunityId });
    return NextResponse.json({ ok: true, opportunityId });
  }

  // ── New deal path ──
  if (!productContext) {
    return NextResponse.json(
      { error: "product_context_required", message: "Tell us what you're selling." },
      { status: 400 },
    );
  }

  const shell = await createDealShell({
    tenantId,
    ownerId: userId,
    transcript,
    productContext,
    accountNameHint,
  });

  // Synchronous — NOT after(). Vercel cut off post-response work before the
  // brief persisted; a normal request function gets its full window.
  try {
    await withUsageContext(
      { tenantId, opportunityId: shell.opportunityId },
      () =>
        runIntakePipeline({
          tenantId,
          shell,
          transcript,
          productContext,
          accountNameHint,
          sellerCompany,
        }),
    );
  } catch (err) {
    console.error(`[intake] pipeline failed for opportunity ${shell.opportunityId}:`, err);
    // Roll the failed shell back so it doesn't burn a free-tier deal slot or
    // leave an orphaned half-deal. Best-effort — never mask the original error.
    try {
      await deleteDealShell(shell);
    } catch (rollbackErr) {
      console.error(`[intake] rollback failed for ${shell.opportunityId}:`, rollbackErr);
    }
    return NextResponse.json(
      {
        error: "pipeline_failed",
        message: "We couldn't finish building your brief. Please try again.",
        detail: ((err as Error)?.message ?? String(err)).slice(0, 300),
      },
      { status: 500 },
    );
  }

  // New paste-a-call brief succeeded → count it as one free-tier task.
  await recordIntakeTask({
    tenantId,
    userId,
    kind: "call",
    opportunityId: shell.opportunityId,
  });

  return NextResponse.json({ ok: true, opportunityId: shell.opportunityId });
}
