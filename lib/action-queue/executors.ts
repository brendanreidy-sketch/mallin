/**
 * ============================================================================
 *  Action queue — executors
 * ============================================================================
 *
 *  Each action_type has an executor function. Executors:
 *    - take the typed payload + the queue row (for context)
 *    - perform the side-effect (write CRM, send email, etc.)
 *    - return ExecutionResult with provenance (executor name, external
 *      object id/type/url) so the queue row's ledger fields can be set
 *
 *  Executors NEVER throw. They wrap failures in ExecutionResult.ok=false
 *  so the queue state machine in queue.ts can stay simple.
 * ============================================================================
 */

import { updateDealField } from "@/lib/crm";
import { isTenantDemo } from "@/lib/auth/tenant-context";
import type {
  ActionPayload,
  CrmUpdatePayload,
  DeferralPayload,
  EmailDraftPayload,
  EmailSendPayload,
  ExecutionResult,
  ManagerEscalatePayload,
  QueuedAction,
  RiskAckPayload,
} from "./types";

/**
 * Action types whose execution is purely internal — they don't touch
 * any external system (CRM, Gmail, Slack), so they're safe to run
 * unchanged for demo tenants. Excluded from the demo short-circuit.
 *
 * - risk_ack: inserts a row into the `touches` table (substrate-internal)
 * - deferral: updates another queue row's status (queue-internal)
 */
const DEMO_SAFE_ACTION_TYPES: ReadonlySet<ActionPayload["type"]> = new Set([
  "risk_ack",
  "deferral",
]);

