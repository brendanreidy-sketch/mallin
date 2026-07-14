import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { getHelpUsage, freeLimitResponseBody } from "@/lib/billing/help-usage";
import { getFairUseStatus, fairUseResponseBody } from "@/lib/billing/fair-use";
import { recordIntakeTask } from "@/lib/billing/intake-usage";
import { withUsageContext } from "@/lib/billing/usage-context";
import {
  createResearchDeal,
  runResearchOnly,
  deleteDealShell,
} from "@/lib/intake/create-deal-from-transcript";

/**
 * POST /api/intake/research — "Call coming up" (pre-call, NO transcript).
 *
 * Researches the company + the people the rep is about to meet (Pass 0 only)
 * and lands them on the Account-Intelligence view. NO free-tier gate: a
 * research-only deal has no call, so it isn't a "worked" deal and doesn't
 * cost a slot — the slot is consumed when the first real call is added.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pass 0 web-research can run a few minutes; same window as the transcript path.
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
    return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  }

  // Free-tier meter: a new-deal brief is a billable help-action.
  const usage = await getHelpUsage(tenantId);
  if (usage.over) {
    return NextResponse.json(freeLimitResponseBody(usage), { status: 402 });
  }

  // Pro fair-use backstop — hard ceiling that only trips on abuse; free/
  // enterprise/demo unaffected. Fails open.
  const fairUse = await getFairUseStatus(tenantId);
  if (fairUse.over) {
    return NextResponse.json(fairUseResponseBody(fairUse), { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    company?: string;
    productContext?: string;
    stakeholders?: string | string[];
    sellerCompany?: string;
  };
  const company = (body.company ?? "").trim();
  const productContext = (body.productContext ?? "").trim();
  const sellerCompany = (body.sellerCompany ?? "").trim();
  const stakeholderHints = Array.isArray(body.stakeholders)
    ? body.stakeholders.map((s) => String(s).trim()).filter(Boolean)
    : (body.stakeholders ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

  if (!company) {
    return NextResponse.json(
      { error: "company_required", message: "Tell us the company you're meeting." },
      { status: 400 },
    );
  }
  if (!productContext) {
    return NextResponse.json(
      { error: "product_context_required", message: "Tell us what you're selling." },
      { status: 400 },
    );
  }

  const shell = await createResearchDeal({
    tenantId,
    ownerId: userId,
    company,
    productContext,
    stakeholderHints,
  });

  try {
    await withUsageContext(
      { tenantId, opportunityId: shell.opportunityId },
      () =>
        runResearchOnly({ tenantId, shell, company, productContext, stakeholderHints, sellerCompany }),
    );
  } catch (err) {
    console.error(`[research] failed for opportunity ${shell.opportunityId}:`, err);
    try {
      await deleteDealShell(shell);
    } catch (rollbackErr) {
      console.error(`[research] rollback failed for ${shell.opportunityId}:`, rollbackErr);
    }
    return NextResponse.json(
      {
        error: "research_failed",
        message: "We couldn't finish researching that account. Please try again.",
        detail: ((err as Error)?.message ?? String(err)).slice(0, 300),
      },
      { status: 500 },
    );
  }

  // Research succeeded → count it as one free-tier task (best-effort).
  await recordIntakeTask({
    tenantId,
    userId,
    kind: "research",
    opportunityId: shell.opportunityId,
  });

  return NextResponse.json({ ok: true, opportunityId: shell.opportunityId });
}
