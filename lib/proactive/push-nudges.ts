import { postToSlack } from "@/lib/adapters/slack";
import { scanTenantForNudges, type Nudge } from "./detect-nudges";

/**
 * The delivery half of the proactive engine — turns detected nudges into Slack
 * messages and sends them.
 *
 * SAFETY: this is gated two ways so nothing ever goes out unsolicited —
 *   1. PROACTIVE_NUDGES_ENABLED must equal "1" (OFF by default). Until then the
 *      detection still runs, but `sent` stays 0.
 *   2. postToSlack no-ops when no webhook is configured.
 * So on a fresh deploy this delivers nothing until BOTH a webhook is set and the
 * flag is flipped on. Detection (scanTenantForNudges) is always safe to run.
 */

const APP_BASE = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://mallin.io";

function nudgeMessage(n: Nudge): {
  text: string;
  blocks: Array<{ type: string; [k: string]: unknown }>;
} {
  const base = APP_BASE.startsWith("http") ? APP_BASE : `https://${APP_BASE}`;
  const url = `${base}/prep?dealId=${encodeURIComponent(n.opportunityId)}`;
  const icon = n.kind === "winback" ? "🔄" : n.kind === "stall" ? "⚠️" : "🔕";
  return {
    text: n.headline,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `${icon} *${n.headline}*` } },
      { type: "section", text: { type: "mrkdwn", text: `${n.reason}\n\n→ *Move:* ${n.move}` } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open the deal →", emoji: true },
            url,
            style: "primary",
          },
        ],
      },
    ],
  };
}

/**
 * Scan a tenant and push each nudge to Slack. Returns what it found and how many
 * actually sent (0 unless the send path is enabled and a webhook is set). Never
 * throws — one failed post never aborts the rest.
 */
export async function pushNudgesForTenant(
  tenantId: string,
  nowMs: number,
): Promise<{ found: number; sent: number }> {
  const enabled = process.env.PROACTIVE_NUDGES_ENABLED === "1";
  const nudges = await scanTenantForNudges(tenantId, nowMs);
  if (!enabled || nudges.length === 0) return { found: nudges.length, sent: 0 };

  let sent = 0;
  for (const n of nudges) {
    try {
      const res = await postToSlack(nudgeMessage(n), "manager");
      if (res.ok) sent++;
    } catch {
      /* one failed post never aborts the rest */
    }
  }
  return { found: nudges.length, sent };
}
