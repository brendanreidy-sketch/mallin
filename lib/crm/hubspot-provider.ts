/**
 * ============================================================================
 *  HubSpot provider — implements CrmProvider against the HubSpot adapter
 * ============================================================================
 *
 *  Translation layer. The hubspot adapter (lib/adapters/hubspot.ts) speaks
 *  raw HubSpot v3 API; this file converts HubSpot's shapes to / from the
 *  neutral types in lib/crm/types.ts.
 *
 *  Callers in Pass 2/3/4/cockpit MUST NOT import this module directly —
 *  always go through lib/crm/index.ts.
 *
 *  Coupling rule: this file is the ONLY place that names HubSpot field
 *  conventions (mallin_meddpicc_*, dealname, hs_email_*, etc.). If a
 *  HubSpot field name leaks anywhere else in the codebase, it's a bug.
 * ============================================================================
 */

import type {
  Activity,
  ActivityType,
  Company,
  Contact,
  Deal,
  Note,
  NotePayload,
  ProviderCapabilities,
  ProviderRef,
  Task,
  TaskPayload,
} from "./types";
import type { CrmProvider } from "./providers";
import * as hs from "@/lib/adapters/hubspot";
import {
  getAccessTokenForTenant,
} from "@/lib/auth/hubspot-oauth";

const CAPS: ProviderCapabilities = {
  supports_notes: true,
  supports_tasks: true,
  supports_custom_fields: true,
  supports_threading: true, // HubSpot Engagements have native threading
  supports_meddpicc_native: false, // we install custom properties on first connect
  supports_email_engagements: true,
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function resolveExternalId(ref: ProviderRef | string): string {
  return typeof ref === "string" ? ref : ref.external_id;
}

function makeRef(externalId: string): ProviderRef {
  return { provider: "hubspot", external_id: externalId };
}

function parseAmount(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map a neutral field name (or pass-through provider-specific name) to the
 * HubSpot property the adapter should write. The neutral names live in
 * the contract; the provider-specific names are accepted for callers
 * that already know what they want (e.g. custom MEDDPICC fields).
 */
function fieldToHubspotProperty(neutralOrSpecific: string): string {
  switch (neutralOrSpecific) {
    case "meddpicc.champion":
      return "mallin_meddpicc_champion";
    case "meddpicc.competition":
      return "mallin_meddpicc_competition";
    case "meddpicc.metrics":
      return "mallin_meddpicc_metrics";
    case "meddpicc.economic_buyer":
      return "mallin_meddpicc_economic_buyer";
    case "meddpicc.decision_criteria":
      return "mallin_meddpicc_decision_criteria";
    case "meddpicc.decision_process":
      return "mallin_meddpicc_decision_process";
    case "meddpicc.paper_process":
      return "mallin_meddpicc_paper_process";
    case "meddpicc.identify_pain":
      return "mallin_meddpicc_identify_pain";
    default:
      return neutralOrSpecific; // pass-through (custom property name)
  }
}

// ─── Deal translation ──────────────────────────────────────────────────────
function hubspotDealToNeutral(hsDeal: hs.HubSpotDeal): Deal {
  const p = hsDeal.properties ?? {};
  return {
    id: hsDeal.id, // canonical = HS id for now; mallin substrate may map later
    ref: makeRef(hsDeal.id),
    name: p.dealname ?? "(unnamed)",
    amount: parseAmount(p.amount),
    stage: p.dealstage ?? "(unknown)",
    close_date: p.closedate ?? undefined,
    forecast_category: p.hs_forecast_category ?? undefined,
    meddpicc: {
      metrics: p.mallin_meddpicc_metrics ?? undefined,
      economic_buyer: p.mallin_meddpicc_economic_buyer ?? undefined,
      decision_criteria: p.mallin_meddpicc_decision_criteria ?? undefined,
      decision_process: p.mallin_meddpicc_decision_process ?? undefined,
      paper_process: p.mallin_meddpicc_paper_process ?? undefined,
      identify_pain: p.mallin_meddpicc_identify_pain ?? undefined,
      champion: p.mallin_meddpicc_champion ?? undefined,
      competition: p.mallin_meddpicc_competition ?? undefined,
    },
  };
}

function hubspotContactToNeutral(c: hs.HubSpotContact): Contact {
  const p = c.properties ?? {};
  const name = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
  return {
    id: c.id,
    ref: makeRef(c.id),
    name: name || p.email || "(unnamed contact)",
    email: p.email ?? undefined,
    title: p.jobtitle ?? undefined,
  };
}

function hubspotCompanyToNeutral(co: hs.HubSpotCompany): Company {
  const p = co.properties ?? {};
  return {
    id: co.id,
    ref: makeRef(co.id),
    name: p.name ?? "(unnamed company)",
    domain: p.domain ?? undefined,
    industry: p.industry ?? undefined,
    employee_count: p.numberofemployees
      ? Number(p.numberofemployees)
      : undefined,
  };
}

// ─── Note + Task creation via direct HubSpot API ──────────────────────────
async function createHubspotNote(
  tenantId: string,
  dealId: string,
  bodyHtml: string,
  occurredAt: string,
): Promise<{ id: string }> {
  const token = await getAccessTokenForTenant(tenantId);
  const noteRes = await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        hs_note_body: bodyHtml,
        hs_timestamp: occurredAt,
      },
    }),
  });
  if (!noteRes.ok) {
    throw new Error(
      `HubSpot create note failed: ${noteRes.status} ${await noteRes.text()}`,
    );
  }
  const note = (await noteRes.json()) as { id: string };

  // Associate to deal (associationTypeId 214 = note→deal)
  const assocRes = await fetch(
    `https://api.hubapi.com/crm/v4/objects/notes/${note.id}/associations/deals/${dealId}`,
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
  if (!assocRes.ok) {
    throw new Error(
      `HubSpot associate note→deal failed: ${assocRes.status} ${await assocRes.text()}`,
    );
  }
  return note;
}

