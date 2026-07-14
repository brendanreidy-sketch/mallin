import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import IntakeForm from "./IntakeForm";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { supabaseAdmin } from "@/lib/db/client";
import { reconcileProOnReturn } from "@/lib/billing/reconcile";

/**
 * /new — the B2C "paste a call → brief" surface.
 *
 * Auth-gated (signed-in users only). Workspace provisioning is handled by
 * /welcome and the /cockpit reroute; this page collects the transcript and,
 * for a follow-up, lets the rep attach it to an existing deal.
 */
export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; mode?: string; upgraded?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/start");

  // Returned from Stripe Checkout: grant Pro now instead of waiting for the
  // async webhook, so the paywall is already lifted when the form renders.
  const { dealId, mode, upgraded } = await searchParams;
  if (upgraded === "1") {
    try {
      await reconcileProOnReturn(await getCurrentTenantId());
    } catch {
      /* best-effort — the webhook still lands as backup */
    }
  }

  // The rep's existing deals power the "add a follow-up call" picker.
  // Best-effort: if the workspace isn't resolved yet, the form just shows
  // new-deal mode.
  let existingDeals: { id: string; name: string }[] = [];
  try {
    const tenantId = await getCurrentTenantId();
    const { data } = await supabaseAdmin
      .from("opportunities")
      .select("id, name, last_activity_at")
      .eq("tenant_id", tenantId)
      .order("last_activity_at", { ascending: false })
      .limit(50);
    existingDeals = (data ?? []).map((d) => ({ id: d.id, name: d.name as string }));
  } catch {
    existingDeals = [];
  }

  // "+ Add next call" on the brief deep-links here as /new?dealId=<opp>; open
  // straight into follow-up mode on that deal (only if it's really theirs).
  const initialDealId =
    dealId && existingDeals.some((d) => d.id === dealId) ? dealId : undefined;
  // Onboarding deep-links the prep path as /new?mode=upcoming so a brand-new
  // rep lands on the research form ("who are you meeting?"), not paste-a-call.
  const initialMode =
    mode === "upcoming" || mode === "new" || mode === "existing"
      ? (mode as "upcoming" | "new" | "existing")
      : undefined;

  return (
    <IntakeForm
      existingDeals={existingDeals}
      initialDealId={initialDealId}
      initialMode={initialMode}
    />
  );
}
