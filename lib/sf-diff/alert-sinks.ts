/**
 * ============================================================================
 *  Alert sinks — unified interface for surfacing EscalationAlerts
 * ============================================================================
 *
 *  Why this abstraction:
 *
 *  Up to now there was one alert sink: Slack. The verification framework
 *  fires an EscalationAlert, slack-sink turns it into a Block Kit
 *  message + DMs / posts. Single coupling.
 *
 *  As we add HubSpot Notes / Tasks (and later: Teams, email digest,
 *  webhook out), every NEW path was going to need its own bespoke
 *  fan-out in calls/process. That doesn't scale.
 *
 *  This file defines an `AlertSink` interface and a `sendToAllSinks`
 *  helper. Each sink implementation knows:
 *
 *    1. Whether it's configured for a given tenant (env + per-tenant
 *       state like OAuth tokens, channel IDs, etc.)
 *    2. How to render an EscalationAlert into its native format
 *    3. How to send + recover from transport errors
 *
 *  The pipeline (calls/process) becomes:
 *
 *    for (const alert of detectAllEscalations(...)) {
 *      const results = await sendToAllSinks(alert, ctx, tenantId);
 *      auditAll(results);
 *    }
 *
 *  Per-tenant sink toggling lives in the optional `enabledSinks` list
 *  passed in — defaults to all configured sinks. Future: a tenant
 *  settings table.
 * ============================================================================
 */

import type { EscalationAlert } from "./methodology-escalation";

/**
 * Shared context every sink receives. Sink-specific fields are
 * optional — Slack ignores HubSpot IDs and vice versa.
 */
export interface AlertSinkContext {
  // Universal — every sink uses these for the alert content
  deal_name: string;
  account_name?: string;
  deal_stage?: string;
  deal_amount?: string;
  rep_name?: string;
  rep_email?: string;
  last_call_label?: string;
  /** URL back to the relevant deal record — used as the alert footer. */
  deal_url?: string;

  // Slack-specific
  rep_slack_id?: string;
  manager_slack_id?: string;

  // HubSpot-specific
  hubspot_deal_id?: string;
  /** HubSpot Owner ID of the manager to assign the loop-in task to. */
  hubspot_manager_owner_id?: number;
}

export interface AlertSinkResult {
  sink: string;
  ok: boolean;
  /** Sink-specific success payload (post ID, draft ID, etc.) */
  detail?: unknown;
  /** Present only if ok === false */
  error?: string;
}

export interface AlertSink {
  /** Stable identifier for logging + audit table */
  name: string;
  /** True when the sink is ready for this tenant. */
  isConfigured(tenantId: string): Promise<boolean>;
  /** Render + send. Must NEVER throw — wrap errors in the result. */
  send(
    alert: EscalationAlert,
    ctx: AlertSinkContext,
    tenantId: string,
  ): Promise<AlertSinkResult>;
}

/**
 * Fan an alert out to every configured sink. Errors are isolated per
 * sink — one sink failing doesn't break the others.
 *
 * @param enabledSinks  Optional whitelist of sink names. If unset, all
 *                      provided sinks are attempted. Each sink still
 *                      runs its own isConfigured() check.
 */
export async function sendToAllSinks(
  alert: EscalationAlert,
  ctx: AlertSinkContext,
  tenantId: string,
  sinks: AlertSink[],
  enabledSinks?: string[],
): Promise<AlertSinkResult[]> {
  const filtered = enabledSinks
    ? sinks.filter((s) => enabledSinks.includes(s.name))
    : sinks;

  const results = await Promise.all(
    filtered.map(async (s) => {
      try {
        const configured = await s.isConfigured(tenantId);
        if (!configured) {
          return {
            sink: s.name,
            ok: false,
            error: "not_configured",
          };
        }
        return await s.send(alert, ctx, tenantId);
      } catch (err: unknown) {
        return {
          sink: s.name,
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }),
  );
  return results;
}