async function createHubspotTask(
  tenantId: string,
  dealId: string,
  payload: TaskPayload,
): Promise<{ id: string }> {
  const token = await getAccessTokenForTenant(tenantId);
  const dueIso = payload.due_at
    ? new Date(payload.due_at).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Resolve owner via email if provided. For now we skip the owner lookup
  // and let HubSpot's "unassigned" default apply when assignee_email is
  // absent — owner-by-email resolution is a follow-up.
  const taskRes = await fetch("https://api.hubapi.com/crm/v3/objects/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        hs_task_subject: payload.subject,
        hs_task_body: payload.body ?? "",
        hs_task_status:
          payload.status === "completed"
            ? "COMPLETED"
            : payload.status === "in_progress"
              ? "IN_PROGRESS"
              : "NOT_STARTED",
        hs_task_priority:
          payload.priority === "high"
            ? "HIGH"
            : payload.priority === "low"
              ? "LOW"
              : "MEDIUM",
        hs_timestamp: dueIso,
      },
    }),
  });
  if (!taskRes.ok) {
    throw new Error(
      `HubSpot create task failed: ${taskRes.status} ${await taskRes.text()}`,
    );
  }
  const task = (await taskRes.json()) as { id: string };

  // Associate to deal (associationTypeId 216 = task→deal)
  const assocRes = await fetch(
    `https://api.hubapi.com/crm/v4/objects/tasks/${task.id}/associations/deals/${dealId}`,
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
  if (!assocRes.ok) {
    throw new Error(
      `HubSpot associate task→deal failed: ${assocRes.status} ${await assocRes.text()}`,
    );
  }
  return task;
}

