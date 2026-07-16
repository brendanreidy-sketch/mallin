import { supabaseAdmin } from "@/lib/db/client";
import { scanTenantForNudges, type Nudge } from "./detect-nudges";
import { sendRepNudgeDigest } from "@/lib/email/resend";
import { generateFollowupDraft } from "@/lib/agents/draft-followup";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";

/**
 * The EMAIL delivery of the proactive engine — as deals progress, email the rep
 * a digest of the deals that need a move.
 *
 * The top-ranked deals get a FULLY-WRITTEN draft embedded in the digest (read-
 * and-send beats click-then-write — removing the writing friction is the whole
 * point). The rest get the directive move + a link. Capped for cost AND
 * readability — a digest of ten four-paragraph drafts is unusable. Every item
 * links to the deal, where the ✉ surface handles the actual send (recipient
 * resolution, "nothing sends without your click").
 *
 * GATED: PROACTIVE_EMAIL_NUDGES_ENABLED must equal "1" (OFF by default). Rep =
 * the tenant's owner_email. Never throws.
 */

// How many deals get a fully-written draft (the rest are move + link).
const MAX_DRAFTS = 3;

// Urgency order — a live deal slipping outranks a re-engagement opportunity, so
// the capped drafts land on the deals that most need action.
const KIND_PRIORITY: Record<Nudge["kind"], number> = {
  stall: 0,
  silence: 1,
  winback: 2,
};

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

    // Rank by urgency; the top MAX_DRAFTS get a full pre-written draft.
    const ranked = [...nudges].sort(
      (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
    );

    const items = await Promise.all(
      ranked.map(async (n, i) => {
        const base = {
          opportunityId: n.opportunityId,
          dealName: n.dealName,
          headline: n.headline,
          reason: n.reason,
          move: n.move,
        };
        if (i >= MAX_DRAFTS) return base;
        // Full draft for the top-ranked deals: load the current brief + write
        // the email. Falls back to move + link if drafting fails.
        try {
          const { data: art } = await supabaseAdmin
            .from("execution_artifacts")
            .select("artifact")
            .eq("opportunity_id", n.opportunityId)
            .eq("is_current", true)
            .maybeSingle();
          const draft = await generateFollowupDraft(
            { opportunity: { id: n.opportunityId, name: n.dealName } },
            (art?.artifact as PrepArtifact) ?? null,
            {},
          );
          return { ...base, emailSubject: draft.subject, emailBody: draft.bodyText };
        } catch {
          return base;
        }
      }),
    );

    const res = await sendRepNudgeDigest({
      email: repEmail,
      name: tenant?.first_name ?? null,
      items,
    });
    return { found: nudges.length, sent: res.ok };
  } catch {
    return { found: 0, sent: false };
  }
}
