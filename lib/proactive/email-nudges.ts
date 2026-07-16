import { supabaseAdmin } from "@/lib/db/client";
import { scanTenantForNudges } from "./detect-nudges";
import { sendRepNudgeDigest } from "@/lib/email/resend";

/**
 * The EMAIL delivery of the proactive engine — as deals progress, email the rep
 * a digest of the deals that need a move, each with what to send and a one-click
 * link to review and send it from the ✉ surface. Complements the Slack push;
 * same detection, different channel.
 *
 * GATED: PROACTIVE_EMAIL_NUDGES_ENABLED must equal "1" (OFF by default) — until
 * then the scan runs but no email is sent. The rep is the tenant's owner_email.
 * Never throws.
 */
export async function emailNudgesForTenant(
  tenantId: string,
  nowMs: number,
): Promise<{ found: number; sent: boolean }> {
  try {
    const nudges = await scanTenantForNudges(tenantId, nowMs);
    if (nudges.length === 0) return { found: 0, sent: false };

    if (process.env.PROACTIVE_EMAIL_NUDGES_ENABLED !== "1") {
      return { found: nudges.length, sent: false };
    }

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("owner_email, first_name")
      .eq("id", tenantId)
      .maybeSingle();
    const repEmail = tenant?.owner_email ?? null;
    if (!repEmail) return { found: nudges.length, sent: false };

    const res = await sendRepNudgeDigest({
      email: repEmail,
      name: tenant?.first_name ?? null,
      items: nudges.map((n) => ({
        opportunityId: n.opportunityId,
        dealName: n.dealName,
        headline: n.headline,
        reason: n.reason,
        move: n.move,
      })),
    });
    return { found: nudges.length, sent: res.ok };
  } catch {
    return { found: 0, sent: false };
  }
}
