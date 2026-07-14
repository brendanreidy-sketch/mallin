/**
 * Resend transactional email — HTTP client only.
 *
 * We don't install the `resend` npm package because the only thing we
 * do today is a single transactional send (pilot-signup notification
 * to brendan@mallin.io). A direct fetch() against the public Resend
 * API endpoint avoids adding a dependency for one call. If we ever
 * add a second use-case (welcome emails, manager digests, etc.), it's
 * worth installing the SDK and consolidating here.
 *
 * Env vars required:
 *   RESEND_API_KEY        — from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL?    — defaults to onboarding@resend.dev (no domain
 *                           verification needed; ships out of the box).
 *                           For production: verify mallin.io in Resend
 *                           and set this to e.g. notifications@mallin.io.
 *
 * Recipients are segmented by purpose so inbound mail can be routed to
 * separate inboxes: signup + pilot notifications go to signup@mallin.io,
 * the contact form goes to hello@mallin.io. Both are env-overridable
 * (SIGNUP_NOTIFICATION_TO / CONTACT_NOTIFICATION_TO) so the target can
 * change without a deploy. These are mallin.io aliases on the Workspace.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
// Signup + pilot pings land here; contact form goes to hello@. Both are
// mallin.io aliases on the Workspace, env-overridable without a deploy.
const SIGNUP_NOTIFICATION_TO =
  process.env.SIGNUP_NOTIFICATION_TO || "signup@mallin.io";
const CONTACT_NOTIFICATION_TO =
  process.env.CONTACT_NOTIFICATION_TO || "hello@mallin.io";

export interface PilotSignupPayload {
  name: string;
  email: string;
  company: string;
  role?: string | null;
  what_you_sell?: string | null;
  team_size?: string | null;
  current_stack?: string[] | null;
  win_rate?: string | null;
  deal_profile?: string | null;
  team_experience?: string | null;
  trigger?: string | null;
  notes?: string | null;
}

interface ResendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendPilotSignupNotification(
  signup: PilotSignupPayload,
): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Don't break the signup flow if email isn't configured yet — log
    // and return failure. The DB still has the record; Brendan can
    // backfill notifications by querying pilot_signups.
    console.warn(
      "[pilot-signup] RESEND_API_KEY not set — skipping email notification.",
    );
    return { ok: false, error: "no_api_key" };
  }

  const from =
    process.env.RESEND_FROM_EMAIL || "Mallin Pilots <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: SIGNUP_NOTIFICATION_TO,
        reply_to: signup.email,
        subject: `New pilot signup: ${signup.name} @ ${signup.company}`,
        text: formatSignupText(signup),
        html: formatSignupHtml(signup),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        `[pilot-signup] Resend send failed (${res.status}):`,
        errBody,
      );
      return { ok: false, error: `resend_${res.status}` };
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    console.error("[pilot-signup] Resend network error:", err);
    return { ok: false, error: "network_error" };
  }
}

/* ─── Formatting helpers ─────────────────────────────────────────── */

