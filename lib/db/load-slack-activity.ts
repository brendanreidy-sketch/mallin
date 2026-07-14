/**
 * ============================================================================
 *  load-slack-activity — read recent outbound Slack posts for a deal
 * ============================================================================
 *
 *  Reads from slack_outbound_posts (migration 006). The audit table
 *  records every Mallin → Slack post; this helper queries it for the
 *  cockpit's SlackActivity panel.
 *
 *  Match strategy:
 *    The opportunity_id stored on slack_outbound_posts can be either:
 *      - the substrate UUID (when calls/process passes through lib/crm)
 *      - the external CRM id ("006..." or HubSpot deal id) when the
 *        caller had the external id at hand
 *
 *    To handle both, the caller passes whichever ids they have and the
 *    query matches on ANY of them.
 *
 *  Returns the most recent N posts within the last 7 days. Failed posts
 *  (ok=false) are included with an error message so the rep sees
 *  delivery issues.
 * ============================================================================
 */

import { supabaseAdmin } from "./client";

export interface SlackActivityRow {
  id: string;
  posted_at: string;
  surface: "dm" | "channel";
  channel: string | null;
  channel_id: string | null;
  message_ts: string | null;
  severity: string;
  rule_id: string;
  rule_label: string | null;
  payload_summary: string;
  ok: boolean;
  error: string | null;
}

export async function loadSlackActivityForDeal(
  candidateIds: string[],
  opts: { limit?: number; sinceDays?: number } = {},
): Promise<SlackActivityRow[]> {
  const ids = candidateIds.filter(Boolean);
  if (ids.length === 0) return [];

  const limit = Math.min(opts.limit ?? 10, 25);
  const sinceDays = opts.sinceDays ?? 7;
  const sinceIso = new Date(
    Date.now() - sinceDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("slack_outbound_posts")
    .select(
      "id, posted_at, surface, channel, channel_id, message_ts, severity, rule_id, rule_label, payload_summary, ok, error",
    )
    .in("opportunity_id", ids)
    .gte("posted_at", sinceIso)
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(
      `[load-slack-activity] query failed: ${error.message}`,
    );
    return [];
  }
  return (data ?? []) as SlackActivityRow[];
}

/**
 * Build a Slack deep-link to a posted message if we have channel_id +
 * message_ts. Falls back to undefined when we don't — callers should
 * skip rendering the "Open →" link in that case.
 *
 * Format: https://<workspace>.slack.com/archives/<channel_id>/p<ts-no-dot>
 */
export function buildSlackDeepLink(
  row: Pick<SlackActivityRow, "channel_id" | "message_ts">,
  workspaceDomain?: string,
): string | undefined {
  if (!row.channel_id || !row.message_ts) return undefined;
  const tsNoDot = row.message_ts.replace(/\./g, "");
  const domain = workspaceDomain ?? "app";
  return `https://${domain}.slack.com/archives/${row.channel_id}/p${tsNoDot}`;
}
