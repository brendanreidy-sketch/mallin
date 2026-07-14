/**
 * SDR effect dispatcher — where governed actions actually touch the world.
 *
 * Working defaults use infra we already have (Resend email). Slack + CRM are
 * adapter seams: wired if the tenant configured them, else the email path
 * stands in. Real Salesforce/HubSpot/calendar OAuth plugs in at the marked
 * points without changing callers.
 *
 * Every effect honors `dryRun` so the sim (and tests) never send for real.
 */
import { createInboundLead } from "@/lib/crm";
import type { SdrTenantConfig } from "./types";

export interface EffectOpts {
  /** When true, describe what WOULD happen without doing it (sim/tests). */
  dryRun?: boolean;
  /** Tenant context — needed to route the CRM write to the right provider. */
  tenantId?: string;
}

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  opts: EffectOpts = {},
): Promise<string> {
  if (opts.dryRun) return `email → ${to} (dry-run, not sent)`;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return `email → ${to} skipped (RESEND_API_KEY not set)`;
  const from = process.env.RESEND_FROM_EMAIL || "Mallin SDR <onboarding@resend.dev>";
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
    });
    return res.ok ? `emailed ${to}` : `email → ${to} failed (${res.status})`;
  } catch (e) {
    return `email → ${to} errored (${(e as Error).message.slice(0, 80)})`;
  }
}

async function notifySlack(
  webhookUrl: string,
  text: string,
  opts: EffectOpts,
): Promise<string> {
  if (opts.dryRun) return "slack (dry-run, not sent)";
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok ? "posted to Slack" : `slack failed (${res.status})`;
  } catch (e) {
    return `slack errored (${(e as Error).message.slice(0, 80)})`;
  }
}

/**
 * Perform a tool's real-world effect. Called for `auto` actions and again when
 * an `approve` action is cleared in the inbox. Returns a human-readable result.
 */
export async function performEffect(
  tool: string,
  input: Record<string, unknown>,
  config: SdrTenantConfig,
  opts: EffectOpts = {},
): Promise<string> {
  if (tool === "send_resource") {
    const r = (config.resources ?? []).find((x) => x.id === input.resource_id);
    if (!r) return `No resource "${String(input.resource_id)}" — nothing sent.`;
    // INTEGRATION POINT: in the live widget the link renders as a card in
    // chat; persistence records it. No external call needed.
    return `Sent "${r.title}" (${r.url}) to the prospect.`;
  }

  if (tool === "hand_off") {
    const summary = String(input.lead_summary ?? "");
    const reason = String(input.reason ?? "");
    const body = `New qualified lead for ${config.company_name}\n\nWhy: ${reason}\n\n${summary}`;
    const channels: string[] = [];

    // CRM write — the "log it in your CRM" step. Routed to the tenant's
    // configured provider via lib/crm; skipped in dry-run / no tenant context.
    // NOTE: today this writes to the deployment-configured org (client-
    // credentials). Per-CUSTOMER CRM OAuth is the next step.
    if (opts.tenantId && !opts.dryRun) {
      try {
        const { id } = await createInboundLead(opts.tenantId, {
          name: input.name as string | undefined,
          email: input.email as string | undefined,
          phone: input.phone as string | undefined,
          company: input.company as string | undefined,
          title: input.title as string | undefined,
          description: `${reason}\n\n${summary}`,
        });
        channels.push(`created CRM lead (${id})`);
      } catch {
        // No CRM connected or write failed — the notify channels below cover it.
      }
    }
    // Slack adapter (if configured).
    if (config.slack_webhook_url) {
      channels.push(await notifySlack(config.slack_webhook_url, body, opts));
    }
    // Email is the working default for routing to the team.
    if (config.notify_email) {
      channels.push(
        await sendEmail(config.notify_email, `New qualified lead — ${config.company_name}`, body, opts),
      );
    }

    return channels.length
      ? `Lead routed to sales — ${channels.join("; ")}.`
      : "Lead recorded (connect a CRM or set notify_email/Slack to route it).";
  }

  if (tool === "book_meeting") {
    // No external API: we surface the customer's booking link; the prospect
    // self-books. (Real calendar hold = an adapter seam for later.)
    const link =
      (input.link as string) || config.implementation.work_now.detail || "the booking link";
    return `Shared the booking link with the prospect: ${link}`;
  }

  return `Unknown effect: ${tool}`;
}
