/**
 * ============================================================================
 *  HubSpot Notes sink — EscalationAlert → Note on the HubSpot deal record
 * ============================================================================
 *
 *  Mirrors Slack's role in the alert flow, but inside the rep's CRM. For
 *  HubSpot customers who don't live in Slack all day, the deal record is
 *  where they review pipeline — so dropping the alert there gets it
 *  visible without forcing a tool switch.
 *
 *  Mechanism:
 *
 *    1. POST /crm/v3/objects/notes with the rendered alert body
 *    2. POST /crm/v3/objects/notes/{noteId}/associations/deals/{dealId}/note_to_deal
 *       (associates the note with the deal so it shows in the deal's
 *       activity stream)
 *
 *  Optional escalation:
 *
 *    For severity == "escalate_to_manager", we ALSO create a HubSpot Task
 *    assigned to the manager's HubSpot owner (if ctx.hubspot_manager_owner_id
 *    is set). The task surfaces the alert in the manager's task queue with
 *    a deadline tied to the next call.
 *
 *  Required HubSpot scopes (configured in the dev app):
 *    crm.objects.notes.write
 *    (Optional, for the task surface)
 *    crm.objects.deals.read
 *    The manager-task path additionally needs:
 *    (no extra scope — owners are looked up via deal owner-id field
 *     which is read-only in the deal record)
 *
 *  Errors are never thrown — wrapped in AlertSinkResult.
 *
 *  This sink only fires when:
 *    - The tenant has connected HubSpot (token row exists)
 *    - ctx.hubspot_deal_id is set (we know which HubSpot record to
 *      attach the note to)
 * ============================================================================
 */

import type { EscalationAlert } from "./methodology-escalation";
import type {
  AlertSink,
  AlertSinkContext,
  AlertSinkResult,
} from "./alert-sinks";
import { getAccessTokenForTenant, getHubspotConnectionStatus } from "@/lib/auth/hubspot-oauth";

interface HubSpotNote {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
  };
}

interface HubSpotTask {
  id: string;
  properties: {
    hs_task_subject?: string;
    hs_task_body?: string;
  };
}

export const hubspotNotesSink: AlertSink = {
  name: "hubspot_notes",

  async isConfigured(tenantId: string): Promise<boolean> {
    const status = await getHubspotConnectionStatus(tenantId);
    return status.connected;
  },

  async send(
    alert,
    ctx: AlertSinkContext,
    tenantId: string,
  ): Promise<AlertSinkResult> {
    if (!ctx.hubspot_deal_id) {
      return {
        sink: "hubspot_notes",
        ok: false,
        error:
          "no_hubspot_deal_id — sink skipped (this deal may live in Salesforce only).",
      };
    }

    const token = await getAccessTokenForTenant(tenantId);
    const noteBody = renderNoteHtml(alert, ctx);

    try {
      const note = await createNote(token, noteBody);
      await associateNoteToDeal(token, note.id, ctx.hubspot_deal_id);

      // Manager escalation: also create a HubSpot Task in the manager's
      // queue so they have a queue item, not just a CRM record entry.
      let taskId: string | undefined;
      if (
        alert.severity === "escalate_to_manager" &&
        ctx.hubspot_manager_owner_id
      ) {
        const task = await createManagerTask(
          token,
          alert,
          ctx,
          ctx.hubspot_manager_owner_id,
        );
        await associateTaskToDeal(token, task.id, ctx.hubspot_deal_id);
        taskId = task.id;
      }

      return {
        sink: "hubspot_notes",
        ok: true,
        detail: {
          note_id: note.id,
          task_id: taskId,
          deal_id: ctx.hubspot_deal_id,
        },
      };
    } catch (err: unknown) {
      return {
        sink: "hubspot_notes",
        ok: false,
        error: err instanceof Error ? err.message : "unknown_error",
      };
    }
  },
};

