/**
 * ============================================================================
 *  Salesforce provider — implements CrmProvider against the SF adapter
 * ============================================================================
 *
 *  Translation layer between neutral types and Salesforce shapes.
 *
 *  The SF adapter (lib/adapters/salesforce.ts) authenticates via OAuth 2.0
 *  Client Credentials at the connected-app level — currently SINGLE-TENANT
 *  (one SF org per Mallin deployment, via SF_CLIENT_ID/SF_CLIENT_SECRET
 *  env vars). When per-tenant SF OAuth is wired (analogous to the
 *  per-tenant HubSpot flow), this provider's methods will take the
 *  tenantId argument seriously. For now, tenantId is logged but the
 *  underlying connection is shared.
 *
 *  Coupling rule: this file is the ONLY place that names Salesforce
 *  field conventions (Mallin_Champion__c, StageName, etc.). If a SF
 *  field name leaks anywhere else, it's a bug.
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
import * as sf from "@/lib/adapters/salesforce";

const CAPS: ProviderCapabilities = {
  supports_notes: true,
  supports_tasks: true,
  supports_custom_fields: true,
  supports_threading: false, // SF Notes/Tasks are flat; threading via EmailMessage is separate
  supports_meddpicc_native: false,
  supports_email_engagements: false, // not yet wired
};

function resolveExternalId(ref: ProviderRef | string): string {
  return typeof ref === "string" ? ref : ref.external_id;
}

function makeRef(externalId: string): ProviderRef {
  return { provider: "salesforce", external_id: externalId };
}

/**
 * Neutral field name → Salesforce API name. Mallin custom fields use
 * the org-level naming convention Mallin_X__c. Standard fields keep
 * their SF API names.
 */
function fieldToSfName(neutralOrSpecific: string): string {
  switch (neutralOrSpecific) {
    case "meddpicc.champion":
      return "Mallin_Champion__c";
    case "meddpicc.competition":
      return "Mallin_Competition__c";
    case "meddpicc.metrics":
      return "Mallin_Metrics__c";
    case "meddpicc.economic_buyer":
      return "Mallin_Economic_Buyer__c";
    case "meddpicc.decision_criteria":
      return "Mallin_Decision_Criteria__c";
    case "meddpicc.decision_process":
      return "Mallin_Decision_Process__c";
    case "meddpicc.paper_process":
      return "Mallin_Paper_Process__c";
    case "meddpicc.identify_pain":
      return "Mallin_Identify_Pain__c";
    case "next_step":
      return "NextStep";
    default:
      return neutralOrSpecific; // pass-through (caller knows the SF API name)
  }
}

function sfOppToNeutral(o: sf.SfOpportunity): Deal {
  return {
    id: o.Id,
    ref: makeRef(o.Id),
    name: o.Name,
    amount: o.Amount ?? undefined,
    stage: o.StageName,
    close_date: o.CloseDate ?? undefined,
    meddpicc: {
      // Mallin custom MEDDPICC fields aren't on every org. Surfacing them
      // requires a per-tenant describe pass; left as undefined here.
    },
  };
}

function sfAccountToNeutralCompany(a: sf.SfAccount): Company {
  return {
    id: a.Id,
    ref: makeRef(a.Id),
    name: a.Name,
    industry: a.Industry ?? undefined,
    domain: a.Website ?? undefined,
  };
}

