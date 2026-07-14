/**
 * Welcome email for self-serve B2C signups.
 *
 * Separate from lib/email/resend.ts (which sends founder notifications to
 * brendan@mallin.io). This one is addressed to the NEW USER. Same direct-fetch
 * Resend approach, no SDK dependency.
 *
 * Env:
 *   RESEND_API_KEY     (required — no-ops with a warning if absent)
 *   RESEND_FROM_EMAIL? (defaults to "Mallin <onboarding@resend.dev>")
 *
 * Best-effort by contract: never throw into the signup flow. The caller
 * should `.catch()` anyway, but a missing key or a Resend error returns a
 * failure result instead of raising.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export interface WelcomeEmailInput {
  to: string;
  firstName?: string | null;
}

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[welcome-email] RESEND_API_KEY not set — skipping welcome email.");
    return { ok: false, error: "no_api_key" };
  }
  const from = process.env.RESEND_FROM_EMAIL || "Mallin <onboarding@resend.dev>";
  const name = input.firstName?.trim() || "there";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: "Welcome to Mallin",
        text: welcomeText(name),
        html: welcomeHtml(name),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[welcome-email] Resend send failed (${res.status}):`, body);
      return { ok: false, error: `resend_${res.status}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    console.error("[welcome-email] Resend network error:", err);
    return { ok: false, error: "network_error" };
  }
}

function welcomeText(name: string): string {
  return [
    `Hi ${name},`,
    "",
    "Your Mallin workspace is ready.",
    "",
    "Mallin reads your sales calls and turns them into a pre-call brief: the",
    "decisive risk, the next move, the stakeholders that matter — with the",
    "evidence behind every claim.",
    "",
    "Get your first brief: paste a call transcript and Mallin does the rest.",
    "",
    "https://mallin.io/cockpit",
    "",
    "— The Mallin team",
  ].join("\n");
}

function welcomeHtml(name: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3dccc;border-radius:10px;padding:32px;">
    <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#4a7186;">— Welcome</p>
    <h1 style="margin:0 0 18px;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#1a2230;">Your Mallin workspace is ready.</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3b4658;">Hi ${esc(name)},</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3b4658;">Mallin reads your sales calls and turns them into a pre-call brief — the decisive risk, the next move, the stakeholders that matter, with the evidence behind every claim.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3b4658;">Get your first brief: paste a call transcript and Mallin does the rest.</p>
    <a href="https://mallin.io/cockpit" style="display:inline-block;padding:13px 22px;background:#1a2230;color:#f4f1ea;font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">Open Mallin →</a>
    <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e3dccc;font-size:12px;color:#6b7689;">You're receiving this because you created a Mallin account.</p>
  </div>
</body></html>`;
}
