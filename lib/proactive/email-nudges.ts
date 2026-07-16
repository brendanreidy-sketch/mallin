import { supabaseAdmin } from "@/lib/db/client";
import { scanTenantForNudges, type Nudge } from "./detect-nudges";
import { sendRepNudgeDigest } from "@/lib/email/resend";
import { generateFollowupDraft } from "@/lib/agents/draft-followup";
import { getGmailConnectionStatus } from "@/lib/auth/gmail-oauth";
import { createDraft } from "@/lib/adapters/gmail";
import type { PrepArtifact } from "@/lib/contracts/execution-agent-output";
import {
  recordDealSaveCandidate,
  isDealSaveLedgerEnabled,
  type RiskSignal,
  type SaveAction,
} from "@/lib/coaching/persist-deal-save";

// Nudge kind → save-ledger shape. Only LIVE at-risk deals open a save episode;
// 'winback' is a deal already closed lost (a fresh pursuit, not a save), so it
// is deliberately absent — a win-back can never be credited as saved pipeline.
const SAVE_SHAPE: Partial<
  Record<Nudge["kind"], { signal: RiskSignal; action: SaveAction }>
> = {
  stall: { signal: "stalled", action: "revive_next_step" },
  silence: { signal: "ghosted", action: "reengage_email" },
};

/**
 * The EMAIL delivery of the proactive engine — as deals progress, get the rep
 * ready to send.
 *
 * For the top-ranked deals it writes the full follow-up email and, when the rep
 * has Gmail connected and we can resolve the prospect, drops it STRAIGHT INTO
 * their Gmail drafts — addressed and ready, so they send from their own inbox
 * with one click (nothing sends until they do). A digest email is the heads-up:
 * "these are drafted in your Gmail" for those, and the move + a review link for
 * the rest (Gmail not connected, or no recipient yet).
 *
 * Capped at the top 3 (cost + readability), ranked by urgency (stall > silence
 * > win-back). GATED: PROACTIVE_EMAIL_NUDGES_ENABLED must equal "1". Rep = the
 * deal's owner (for their Gmail) / the tenant owner_email (for the digest).
 * Never throws.
 */

const MAX_DRAFTS = 3;

const KIND_PRIORITY: Record<Nudge["kind"], number> = {
  stall: 0,
  silence: 1,
  winback: 2,
};

export async function emailNudgesForTenant(
  tenantId: string,
  nowMs: number,
): Promise<{ found: number; sent: boolean; gmailDrafts: number }> {
  try {
    const nudges = await scanTenantForNudges(tenantId, nowMs);
    if (nudges.length === 0) return { found: 0, sent: false, gmailDrafts: 0 };

    if (process.env.PROACTIVE_EMAIL_NUDGES_ENABLED !== "1") {
      return { found: nudges.length, sent: false, gmailDrafts: 0 };
    }

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("owner_email, first_name")
      .eq("id", tenantId)
      .maybeSingle();
    const repEmail = tenant?.owner_email ?? null;
    if (!repEmail) return { found: nudges.length, sent: false, gmailDrafts: 0 };

    const ranked = [...nudges].sort(
      (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
    );

    let gmailDrafts = 0;

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
        try {
          const { data: opp } = await supabaseAdmin
            .from("opportunities")
            .select("owner_id, account_id")
            .eq("id", n.opportunityId)
            .maybeSingle();
          const [{ data: sts }, { data: art }] = await Promise.all([
            supabaseAdmin
              .from("stakeholders")
              .select("name, email, committee_role")
              .eq("tenant_id", tenantId)
              .eq("account_id", opp?.account_id ?? ""),
            supabaseAdmin
              .from("execution_artifacts")
              .select("id, artifact")
              .eq("opportunity_id", n.opportunityId)
              .eq("is_current", true)
              .maybeSingle(),
          ]);

          const draft = await generateFollowupDraft(
            {
              opportunity: { id: n.opportunityId, name: n.dealName },
              stakeholders: sts ?? [],
            },
            (art?.artifact as PrepArtifact) ?? null,
            {},
          );
          const item = { ...base, emailSubject: draft.subject, emailBody: draft.bodyText };

          // Drop it straight into the rep's Gmail drafts when they've connected
          // Gmail and we resolved a recipient — so they send from their own
          // inbox. Best-effort: any gap falls back to the review link.
          const ownerId = opp?.owner_id as string | undefined;
          if (ownerId && draft.to) {
            try {
              const status = await getGmailConnectionStatus(ownerId);
              if (status.connected) {
                await createDraft(ownerId, {
                  to: draft.to,
                  subject: draft.subject,
                  bodyText: draft.bodyText,
                  bodyHtml: draft.bodyHtml,
                  attribution: draft.attribution,
                });
                gmailDrafts += 1;

                // Open a save episode: Mallin just dropped a ready-to-send
                // recovery move into the rep's own inbox on a live at-risk
                // deal — the concrete governed action. Idempotent (one open
                // episode per deal), gated per-tenant, best-effort so a ledger
                // write can never break the nudge digest. The counterfactual +
                // recovered/lost resolution are wired separately (resolveDealSave).
                const shape = SAVE_SHAPE[n.kind];
                if (shape && isDealSaveLedgerEnabled(tenantId)) {
                  try {
                    await recordDealSaveCandidate({
                      tenantId,
                      opportunityId: n.opportunityId,
                      riskSignal: shape.signal,
                      riskDriver: n.reason,
                      flaggedAt: new Date(nowMs).toISOString(),
                      // Value-crediting is deferred until there's a verified
                      // deal-value source on the opportunity — the ledger still
                      // counts the save, just without a dollar figure yet.
                      amountAtFlag: null,
                      actionTaken: shape.action,
                      actionArtifactId: (art?.id as string | undefined) ?? null,
                      // Draft lands in the owner's own inbox for one-click send,
                      // so the owner is the approver of record.
                      approvedByUserId: ownerId,
                    });
                  } catch {
                    /* ledger write is best-effort */
                  }
                }

                return { ...item, gmailDrafted: true };
              }
            } catch {
              /* Gmail draft is best-effort */
            }
          }
          return item;
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
    return { found: nudges.length, sent: res.ok, gmailDrafts };
  } catch {
    return { found: 0, sent: false, gmailDrafts: 0 };
  }
}
