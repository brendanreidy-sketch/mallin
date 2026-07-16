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

export interface RepNudgeItem {
  opportunityId: string;
  dealName: string;
  /** The situation (from the nudge). */
  headline: string;
  /** Why it matters. */
  reason: string;
  /** What to do / send — the directive move (shown when there's no full draft). */
  move: string;
  /** Pre-written email for the top-ranked deals. When present it's shown in
   *  place of the move so the rep can read-and-send instead of writing. */
  emailSubject?: string;
  emailBody?: string;
}

/**
 * Proactive email nudge to the REP: "these deals need a move today, here's what
 * to send on each." Each item links to the deal, where the ✉ surface generates
 * the full personalized draft to review and send — nothing sends automatically.
 * Best-effort; never throws.
 */
export async function sendRepNudgeDigest(args: {
  email: string;
  name?: string | null;
  items: RepNudgeItem[];
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || args.items.length === 0) {
    return { ok: false, error: apiKey ? "no_items" : "no_api_key" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "Mallín <onboarding@resend.dev>";
  const rawBase = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://mallin.io";
  const baseUrl = rawBase.startsWith("http") ? rawBase : `https://${rawBase}`;
  const first = (args.name ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `${first},` : "Hi,";
  const n = args.items.length;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dealUrl = (id: string) => `${baseUrl}/prep?dealId=${encodeURIComponent(id)}`;

  const text = [
    greeting,
    "",
    `${n} deal${n === 1 ? "" : "s"} could use a move today. Here's what I'd send on each:`,
    "",
    ...args.items.flatMap((it) => {
      const lines = [`— ${it.dealName}: ${it.headline}`, `  Why: ${it.reason}`];
      if (it.emailBody) {
        lines.push(`  Draft — subject: ${it.emailSubject ?? `Re: ${it.dealName}`}`);
        lines.push(...it.emailBody.split("\n").map((l) => `  ${l}`));
      } else {
        lines.push(`  Move: ${it.move}`);
      }
      lines.push(`  Review + send: ${dealUrl(it.opportunityId)}`, "");
      return lines;
    }),
    "Open the deal to review and send — nothing goes out without your click.",
    "— Mallín",
  ].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#1a2230;max-width:560px;line-height:1.55;">
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 18px;"><strong>${n} deal${n === 1 ? "" : "s"} could use a move today.</strong> Here's what I'd do on each — review and send from Mallín:</p>
    ${args.items
      .map((it) => {
        const inner = it.emailBody
          ? `<p style="margin:0 0 4px;font-size:12.5px;color:#6b7689;">Suggested email · <em>${esc(it.emailSubject ?? `Re: ${it.dealName}`)}</em></p>
        <div style="white-space:pre-wrap;font-size:14px;color:#1a2230;background:#faf8f2;border-left:3px solid #c9b98f;padding:10px 12px;border-radius:6px;margin:0 0 12px;">${esc(it.emailBody)}</div>`
          : `<p style="margin:0 0 12px;font-size:14px;"><strong>Move:</strong> ${esc(it.move)}</p>`;
        return `<div style="margin:0 0 18px;padding:14px 16px;border:1px solid #e3dccc;border-radius:10px;">
        <p style="margin:0 0 4px;font-weight:600;">${esc(it.dealName)}</p>
        <p style="margin:0 0 8px;color:#6b7689;font-size:13.5px;">${esc(it.headline)} — ${esc(it.reason)}</p>
        ${inner}
        <a href="${dealUrl(it.opportunityId)}" style="display:inline-block;padding:9px 16px;background:#1a2230;color:#f4f1ea;border-radius:8px;text-decoration:none;font-weight:600;font-size:13.5px;">Review &amp; send →</a>
      </div>`;
      })
      .join("")}
    <p style="margin:0;color:#6b7689;font-size:13px;">Nothing goes out without your click. — Mallín</p>
  </div>`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: args.email,
        subject: `${n} deal${n === 1 ? "" : "s"} need a move today`,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const e = await res.text().catch(() => "");
      console.error(`[rep-nudge-digest] Resend failed: ${res.status} ${e}`);
      return { ok: false, error: `resend_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(
      `[rep-nudge-digest] send error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, error: "send_exception" };
  }
}

/**
 * Welcome-to-Pro email, sent to the CUSTOMER on the free→pro upgrade (fired
 * from the Stripe webhook). Until now the upgrade granted access silently — no
 * receipt, no acknowledgement. Best-effort: never throws, never blocks the
 * webhook's 2xx. Uses the rep's own deck language ("your deal memory carries
 * forward") so the welcome sounds like Mallín, not a generic SaaS receipt.
 */
export async function sendProWelcome(args: {
  email: string;
  name?: string | null;
}): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[pro-welcome] RESEND_API_KEY not set — skipping welcome email.");
    return { ok: false, error: "no_api_key" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "Mallín <onboarding@resend.dev>";
  const first = (args.name ?? "").trim().split(/\s+/)[0];
  const greeting = first ? `${first},` : "Hi,";

  const text = [
    greeting,
    "",
    "You're on Mallín Pro — thank you.",
    "",
    "Every deal now gets briefed and every call gets logged, with no cap. And the part that compounds: your deal memory carries forward. What won, what lost, what stalled — Mallín learns it and coaches the next deal off it, so your edge grows with every conversation.",
    "",
    "Jump back in: https://mallin.io/new",
    "",
    "If anything's ever off, just reply — this inbox reaches a human.",
    "",
    "— The Mallín team",
  ].join("\n");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#1a2230;max-width:520px;line-height:1.6;">
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:18px;font-weight:600;">You&rsquo;re on Mallín Pro — thank you.</p>
    <p style="margin:0 0 16px;">Every deal now gets briefed and every call gets logged, with no cap. And the part that compounds: <strong>your deal memory carries forward</strong>. What won, what lost, what stalled — Mallín learns it and coaches the next deal off it, so your edge grows with every conversation.</p>
    <p style="margin:0 0 20px;"><a href="https://mallin.io/new" style="display:inline-block;padding:11px 20px;background:#1a2230;color:#f4f1ea;border-radius:9px;text-decoration:none;font-weight:600;">Jump back in →</a></p>
    <p style="margin:0 0 16px;color:#6b7689;font-size:14px;">If anything&rsquo;s ever off, just reply — this inbox reaches a human.</p>
    <p style="margin:0;color:#6b7689;font-size:14px;">— The Mallín team</p>
  </div>`;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.email,
        subject: "You're on Mallín Pro",
        text,
        html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[pro-welcome] Resend failed: ${res.status} ${errBody}`);
      return { ok: false, error: `resend_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(
      `[pro-welcome] send error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, error: "send_exception" };
  }
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
