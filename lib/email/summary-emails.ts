/**
 * Per-call summary emails sent to the rep who is using Mallín.
 *
 * Two surfaces:
 *   - sendPreCallBriefEmail  — fired when an Account Intelligence brief is
 *     generated for a deal (scripts/intake/intake-deal.ts). Puts the
 *     decision-that-matters-most + recent events in the rep's inbox so they
 *     have the brief on their phone before they walk into the meeting.
 *   - sendPostCallRecapEmail — fired after a call is processed
 *     (app/api/calls/process). The read of the call + risks + next step.
 *
 * Self-contained HTTP client (mirrors lib/email/resend.ts — same direct
 * fetch against the Resend API, no SDK dependency). Fail-safe by contract:
 * never throws, always returns a result, never blocks the caller's flow.
 *
 * Recipient is the REP themselves (a self-notification), so these are not
 * external/customer sends and need no approval gate.
 *
 * DELIVERABILITY: these are intentionally plain — short text, bold labels,
 * a single inline link, no dark CTA button or heavy card markup. A button-
 * heavy "promotional"-looking HTML email gets silently filtered by Yahoo/AOL
 * on a cold sending domain (observed: identical content with a dark CTA was
 * accepted-then-suppressed; the plain version inboxed). Keep it plain.
 *
 * Env: RESEND_API_KEY (required to actually send), RESEND_FROM_EMAIL
 * (defaults to onboarding@resend.dev if the domain isn't verified yet).
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const REPLY_TO = "hello@mallin.io";

export interface SummaryEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface PreCallBriefEmailData {
  accountName: string;
  opportunityName: string;
  /** The "decision that matters most" / primary objective for the call. */
  primaryObjective: string | null;
  /** Up to ~4 recent events, newest first. */
  topEvents: { date: string; headline: string }[];
  /** Deep link to the full brief in the cockpit. */
  cockpitUrl: string;
}

export interface PostCallRecapEmailData {
  accountName: string;
  dealName: string;
  /** The 30-second read of the call. */
  theRead: string;
  /** Risk lines (one short clause each). */
  risks: string[];
  /** Synthesized next step, if any. */
  nextStep: string | null;
  /** How many CRM fields Mallín updated from the call. */
  fieldsUpdated: number;
  cockpitUrl: string;
}

/** Pre-call brief summary → the rep. */
export async function sendPreCallBriefEmail(
  to: string,
  data: PreCallBriefEmailData,
): Promise<SummaryEmailResult> {
  return send({
    to,
    subject: `Your ${data.accountName} brief`,
    text: preCallText(data),
    html: preCallHtml(data),
  });
}

/** Post-call recap → the rep. */
export async function sendPostCallRecapEmail(
  to: string,
  data: PostCallRecapEmailData,
): Promise<SummaryEmailResult> {
  return send({
    to,
    subject: `Your ${data.accountName} call recap`,
    text: recapText(data),
    html: recapHtml(data),
  });
}

/* ─── Shared sender ─────────────────────────────────────────────────── */

async function send(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SummaryEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[summary-email] RESEND_API_KEY not set — skipping send.");
    return { ok: false, error: "no_api_key" };
  }
  if (!opts.to || !opts.to.includes("@")) {
    return { ok: false, error: "no_recipient" };
  }
  const from =
    process.env.RESEND_FROM_EMAIL || "Mallín <onboarding@resend.dev>";
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        reply_to: REPLY_TO,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[summary-email] Resend send failed (${res.status}):`,
        errBody,
      );
      return { ok: false, error: `resend_${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    console.error("[summary-email] Resend network error:", err);
    return { ok: false, error: "network_error" };
  }
}

/* ─── Formatters (plain on purpose — see DELIVERABILITY note above) ──── */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const WRAP =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a2230;";

function preCallText(d: PreCallBriefEmailData): string {
  const lines: string[] = [
    `Here's your pre-call brief for ${d.accountName} — ${d.opportunityName}.`,
    "",
  ];
  if (d.primaryObjective) {
    lines.push("The decision that matters most:", d.primaryObjective, "");
  }
  if (d.topEvents.length) {
    lines.push("Recent events:");
    for (const e of d.topEvents) {
      lines.push(`- ${fmtDate(e.date)} — ${e.headline}`);
    }
    lines.push("");
  }
  lines.push(`The full brief is in your cockpit: ${d.cockpitUrl}`, "", "— Mallín");
  return lines.join("\n");
}

function preCallHtml(d: PreCallBriefEmailData): string {
  const objective = d.primaryObjective
    ? `<p><b>The decision that matters most:</b><br>${esc(d.primaryObjective)}</p>`
    : "";
  const events = d.topEvents.length
    ? `<p><b>Recent events:</b></p><ul>${d.topEvents
        .map((e) => `<li>${esc(fmtDate(e.date))} — ${esc(e.headline)}</li>`)
        .join("")}</ul>`
    : "";
  return `<div style="${WRAP}">
<p>Here's your pre-call brief for <b>${esc(d.accountName)}</b> — ${esc(d.opportunityName)}.</p>
${objective}
${events}
<p>The full brief is in your cockpit: <a href="${esc(d.cockpitUrl)}">${esc(d.cockpitUrl)}</a></p>
<p>— Mallín</p>
</div>`;
}

function recapText(d: PostCallRecapEmailData): string {
  const lines: string[] = [
    `Here's your recap of the ${d.accountName} call — ${d.dealName}.`,
    "",
    "The read:",
    d.theRead,
    "",
  ];
  if (d.risks.length) {
    lines.push("Risks:");
    for (const r of d.risks) lines.push(`- ${r}`);
    lines.push("");
  }
  if (d.nextStep) lines.push("Next step:", d.nextStep, "");
  if (d.fieldsUpdated > 0) {
    lines.push(`Mallín updated ${d.fieldsUpdated} CRM field(s) from this call.`, "");
  }
  lines.push(`Open the deal: ${d.cockpitUrl}`, "", "— Mallín");
  return lines.join("\n");
}

function recapHtml(d: PostCallRecapEmailData): string {
  const risks = d.risks.length
    ? `<p><b>Risks:</b></p><ul>${d.risks
        .map((r) => `<li>${esc(r)}</li>`)
        .join("")}</ul>`
    : "";
  const nextStep = d.nextStep
    ? `<p><b>Next step:</b><br>${esc(d.nextStep)}</p>`
    : "";
  const fields =
    d.fieldsUpdated > 0
      ? `<p>Mallín updated ${d.fieldsUpdated} CRM field${d.fieldsUpdated === 1 ? "" : "s"} from this call.</p>`
      : "";
  return `<div style="${WRAP}">
<p>Here's your recap of the <b>${esc(d.accountName)}</b> call — ${esc(d.dealName)}.</p>
<p><b>The read:</b><br>${esc(d.theRead)}</p>
${risks}
${nextStep}
${fields}
<p>Open the deal: <a href="${esc(d.cockpitUrl)}">${esc(d.cockpitUrl)}</a></p>
<p>— Mallín</p>
</div>`;
}