// ─── The provider ──────────────────────────────────────────────────────────
export const hubspotProvider: CrmProvider = {
  name: "hubspot",
  capabilities: CAPS,

  async getDeal(tenantId, ref) {
    const externalId = resolveExternalId(ref);
    const hsDeal = await hs.getDeal(tenantId, externalId);
    return hubspotDealToNeutral(hsDeal);
  },

  async listDeals(tenantId, opts = {}) {
    const { deals, nextAfter } = await hs.listDeals(tenantId, opts);
    return {
      deals: deals.map(hubspotDealToNeutral),
      nextAfter,
    };
  },

  async getContact(tenantId, ref) {
    const externalId = resolveExternalId(ref);
    const c = await hs.getContact(tenantId, externalId);
    return hubspotContactToNeutral(c);
  },

  async getCompany(tenantId, ref) {
    const externalId = resolveExternalId(ref);
    const co = await hs.getCompany(tenantId, externalId);
    return hubspotCompanyToNeutral(co);
  },

  async listActivitiesForDeal(tenantId, ref, opts = {}) {
    const externalId = resolveExternalId(ref);
    const out: Activity[] = [];

    // Today: only emails are wired (Phase A). Calls/meetings/notes/tasks
    // can be added by extending the hubspot adapter with parallel functions.
    const types = opts.types ?? ["email"];
    if (types.includes("email")) {
      const emails = await hs.listEmailsForDeal(tenantId, externalId);
      for (const e of emails) {
        out.push({
          id: e.source_external_id,
          ref: makeRef(e.source_external_id),
          type: "email",
          occurred_at: e.sent_at,
          deal_id: externalId,
          subject: e.subject ?? undefined,
          direction: e.direction,
          from_email: e.from_email ?? undefined,
          from_name: e.from_name ?? undefined,
          to_emails: e.to_emails,
          cc_emails: e.cc_emails,
          snippet: e.snippet ?? undefined,
          thread_id: e.thread_id ?? undefined,
        });
      }
    }
    // calls/meetings/notes/tasks: not yet implemented in the adapter
    return out;
  },

  async getDealCustomFields(tenantId, ref, fields): Promise<Record<string, string | null>> {
    if (fields.length === 0) return {};
    const externalId = resolveExternalId(ref);
    const token = await (await import("@/lib/auth/hubspot-oauth")).getAccessTokenForTenant(tenantId);

    // HubSpot accepts a "properties" query param to control which
    // properties come back. No describe step needed; unknown properties
    // are simply omitted from the response.
    const qs = new URLSearchParams();
    for (const f of fields) qs.append("properties", f);
    const path = `/crm/v3/objects/deals/${encodeURIComponent(externalId)}?${qs.toString()}`;
    const res = await fetch(`https://api.hubapi.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `HubSpot getDealCustomFields failed: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as { properties?: Record<string, unknown> };
    const props = body.properties ?? {};

    const out: Record<string, string | null> = {};
    for (const f of fields) {
      const v = props[f];
      out[f] = v == null ? null : String(v);
    }
    return out;
  },

  async updateDealField(tenantId, ref, field, value) {
    const externalId = resolveExternalId(ref);
    const property = fieldToHubspotProperty(field);
    const stringValue = value == null ? "" : String(value);
    const updated = await hs.updateDealProperty(
      tenantId,
      externalId,
      property,
      stringValue,
    );
    return hubspotDealToNeutral(updated);
  },

  async createNote(tenantId, dealRef, payload): Promise<Note> {
    const dealId = resolveExternalId(dealRef);
    const occurredAt = payload.occurred_at ?? new Date().toISOString();
    const note = await createHubspotNote(
      tenantId,
      dealId,
      payload.body_html,
      occurredAt,
    );
    return {
      id: note.id,
      ref: makeRef(note.id),
      type: "note",
      occurred_at: occurredAt,
      deal_id: dealId,
      body_html: payload.body_html,
    };
  },

  async createTask(tenantId, dealRef, payload): Promise<Task> {
    const dealId = resolveExternalId(dealRef);
    const task = await createHubspotTask(tenantId, dealId, payload);
    return {
      id: task.id,
      ref: makeRef(task.id),
      type: "task",
      occurred_at: new Date().toISOString(),
      deal_id: dealId,
      subject: payload.subject,
      status: payload.status ?? "open",
      priority: payload.priority,
      due_at: payload.due_at,
      assignee_email: payload.assignee_email,
      body: payload.body,
    };
  },
};
