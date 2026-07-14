/**
 * ============================================================================
 *  Slack outbound audit — records every Mallin → Slack post
 * ============================================================================
 *
 *  Called from slack-sink.ts after sendEscalationToSlack resolves
 *  (success or failure). Writes a row to slack_outbound_posts. The
 *  cockpit's SlackActivity panel reads from this table.
 *
 *  Failure mode: if the audit insert fails, slack-sink still reports
 *  the post as successful (it was). The audit miss is logged but does
 *  NOT bubble up — losing audit visibility on one alert is better than
 *  failing the rep-visible flow because of an unrelated DB hiccup.
 * ============================================================================
 */

import type { EscalationAlert } from "./methodology-escalation";
import type { SlackPostResult } from "../adapters/slack";

export interface SlackOutboundAuditInput {
  alert: EscalationAlert;
  /** The opportunity identifier carried by the caller — usually the
   *  external CRM id (SF "006..." or HubSpot deal id). Optional because
   *  some pipeline paths fire alerts before the substrate row is linked. */
  opportunity_id?: string;
  /** Tenant UUID when the caller has it (cockpit flows do). */
  tenant_id?: string;
  /** Human-readable target — "#acme-deal" or "Manager DM". */
  channel?: string;
  /** The result returned by slack-sink. ok=false rows are still
   *  audited so we can see failure patterns. */
  result: SlackPostResult;
}

/**
 * One-line "HIGH · Champion-commitment warning" summary the UI uses
 * as the body of the activity row. Cheap to derive at write time so
 * the read path doesn't have to format.
 */
function buildPayloadSummary(alert: EscalationAlert): string {
  const sev =
    alert.severity === "escalate_to_manager"
      ? "HIGH"
      : alert.severity === "warn"
        ? "WARN"
        : "INFO";
  return `${sev} · ${alert.rule_label}`;
}

/**
 * Write the audit row. Lazy-imports the supabase admin client so this
 * module is unit-testable in isolation.
 */
export async function auditSlackOutbound(
  input: SlackOutboundAuditInput,
): Promise<void> {
  const supabaseAdmin = (await import("../db/client")).supabaseAdmin;

  const surface = input.result.webhook_used === "dm" ? "dm" : "channel";

  const row = {
    opportunity_id: input.opportunity_id ?? null,
    tenant_id: input.tenant_id ?? null,
    rule_id: input.alert.rule_id,
    rule_label: input.alert.rule_label,
    severity: input.alert.severity,
    payload_summary: buildPayloadSummary(input.alert),
    raw_alert: input.alert as unknown as Record<string, unknown>,
    surface,
    channel: input.channel ?? null,
    channel_id: input.result.channel_id ?? null,
    message_ts: input.result.message_ts ?? null,
    ok: input.result.ok,
    error: input.result.ok ? null : (input.result.error ?? null),
  };

  const { error } = await supabaseAdmin
    .from("slack_outbound_posts")
    .insert(row);

  if (error) {
    // Don't bubble — see header docblock. Log only.
    console.warn(
      `[slack-outbound-audit] insert failed: ${error.message} ` +
        `(rule=${input.alert.rule_id}, severity=${input.alert.severity})`,
    );
  }
}