export async function execute(
  action: QueuedAction,
): Promise<ExecutionResult> {
  try {
    const payload = action.payload as ActionPayload;

    // Defense-in-depth simulation-mode guard. Even though the API
    // route at /api/queue/approve also checks is_demo, executors run
    // close to the side-effects (Gmail, CRM, Slack), so the safety
    // belt belongs here too. Type-level: the is_demo column on
    // tenants is the single source of truth.
    if (!DEMO_SAFE_ACTION_TYPES.has(payload.type)) {
      if (await isTenantDemo(action.tenant_id)) {
        return {
          ok: true,
          executor: `demo_simulated_${payload.type}`,
          external_object_id: `demo-noop-${Date.now()}`,
          external_object_type: payload.type,
        };
      }
    }

    switch (payload.type) {
      case "crm_update":
        return await executeCrmUpdate(action, payload);
      case "email_send":
        return await executeEmailSend(action, payload);
      case "email_draft":
        return await executeEmailDraft(action, payload);
      case "risk_ack":
        return await executeRiskAck(action, payload);
      case "manager_escalate":
        return await executeManagerEscalate(action, payload);
      case "deferral":
        return await executeDeferral(action, payload);
      default: {
        const _exhaustive: never = payload;
        return {
          ok: false,
          executor: "unknown",
          error: `unknown action type: ${JSON.stringify(_exhaustive)}`,
        };
      }
    }
  } catch (err: unknown) {
    return {
      ok: false,
      executor: "execute_dispatch",
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ─── crm_update ────────────────────────────────────────────────────────────
async function executeCrmUpdate(
  action: QueuedAction,
  payload: CrmUpdatePayload,
): Promise<ExecutionResult> {
  try {
    const updated = await updateDealField(
      action.tenant_id,
      payload.deal_ref,
      payload.field,
      payload.value,
    );
    return {
      ok: true,
      executor: "lib_crm_updateDealField",
      external_object_id: updated.id,
      external_object_type: `${updated.ref.provider}.deal`,
      result: { provider: updated.ref.provider, external_id: updated.ref.external_id },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      executor: "lib_crm_updateDealField",
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ─── email_send ────────────────────────────────────────────────────────────
async function executeEmailSend(
  action: QueuedAction,
  payload: EmailSendPayload,
): Promise<ExecutionResult> {
  // Use the Gmail send path. We could call the route handler, but
  // calling the helper directly avoids a network hop + reuses the
  // token-resolution path.
  try {
    const { getAccessTokenForUser } = await import("@/lib/auth/gmail-oauth");
    const accessToken = await getAccessTokenForUser(action.user_id);

    const mime = buildMime(payload);
    const raw = Buffer.from(mime).toString("base64url");
    const body = payload.thread_id
      ? { raw, threadId: payload.thread_id }
      : { raw };

    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      return {
        ok: false,
        executor: "gmail_messages_send",
        error: `Gmail send failed: ${res.status} ${(await res.text()).slice(0, 300)}`,
      };
    }

    const sent = (await res.json()) as { id?: string; threadId?: string };
    const messageId = sent.id ?? "";
    return {
      ok: true,
      executor: "gmail_messages_send",
      external_object_id: messageId,
      external_object_type: "gmail.message",
      external_object_url: messageId
        ? `https://mail.google.com/mail/u/0/#sent/${messageId}`
        : undefined,
      result: { message_id: messageId, thread_id: sent.threadId },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      executor: "gmail_messages_send",
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ─── email_draft ───────────────────────────────────────────────────────────
async function executeEmailDraft(
  action: QueuedAction,
  payload: EmailDraftPayload,
): Promise<ExecutionResult> {
  try {
    const { createDraft } = await import("@/lib/adapters/gmail");
    const draft = await createDraft(action.user_id, {
      to: payload.to,
      subject: payload.subject,
      bodyText: payload.body_text,
      bodyHtml: payload.body_html,
      threadId: payload.thread_id,
    });
    return {
      ok: true,
      executor: "gmail_drafts_create",
      external_object_id: draft.id,
      external_object_type: "gmail.draft",
      external_object_url: `https://mail.google.com/mail/u/0/#drafts`,
      result: { draft_id: draft.id, thread_id: draft.threadId },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      executor: "gmail_drafts_create",
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ─── risk_ack ──────────────────────────────────────────────────────────────
async function executeRiskAck(
  action: QueuedAction,
  payload: RiskAckPayload,
): Promise<ExecutionResult> {
  // Risk acknowledgment is a substrate write — we log the rep's "I did X
  // about this risk" as a touch on the opportunity. The touches table
  // already exists; this is just a structured write.
  try {
    const { supabaseAdmin } = await import("@/lib/db/client");
    const { data, error } = await supabaseAdmin
      .from("touches")
      .insert({
        tenant_id: action.tenant_id,
        opportunity_id: action.opportunity_id,
        occurred_at: new Date().toISOString(),
        subject: `Risk ack: ${payload.risk_title}`,
        body: payload.action_taken,
        source_system: "mallin_cockpit_risk_ack",
        source_external_id: `risk_ack:${payload.risk_id}:${action.id}`,
        logged_by_user_id: action.user_id,
      })
      .select()
      .single();
    if (error || !data) {
      return {
        ok: false,
        executor: "substrate_touches_insert",
        error: error?.message ?? "no row returned",
      };
    }
    return {
      ok: true,
      executor: "substrate_touches_insert",
      external_object_id: (data as { id: string }).id,
      external_object_type: "mallin.touch",
      result: { touch_id: (data as { id: string }).id },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      executor: "substrate_touches_insert",
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ─── manager_escalate ─────────────────────────────────────────────────────
async function executeManagerEscalate(
  action: QueuedAction,
  payload: ManagerEscalatePayload,
): Promise<ExecutionResult> {
  // Use the Slack DM path when a manager Slack ID is configured.
  try {
    const { postSlackDM } = await import("@/lib/adapters/slack");
    const managerId = (
      payload.manager_slack_id ?? process.env.SLACK_MANAGER_USER_ID ?? ""
    ).trim();
    if (!managerId) {
      return {
        ok: false,
        executor: "slack_postSlackDM",
        error: "no manager Slack id configured",
      };
    }
    const result = await postSlackDM(
      {
        text: `🚨 Manual escalation from rep: ${payload.reason}`,
      },
      [managerId],
    );
    if (!result.ok) {
      return {
        ok: false,
        executor: "slack_postSlackDM",
        error: result.error ?? `Slack DM failed (${result.status})`,
      };
    }
    return {
      ok: true,
      executor: "slack_postSlackDM",
      external_object_id: result.message_ts ?? "",
      external_object_type: "slack.message",
      result: {
        channel_id: result.channel_id,
        message_ts: result.message_ts,
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      executor: "slack_postSlackDM",
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ─── deferral ──────────────────────────────────────────────────────────────
async function executeDeferral(
  _action: QueuedAction,
  payload: DeferralPayload,
): Promise<ExecutionResult> {
  // Deferral is meta — it sets another row's status to 'deferred'.
  // The cockpit invokes this directly via the queue API (defer()), so
  // having an executor for it is mostly for symmetry / Mallin-proactive
  // future use. For v1, just record the intent.
  return {
    ok: true,
    executor: "noop_deferral",
    result: {
      defer_action_id: payload.defer_action_id,
      defer_until: payload.defer_until,
      reason: payload.reason ?? null,
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function buildMime(p: EmailSendPayload): string {
  const headers = [`To: ${p.to}`, `Subject: ${p.subject}`];
  if (p.cc) headers.push(`Cc: ${p.cc}`);
  if (p.bcc) headers.push(`Bcc: ${p.bcc}`);
  headers.push("MIME-Version: 1.0");
  headers.push(
    'Content-Type: multipart/alternative; boundary="MALLIN_QUEUE_BOUNDARY"',
  );
  const textPart = [
    "--MALLIN_QUEUE_BOUNDARY",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    p.body_text,
  ].join("\r\n");
  const htmlPart = [
    "--MALLIN_QUEUE_BOUNDARY",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    p.body_html,
  ].join("\r\n");
  const closing = "--MALLIN_QUEUE_BOUNDARY--";
  return [headers.join("\r\n"), "", textPart, "", htmlPart, "", closing].join(
    "\r\n",
  );
}
