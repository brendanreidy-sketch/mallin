/**
 * ============================================================================
 *  POST /api/log-touch
 * ============================================================================
 *
 *  Captures off-platform conversations (phone calls, hallway chats, texts)
 *  that aren't recorded by Gong but materially affect the deal. Appends
 *  the touch to the substrate JSON file as a new activity with
 *  type="off_platform_touch", source_system="rep_log".
 *
 *  BI-DIRECTIONAL CRM SYNC (outbound)
 *  ---------------------------------
 *  If env var CRM_WEBHOOK_URL is set, the route POSTs the touch payload
 *  to that URL after persisting locally. The webhook target is up to the
 *  tenant — Zapier, Make, n8n, or a direct Salesforce REST endpoint all
 *  work. The handler must accept JSON and return 2xx for the touch to be
 *  marked `crm_sync: synced`.
 *
 *  Outbound payload shape (matches what most CRMs want for an Activity /
 *  Task record — Zapier/Make can map fields downstream):
 *
 *    {
 *      "external_id": "touch_<timestamp>",
 *      "occurred_at": "<ISO>",
 *      "subject": "<auto-derived>",
 *      "body": "<rep's verbatim summary>",
 *      "with_stakeholder": {
 *        "name": "<display>",
 *        "email": "<email>",
 *        "id": "<substrate stakeholder id>"
 *      },
 *      "logged_by_email": "<rep email>",
 *      "opportunity_id": "<substrate opportunity id>",
 *      "account_id": "<substrate account id>",
 *      "source_system": "rep_log",
 *      "type": "off_platform_touch"
 *    }
 *
 *  For a Salesforce Task object specifically, Zapier mapping would be:
 *    Task.Subject ← subject
 *    Task.Description ← body
 *    Task.ActivityDate ← occurred_at (date portion)
 *    Task.WhoId ← lookup Contact by email
 *    Task.WhatId ← lookup Opportunity by external id
 *    Task.Type ← "Call"
 *    Task.Status ← "Completed"
 *
 *  INBOUND (CRM → substrate) is NOT in this route. That requires a
 *  separate poller/webhook receiver and SF API auth. Deferred until SF
 *  is properly connected.
 *
 *  Request body (JSON):
 *    {
 *      "file": "<artifact-or-substrate-filename>",
 *      "stakeholder_id": "<id>" | null,
 *      "stakeholder_name": "<display name>" | null,
 *      "stakeholder_email": "<email>" | null,
 *      "occurred_at": "<ISO timestamp>" | null,
 *      "body": "<rep's verbatim summary>"
 *    }
 *
 *  Response:
 *    200 { ok: true, activity_id, substrate_filename, crm_sync }
 *    400 { ok: false, error }
 *
 *  NOTE: prototype-grade local-disk persistence. Production would write
 *  to a tenant-scoped data store. Filename is whitelist-sanitized to
 *  prevent path traversal.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { supabaseAdmin } from "@/lib/db/client";
import { regenerateBriefForDeal } from "@/lib/regenerate";
import { getCurrentTenantId } from "@/lib/auth/tenant-context";
import { isOpportunityAccessible } from "@/lib/auth/opportunity-access";

type CrmSyncStatus =
  | "synced"
  | "failed"
  | "pending"
  | "not_configured";

interface CrmSync {
  status: CrmSyncStatus;
  webhook_url?: string;
  http_status?: number;
  attempted_at?: string;
  succeeded_at?: string;
  error?: string;
}

interface ExistingActivity {
  id: string;
  account_id?: string;
  opportunity_id?: string;
  type: string;
  occurred_at: string;
  subject?: string;
  summary?: string | null;
  rep_note?: string | null;
  call_id?: string | null;
  email_id?: string | null;
  meeting_id?: string | null;
  off_platform_touch_id?: string | null;
  attendee_emails?: string[];
  source_system?: string;
  source_external_id?: string;
  anchor_type?: string;
  with_stakeholder_id?: string;
  crm_sync?: CrmSync;
}

interface MutableSubstrate {
  opportunity?: { id?: string };
  account?: { id?: string };
  internal_participants?: Array<{ id?: string; email?: string; name?: string }>;
  activities: ExistingActivity[];
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]/g, "");
}

function resolveSubstrateFilename(rawFile: string): string {
  // Accept either artifact or substrate filename; strip artifact suffix.
  const safe = sanitize(rawFile);
  return safe.replace(/\.pass3-merged\.pass4-output(\.[^.]+)?\.json$/, ".json");
}

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return badRequest("invalid JSON body");
  }

  const file = typeof body.file === "string" ? body.file : "";
  if (!file) return badRequest("`file` is required");

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return badRequest("`body` is required");
  if (text.length > 2000) return badRequest("`body` exceeds 2000 chars");

  const stakeholderId =
    typeof body.stakeholder_id === "string" && body.stakeholder_id.trim()
      ? body.stakeholder_id.trim()
      : null;
  const stakeholderName =
    typeof body.stakeholder_name === "string" && body.stakeholder_name.trim()
      ? body.stakeholder_name.trim()
      : null;
  const stakeholderEmail =
    typeof body.stakeholder_email === "string" && body.stakeholder_email.trim()
      ? body.stakeholder_email.trim()
      : null;

  let occurredAt: string;
  if (typeof body.occurred_at === "string" && body.occurred_at) {
    const d = new Date(body.occurred_at);
    if (Number.isNaN(d.getTime())) return badRequest("invalid occurred_at");
    occurredAt = d.toISOString();
  } else {
    occurredAt = new Date().toISOString();
  }

  // ── DB path: file = "dealId:<uuid>" → write to Supabase touches table ────
  if (file.startsWith("dealId:")) {
    return handleDbWrite({
      dealId: file.slice("dealId:".length).replace(/[^a-fA-F0-9-]/g, ""),
      stakeholderId,
      stakeholderName,
      stakeholderEmail,
      occurredAt,
      body: text,
    });
  }

  // ── Legacy file path: write to JSON fixture on disk ─────────────────────
  const substrateFile = resolveSubstrateFilename(file);
  const path = resolve(process.cwd(), "scripts/_fixtures", substrateFile);
  if (!existsSync(path)) {
    return badRequest(`substrate file not found: ${substrateFile}`);
  }

  let substrate: MutableSubstrate;
  try {
    substrate = JSON.parse(readFileSync(path, "utf-8")) as MutableSubstrate;
  } catch {
    return badRequest("substrate JSON is malformed");
  }

  if (!Array.isArray(substrate.activities)) substrate.activities = [];

  const touchSeq = substrate.activities.filter(
    (a) => a.type === "off_platform_touch",
  ).length;
  const touchId = `act_touch_${touchSeq + 1}_${Date.now()}`;
  const externalId = `touch_${Date.now()}`;

  // Pull rep email from internal_participants if present.
  const repEmail =
    substrate.internal_participants?.[0]?.email ?? "rep@northwind.com";

  const attendees = [repEmail, stakeholderEmail].filter(
    (x): x is string => Boolean(x),
  );

  const subjectStakeholder = stakeholderName ?? "stakeholder";
  const firstLine = text.split("\n")[0]?.slice(0, 80) ?? "";
  const subject = `Off-platform touch with ${subjectStakeholder}${
    firstLine ? ` — ${firstLine}` : ""
  }`;

  const newActivity: ExistingActivity = {
    id: touchId,
    account_id: substrate.account?.id,
    opportunity_id: substrate.opportunity?.id,
    type: "off_platform_touch",
    occurred_at: occurredAt,
    subject,
    summary: text,
    rep_note: null,
    call_id: null,
    email_id: null,
    meeting_id: null,
    off_platform_touch_id: externalId,
    attendee_emails: attendees,
    source_system: "rep_log",
    source_external_id: externalId,
    anchor_type: "opportunity_anchored",
  };

  // Optional — also store stakeholder linkage for future Pass 2 enrichment.
  if (stakeholderId) {
    newActivity.with_stakeholder_id = stakeholderId;
  }

  // ─── Outbound CRM sync (if configured) ──────────────────────────────────
  const webhookUrl = process.env.CRM_WEBHOOK_URL?.trim();
  let crmSync: CrmSync;
  if (!webhookUrl) {
    crmSync = { status: "not_configured" };
  } else {
    crmSync = await fireCrmWebhook(webhookUrl, {
      external_id: externalId,
      occurred_at: occurredAt,
      subject,
      body: text,
      with_stakeholder: {
        id: stakeholderId,
        name: stakeholderName,
        email: stakeholderEmail,
      },
      logged_by_email: repEmail,
      opportunity_id: substrate.opportunity?.id ?? null,
      account_id: substrate.account?.id ?? null,
      source_system: "rep_log",
      type: "off_platform_touch",
    });
  }
  newActivity.crm_sync = crmSync;

  substrate.activities.push(newActivity);

  // Sort chronologically so the activities[] stays ordered.
  substrate.activities.sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at),
  );

  try {
    writeFileSync(path, JSON.stringify(substrate, null, 2));
  } catch (e) {
    return badRequest(`failed to persist: ${(e as Error).message}`);
  }

  return NextResponse.json({
    ok: true,
    activity_id: touchId,
    substrate_filename: substrateFile,
    crm_sync: crmSync,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Outbound CRM webhook
// ────────────────────────────────────────────────────────────────────────────

// Gate replaced with tenant-membership check via
// `isOpportunityAccessible` (see lib/auth/opportunity-access.ts).
// May 20 2026 — see memory: intake_primitive_doctrine.md.

async function handleDbWrite(args: {
  dealId: string;
  stakeholderId: string | null;
  stakeholderName: string | null;
  stakeholderEmail: string | null;
  occurredAt: string;
  body: string;
}) {
  const {
    dealId,
    stakeholderId,
    stakeholderName,
    stakeholderEmail,
    occurredAt,
    body: text,
  } = args;
  if (!dealId) return badRequest("invalid dealId");
  const userTenantId = await getCurrentTenantId().catch(() => null);
  if (!(await isOpportunityAccessible(dealId, userTenantId))) {
    return badRequest("opportunity not accessible to this tenant");
  }

  // Look up tenant_id + account_id off the opportunity for FK fixup.
  const { data: opp, error: oppErr } = await supabaseAdmin
    .from("opportunities")
    .select("id, tenant_id, account_id")
    .eq("id", dealId)
    .maybeSingle();
  if (oppErr || !opp) return badRequest("deal not found");

  const externalId = `touch_${Date.now()}`;
  const firstLine = text.split("\n")[0]?.slice(0, 80) ?? "";
  const subject = `Off-platform touch with ${stakeholderName ?? "stakeholder"}${
    firstLine ? ` — ${firstLine}` : ""
  }`;

  // Fire CRM webhook (same as the file path).
  const webhookUrl = process.env.CRM_WEBHOOK_URL?.trim();
  let crmSync: CrmSync;
  if (!webhookUrl) {
    crmSync = { status: "not_configured" };
  } else {
    crmSync = await fireCrmWebhook(webhookUrl, {
      external_id: externalId,
      occurred_at: occurredAt,
      subject,
      body: text,
      with_stakeholder: {
        id: stakeholderId,
        name: stakeholderName,
        email: stakeholderEmail,
      },
      opportunity_id: dealId,
      account_id: opp.account_id ?? null,
      source_system: "rep_log",
      type: "off_platform_touch",
    });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("touches")
    .insert({
      tenant_id: opp.tenant_id,
      account_id: opp.account_id,
      opportunity_id: dealId,
      with_stakeholder_id: stakeholderId,
      occurred_at: occurredAt,
      subject,
      body: text,
      source_system: "rep_log",
      source_external_id: externalId,
      attendee_emails: [stakeholderEmail].filter((x): x is string => Boolean(x)),
      crm_sync_status: crmSync.status,
      crm_sync_meta: crmSync as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (insErr) {
    return badRequest(`db insert failed: ${insErr.message}`);
  }

  // Bump opportunities.last_activity_at — this is a denormalized cache
  // that drives momentum signals + freshness heuristics elsewhere. Without
  // this update, stale values linger long after the rep has logged real
  // activity. Guard: only advance the cache, never roll it back (rep may
  // be backdating an older conversation).
  const { data: oppLA } = await supabaseAdmin
    .from("opportunities")
    .select("last_activity_at")
    .eq("id", dealId)
    .maybeSingle();
  const cachedMs = oppLA?.last_activity_at
    ? new Date(oppLA.last_activity_at).getTime()
    : 0;
  const newMs = new Date(occurredAt).getTime();
  if (newMs > cachedMs) {
    const { error: bumpErr } = await supabaseAdmin
      .from("opportunities")
      .update({ last_activity_at: occurredAt })
      .eq("id", dealId);
    if (bumpErr) {
      console.warn(
        `[log-touch] failed to bump last_activity_at on ${dealId}: ${bumpErr.message}`,
      );
    }
  }

  // ── Schedule Pass 4 regen as background work ──────────────────────────
  //
  // Pass 4 takes ~2.5 min on Sonnet 4-6, which makes a synchronous regen
  // feel broken from the rep's seat. Instead we schedule it via Next's
  // after() (Vercel uses waitUntil; locally it just runs after the
  // response). The page detects "regen in flight" by data shape — a
  // touch newer than the current artifact, < 5 min old — and meta-
  // refreshes until the new artifact lands. Self-healing: if regen
  // crashes, the "in flight" window expires after 5 min and the rep
  // can retry by logging another touch.
  after(async () => {
    try {
      const r = await regenerateBriefForDeal(dealId);
      if (!r.ok) {
        console.warn(
          `[regen] failed for ${dealId}: ${r.reason} — ${r.error}`,
        );
      }
    } catch (err) {
      console.error(`[regen] unexpected error for ${dealId}:`, err);
    }
  });

  return NextResponse.json({
    ok: true,
    activity_id: inserted.id,
    deal_id: dealId,
    crm_sync: crmSync,
    regen: { status: "scheduled" },
  });
}

async function fireCrmWebhook(
  url: string,
  payload: Record<string, unknown>,
): Promise<CrmSync> {
  const attemptedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2s — fail fast
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      return {
        status: "synced",
        webhook_url: redactUrl(url),
        http_status: resp.status,
        attempted_at: attemptedAt,
        succeeded_at: new Date().toISOString(),
      };
    }

    let errBody = "";
    try {
      errBody = (await resp.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    return {
      status: "failed",
      webhook_url: redactUrl(url),
      http_status: resp.status,
      attempted_at: attemptedAt,
      error: `HTTP ${resp.status}${errBody ? `: ${errBody}` : ""}`,
    };
  } catch (e) {
    return {
      status: "failed",
      webhook_url: redactUrl(url),
      attempted_at: attemptedAt,
      error: (e as Error).message,
    };
  }
}

// Strip query/secret tokens before persisting the URL on disk.
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(invalid url)";
  }
}