// ─── The provider ──────────────────────────────────────────────────────────
export const salesforceProvider: CrmProvider = {
  name: "salesforce",
  capabilities: CAPS,

  async getDeal(_tenantId, ref) {
    const externalId = resolveExternalId(ref);
    const opp = await sf.getOpportunity(externalId);
    if (!opp) {
      throw new Error(`Salesforce Opportunity ${externalId} not found`);
    }
    return sfOppToNeutral(opp as unknown as sf.SfOpportunity);
  },

  async listDeals(_tenantId, opts = {}) {
    const limit = Math.min(opts.limit ?? 100, 200);
    const opps = await sf.listOpenOpportunities(limit);
    return {
      deals: opps.map(sfOppToNeutral),
      // SF adapter doesn't expose pagination cursor today.
      nextAfter: undefined,
    };
  },

  async getContact(_tenantId, _ref): Promise<Contact> {
    throw new Error(
      "salesforceProvider.getContact: SF adapter doesn't expose getContact yet. " +
        "Wire lib/adapters/salesforce.getContact then translate here.",
    );
  },

  async getCompany(_tenantId, ref) {
    const externalId = resolveExternalId(ref);
    const account = await sf.getAccount(externalId);
    if (!account) {
      throw new Error(`Salesforce Account ${externalId} not found`);
    }
    return sfAccountToNeutralCompany(account);
  },

  async listActivitiesForDeal(_tenantId, _ref, _opts = {}) {
    // SF adapter doesn't yet expose activity queries (EmailMessage,
    // Event, Task lookups by WhatId). When it does, add translation here.
    return [];
  },

  async getDealCustomFields(_tenantId, ref, fields): Promise<Record<string, string | null>> {
    if (fields.length === 0) return {};
    const externalId = resolveExternalId(ref);

    // SF: filter to fields that exist in this org's Opportunity schema
    // BEFORE querying — avoids "INVALID_FIELD" 400s on dev orgs that
    // don't have Northwind customs installed. Same pattern as /api/sf/diff
    // and pre-D.3 calls/process route.
    const conn = await sf.getConnection();
    const desc = await sf.describeOpportunity();
    const orgFields = new Set(desc.fields.map((f) => f.name));
    const queryableFields = fields.filter((f) => orgFields.has(f));
    if (queryableFields.length === 0) {
      // Return an all-null record so consumers don't blow up on
      // missing keys.
      return Object.fromEntries(fields.map((f) => [f, null]));
    }
    const safeId = externalId.replace(/[^A-Za-z0-9]/g, "");
    const fieldList = queryableFields.join(", ");
    const sfQ = await conn.query<Record<string, unknown>>(
      `SELECT ${fieldList} FROM Opportunity WHERE Id = '${safeId}' LIMIT 1`,
    );
    const record = sfQ.records[0] ?? {};

    const out: Record<string, string | null> = {};
    for (const f of fields) {
      const v = record[f];
      out[f] = v == null ? null : String(v);
    }
    return out;
  },

  async updateDealField(_tenantId, ref, field, value): Promise<Deal> {
    const externalId = resolveExternalId(ref);
    const sfFieldName = fieldToSfName(field);
    const result = await sf.updateOpportunity(externalId, {
      [sfFieldName]: value,
    });
    if (!result.ok) {
      throw new Error(`Salesforce update failed: ${result.error}`);
    }
    // Re-fetch for the canonical post-update state.
    return this.getDeal(_tenantId, externalId);
  },

  async createNote(_tenantId, dealRef, payload): Promise<Note> {
    // SF doesn't have a unified "Note" engagement that's web-API friendly;
    // the closest equivalent is ContentNote or a Task with subject/body.
    // Use the Task path (already implemented in the adapter) — task with
    // taskSubtype: "Task" reads as a note-ish record on the deal.
    const dealId = resolveExternalId(dealRef);
    const result = await sf.createTask({
      whatId: dealId,
      subject: "Mallin note",
      description: stripHtmlForSf(payload.body_html),
      activityDate: (payload.occurred_at ?? new Date().toISOString()).slice(
        0,
        10,
      ),
      status: "Completed",
      taskSubtype: "Task",
    });
    if (!result.ok) {
      throw new Error(`Salesforce create note (as Task) failed: ${result.error}`);
    }
    return {
      id: result.id,
      ref: makeRef(result.id),
      type: "note",
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
      deal_id: dealId,
      body_html: payload.body_html,
    };
  },

  async createTask(_tenantId, dealRef, payload): Promise<Task> {
    const dealId = resolveExternalId(dealRef);
    const result = await sf.createTask({
      whatId: dealId,
      subject: payload.subject,
      description: payload.body,
      activityDate: payload.due_at?.slice(0, 10),
      status: payload.status === "completed" ? "Completed" : "Not Started",
      taskSubtype: "Task",
    });
    if (!result.ok) {
      throw new Error(`Salesforce create task failed: ${result.error}`);
    }
    return {
      id: result.id,
      ref: makeRef(result.id),
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

  async createInboundLead(_tenantId, payload): Promise<{ id: string }> {
    const result = await sf.createInboundLead({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      company: payload.company,
      title: payload.title,
      description: payload.description,
    });
    if (!result.ok) {
      throw new Error(`Salesforce create lead failed: ${result.error}`);
    }
    return { id: result.id };
  },
};

// Strip the small HTML subset down to plain text for SF, which doesn't
// render HTML in standard Task descriptions.
function stripHtmlForSf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}