// ============================================================================
//  Rendering — turn an alert into HubSpot Note HTML
// ============================================================================
//  HubSpot Notes render limited HTML (Sanitized: p, strong, em, br, ul, li,
//  a, blockquote). We use a small, safe subset.
// ============================================================================

function renderNoteHtml(alert: EscalationAlert, ctx: AlertSinkContext): string {
  const sevTag =
    alert.severity === "escalate_to_manager"
      ? "<strong>🚨 ESCALATE TO MANAGER</strong>"
      : "<strong>⚠️ Verification warning</strong>";
  const dealLine = ctx.deal_name
    ? `<p><strong>${escapeHtml(ctx.deal_name)}</strong>${
        ctx.deal_amount ? ` · ${escapeHtml(ctx.deal_amount)}` : ""
      }${ctx.deal_stage ? ` · ${escapeHtml(ctx.deal_stage)}` : ""}</p>`
    : "";
  const ruleLine = `<p><em>${escapeHtml(alert.rule_label)}</em></p>`;
  const diagnosis = alert.rep_message
    ? `<p>${escapeHtml(alert.rep_message)}</p>`
    : "";
  const action =
    alert.next_call_ask &&
    "question" in alert.next_call_ask &&
    typeof alert.next_call_ask.question === "string"
      ? `<p><strong>Do this next:</strong> ${escapeHtml(
          alert.next_call_ask.question as string,
        )}</p>`
      : "";
  const managerNote = alert.manager_message
    ? `<p><strong>For your manager:</strong> ${escapeHtml(alert.manager_message)}</p>`
    : "";
  const attribution = `<p><em>— Mallin · ${new Date().toISOString().slice(0, 10)}</em></p>`;

  return [sevTag, dealLine, ruleLine, diagnosis, action, managerNote, attribution]
    .filter(Boolean)
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================================
//  HubSpot API helpers
// ============================================================================

async function createNote(token: string, bodyHtml: string): Promise<HubSpotNote> {
  const res = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        hs_note_body: bodyHtml,
        hs_timestamp: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot create note failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as HubSpotNote;
}

async function associateNoteToDeal(
  token: string,
  noteId: string,
  dealId: string,
): Promise<void> {
  // Type ID 214 = note → deal association. HubSpot's "default
  // association types" — see https://developers.hubspot.com/docs/api/crm/associations
  const res = await fetch(
    `https://api.hubapi.com/crm/v4/objects/notes/${noteId}/associations/deals/${dealId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 },
      ]),
    },
  );
  if (!res.ok) {
    throw new Error(
      `HubSpot associate note→deal failed: ${res.status} ${await res.text()}`,
    );
  }
}

async function createManagerTask(
  token: string,
  alert: EscalationAlert,
  ctx: AlertSinkContext,
  managerOwnerId: number,
): Promise<HubSpotTask> {
  const subject = `Mallin escalation — ${ctx.deal_name ?? "deal"} — ${alert.rule_label}`;
  const body =
    alert.manager_message ??
    alert.rep_message ??
    "Mallin flagged a manager-level escalation. See associated Note on the deal.";

  // Due in 24 hours.
  const dueInMs = Date.now() + 24 * 60 * 60 * 1000;

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        hs_task_subject: subject,
        hs_task_body: body,
        hs_task_status: "NOT_STARTED",
        hs_task_priority: "HIGH",
        hs_timestamp: new Date(dueInMs).toISOString(),
        hubspot_owner_id: managerOwnerId,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot create task failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as HubSpotTask;
}

async function associateTaskToDeal(
  token: string,
  taskId: string,
  dealId: string,
): Promise<void> {
  // Type ID 216 = task → deal association.
  const res = await fetch(
    `https://api.hubapi.com/crm/v4/objects/tasks/${taskId}/associations/deals/${dealId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 },
      ]),
    },
  );
  if (!res.ok) {
    throw new Error(
      `HubSpot associate task→deal failed: ${res.status} ${await res.text()}`,
    );
  }
}