function formatSignupText(s: PilotSignupPayload): string {
  const lines: (string | null)[] = [
    `${s.name} just signed up for a Mallin pilot.`,
    "",
    `Company:     ${s.company}`,
    `Role:        ${s.role || "—"}`,
    `Email:       ${s.email}`,
    s.what_you_sell ? `Sells:       ${s.what_you_sell}` : null,
    `Team size:   ${s.team_size || "—"}`,
    s.current_stack && s.current_stack.length > 0
      ? `Stack:       ${s.current_stack.join(", ")}`
      : null,
    s.win_rate ? `Win rate:    ${s.win_rate}` : null,
    s.deal_profile ? `Deal profile: ${s.deal_profile}` : null,
    s.team_experience ? `Team exp:    ${s.team_experience}` : null,
    s.trigger ? `Trigger:     ${prettifyTrigger(s.trigger)}` : null,
    "",
    "Notes:",
    s.notes && s.notes.trim().length > 0 ? s.notes.trim() : "(none)",
    "",
    "— Sent from mallin.io/pilot",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

function formatSignupHtml(s: PilotSignupPayload): string {
  const trigger = s.trigger ? prettifyTrigger(s.trigger) : null;
  const stack =
    s.current_stack && s.current_stack.length > 0
      ? s.current_stack.join(", ")
      : null;

  const rows: [string, string | null][] = [
    ["Company", s.company],
    ["Role", s.role || null],
    ["Email", s.email],
    ["Sells", s.what_you_sell || null],
    ["Team size", s.team_size || null],
    ["Stack", stack],
    ["Win rate", s.win_rate || null],
    ["Deal profile", s.deal_profile || null],
    ["Team experience", s.team_experience || null],
    ["Trigger", trigger],
  ];

  const rowsHtml = rows
    .filter(([, v]) => v !== null && v !== "")
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:6px 14px 6px 0;color:#6b7689;font-size:13px;width:120px;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;color:#1a2230;font-size:14px;">${escapeHtml(v as string)}</td>
        </tr>`,
    )
    .join("");

  const notesBlock =
    s.notes && s.notes.trim().length > 0
      ? `<div style="margin-top:18px;padding:14px 16px;background:#f4f1ea;border-left:3px solid #4a7186;border-radius:0 6px 6px 0;color:#1a2230;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(s.notes.trim())}</div>`
      : "";

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3dccc;border-radius:10px;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4a7186;">— New pilot signup</p>
    <h1 style="margin:0 0 22px;font-size:22px;font-weight:700;letter-spacing:-0.015em;color:#1a2230;">${escapeHtml(s.name)} @ ${escapeHtml(s.company)}</h1>
    <table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>
    ${notesBlock}
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3dccc;font-size:12px;color:#6b7689;">Reply to this email to respond — replies route to ${escapeHtml(s.email)}.</p>
  </div>
</body></html>`;
}

function prettifyTrigger(t: string): string {
  switch (t) {
    case "missed_quarter":
      return "Just missed a quarter we can't explain";
    case "scaling":
      return "Scaling faster than RevOps can hire";
    case "memory_loss":
      return "Losing context across reps and quarters";
    case "other":
      return "Other";
    default:
      return t;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ─── B2C signup notification (founder-receives-every-signup) ────── */

export interface SignupPayload {
  email: string;
  name?: string | null;
  domain?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
}

/**
 * Pings brendan@mallin.io the moment a free B2C workspace is created, so a
 * human can reach out same-day. Best-effort: never blocks signup.
 */
export async function sendSignupNotification(
  s: SignupPayload,
): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[signup] RESEND_API_KEY not set — skipping signup email.");
    return { ok: false, error: "no_api_key" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "Mallin <onboarding@resend.dev>";
  const who = s.name || s.email;
  const source = s.utm_source || s.referrer || "direct / unknown";
  const rows: [string, string | null][] = [
    ["Email", s.email],
    ["Domain", s.domain || null],
    ["Source", source],
    ["Campaign", s.utm_campaign || null],
    ["Referrer", s.referrer || null],
  ];
  const rowsHtml = rows
    .filter(([, v]) => v !== null && v !== "")
    .map(
      ([k, v]) => `
        <tr><td style="padding:6px 14px 6px 0;color:#6b7689;font-size:13px;width:110px;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#1a2230;font-size:14px;">${escapeHtml(v as string)}</td></tr>`,
    )
    .join("");
  const text = [
    `${who} just signed up for the free tool.`,
    "",
    `Email:     ${s.email}`,
    `Domain:    ${s.domain || "—"}`,
    `Source:    ${source}`,
    s.utm_campaign ? `Campaign:  ${s.utm_campaign}` : null,
    s.referrer ? `Referrer:  ${s.referrer}` : null,
    "",
    "Reach out today. — mallin.io/start",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3dccc;border-radius:10px;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#5a8f7a;">— New free signup</p>
    <h1 style="margin:0 0 22px;font-size:22px;font-weight:700;letter-spacing:-0.015em;color:#1a2230;">${escapeHtml(who)}</h1>
    <table style="border-collapse:collapse;width:100%;">${rowsHtml}</table>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3dccc;font-size:13px;color:#1a2230;"><b>Reach out today</b> — reply here (routes to ${escapeHtml(s.email)}).</p>
  </div>
</body></html>`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: SIGNUP_NOTIFICATION_TO,
        reply_to: s.email,
        subject: `New free signup: ${who}${s.domain ? ` @ ${s.domain}` : ""}`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[signup] Resend send failed (${res.status}):`, errBody);
      return { ok: false, error: `resend_${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    console.error("[signup] Resend network error:", err);
    return { ok: false, error: "network_error" };
  }
}

/* ─── Contact form notification ──────────────────────────────────── */

export interface ContactMessagePayload {
  name: string;
  email: string;
  message: string;
}

export async function sendContactNotification(
  msg: ContactMessagePayload,
): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[contact] RESEND_API_KEY not set — skipping email notification.",
    );
    return { ok: false, error: "no_api_key" };
  }

  const from =
    process.env.RESEND_FROM_EMAIL || "Mallin <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: CONTACT_NOTIFICATION_TO,
        reply_to: msg.email,
        subject: `Contact form: ${msg.name}`,
        text: formatContactText(msg),
        html: formatContactHtml(msg),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[contact] Resend send failed (${res.status}):`, errBody);
      return { ok: false, error: `resend_${res.status}` };
    }

    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    console.error("[contact] Resend network error:", err);
    return { ok: false, error: "network_error" };
  }
}

/** Notify the founder of a new lead captured from the free /try flow — includes
 *  the ICP context the visitor already gave (account, what they sell, room). */
export async function sendTryLeadNotification(lead: {
  email: string;
  name?: string;
  company?: string;
  productContext?: string;
  stakeholders?: string;
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[try-lead] RESEND_API_KEY not set — skipping notification.");
    return { ok: false, error: "no_api_key" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "Mallin <onboarding@resend.dev>";
  const text = [
    "New free-try lead (saved from the exit-intent box).",
    "",
    `Email:    ${lead.email}`,
    lead.name ? `Name:     ${lead.name}` : "",
    `Company:  ${lead.company ?? "—"}   (the account they're researching)`,
    `Sells:    ${lead.productContext ?? "—"}`,
    `Room:     ${lead.stakeholders ?? "—"}`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: SIGNUP_NOTIFICATION_TO,
        reply_to: lead.email,
        subject: `Free-try lead: ${lead.email}`,
        text,
      }),
    });
    if (!res.ok) {
      console.error(`[try-lead] Resend send failed (${res.status})`);
      return { ok: false, error: `resend_${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    console.error("[try-lead] Resend network error:", err);
    return { ok: false, error: "network_error" };
  }
}

function formatContactText(m: ContactMessagePayload): string {
  return [
    `${m.name} sent a contact-form message.`,
    "",
    `Name:    ${m.name}`,
    `Email:   ${m.email}`,
    "",
    "Message:",
    m.message.trim(),
    "",
    "— Sent from mallin.io/contact",
  ].join("\n");
}

function formatContactHtml(m: ContactMessagePayload): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3dccc;border-radius:10px;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4a7186;">— New contact message</p>
    <h1 style="margin:0 0 22px;font-size:22px;font-weight:700;letter-spacing:-0.015em;color:#1a2230;">${escapeHtml(m.name)}</h1>
    <table style="border-collapse:collapse;width:100%;">
      <tr>
        <td style="padding:6px 14px 6px 0;color:#6b7689;font-size:13px;width:80px;">Email</td>
        <td style="padding:6px 0;color:#1a2230;font-size:14px;">${escapeHtml(m.email)}</td>
      </tr>
    </table>
    <div style="margin-top:18px;padding:14px 16px;background:#f4f1ea;border-left:3px solid #4a7186;border-radius:0 6px 6px 0;color:#1a2230;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(m.message.trim())}</div>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3dccc;font-size:12px;color:#6b7689;">Reply to this email to respond — replies route to ${escapeHtml(m.email)}.</p>
  </div>
</body></html>`;
}
