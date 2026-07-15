import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/client";
import { FREE_DEAL_LIMIT } from "@/lib/billing/stripe";
import { sendSignupNotification } from "@/lib/email/resend";

/**
 * Idempotently ensures the current user has a personal workspace:
 *   1. a Clerk organization (the user is its admin), and
 *   2. a Supabase `tenants` row with slug = the Clerk org id.
 *
 * This is the self-serve, in-app equivalent of
 * scripts/clerk/provision-demo-partner.mjs — but triggered by the user on
 * signup rather than run manually, and with is_demo=false (real data).
 *
 * The existing data layer is org-scoped: getCurrentTenant() resolves
 * Clerk org_id → tenants.slug. So every B2C user needs exactly one org +
 * one tenant for the rest of the app to work unchanged. We create a
 * PERSONAL org per user rather than reworking tenant-context.
 *
 * IMPORTANT — active-org handoff: creating the org server-side does NOT make
 * it the session's *active* org. The caller must finish the handoff on the
 * client with setActive({ organization: orgId }) (see app/welcome). Until
 * then, auth().orgId stays null and getCurrentTenant() will throw.
 *
 * Returns the resolved orgId + tenantId, and whether the org was newly
 * created this call (used to gate the one-time welcome email).
 */
export interface EnsureWorkspaceResult {
  orgId: string;
  tenantId: string;
  createdOrg: boolean;
}

export async function ensurePersonalWorkspace(): Promise<EnsureWorkspaceResult> {
  const { userId, orgId: activeOrgId } = await auth();
  if (!userId) {
    throw new Error("ensurePersonalWorkspace: no authenticated user");
  }

  const client = await clerkClient();

  // 1. Resolve an org for this user (active → any existing membership → create).
  let orgId = activeOrgId ?? null;
  if (!orgId) {
    const memberships = await client.users.getOrganizationMembershipList({
      userId,
      limit: 1,
    });
    if (memberships.data.length > 0) {
      orgId = memberships.data[0].organization.id;
    }
  }

  let createdOrg = false;
  const user = await client.users.getUser(userId);
  if (!orgId) {
    const first = user.firstName?.trim();
    const orgName = first ? `${first}'s workspace` : "Personal workspace";
    // createdBy makes the user an org:admin automatically — no separate
    // membership call needed.
    const org = await client.organizations.createOrganization({
      name: orgName,
      createdBy: userId,
    });
    orgId = org.id;
    createdOrg = true;
  }

  // 2. Ensure the Supabase tenant (slug = orgId). Idempotent.
  const { data: existing } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", orgId)
    .maybeSingle();

  let tenantId: string;
  if (existing) {
    tenantId = existing.id;
  } else {
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.primaryEmailAddress?.emailAddress ||
      "Personal";
    // crm_provider is NOT NULL with a CHECK ('salesforce'|'hubspot') and no
    // default (migration 005). A B2C tenant has no CRM connected, so the
    // value is dormant until/unless they wire one up — default to the
    // status-quo 'salesforce'. enabled_sinks defaults to {'slack'} at the DB
    // level, so it's omitted.
    const baseRow = {
      slug: orgId,
      name: displayName,
      is_demo: false,
      crm_provider: "salesforce",
    };
    // New self-serve workspaces start on the free plan (first 3 deals free).
    // But plan/deal_limit only exist once migration 016 is applied — so try
    // with them and, if the columns aren't there yet, fall back to the base
    // row. Signup must NEVER break on migration timing.
    let inserted: { id: string } | null = null;
    let error: { message: string } | null = null;
    ({ data: inserted, error } = await supabaseAdmin
      .from("tenants")
      .insert({ ...baseRow, plan: "free", deal_limit: FREE_DEAL_LIMIT, mode: "solo" })
      .select("id")
      .single());
    if (error) {
      ({ data: inserted, error } = await supabaseAdmin
        .from("tenants")
        .insert(baseRow)
        .select("id")
        .single());
    }
    if (error || !inserted) {
      throw new Error(
        `ensurePersonalWorkspace: tenant create failed for org ${orgId}: ${error?.message ?? "no row"}`,
      );
    }
    tenantId = inserted.id;

    // Passive attribution on a freshly created workspace — owner email +
    // domain (free firmographics / team-formation signal) + first-touch UTM
    // from the /start cookie. Best-effort: columns exist after migration 018;
    // before that, the update simply no-ops. Never blocks signup.
    try {
      const email = user.primaryEmailAddress?.emailAddress ?? null;
      const domain = email && email.includes("@") ? email.split("@").pop()!.toLowerCase() : null;
      let utm_source: string | null = null;
      let utm_campaign: string | null = null;
      let utm_medium: string | null = null;
      let referrer: string | null = null;
      try {
        const raw = (await cookies()).get("mallin_attr")?.value;
        if (raw) {
          const a = JSON.parse(decodeURIComponent(raw)) as Record<string, string>;
          utm_source = a.utm_source || null;
          utm_campaign = a.utm_campaign || null;
          utm_medium = a.utm_medium || null;
          referrer = a.referrer || null;
        }
      } catch {
        // no/garbled cookie — fine
      }
      await supabaseAdmin
        .from("tenants")
        .update({ owner_email: email, email_domain: domain, utm_source, utm_campaign, utm_medium, referrer })
        .eq("id", tenantId);

      // First/last name captured at signup (Clerk), stored next to owner_email
      // so the contact's name + email live together as structured fields.
      // Separate update so a pre-migration-026 tenant (columns absent) can't
      // break the owner_email write above. Best-effort; never blocks signup.
      await supabaseAdmin
        .from("tenants")
        .update({
          first_name: user.firstName ?? null,
          last_name: user.lastName ?? null,
        })
        .eq("id", tenantId);

      // Founder-receives-every-signup: ping brendan@mallin.io so a human can
      // reach out same-day. Best-effort; no-ops if RESEND_API_KEY isn't set.
      if (email) {
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
        await sendSignupNotification({
          email,
          name: fullName || null,
          domain,
          utm_source,
          utm_campaign,
          referrer,
        });
      }
    } catch {
      // attribution columns may not exist yet (migration 018) — ignore
    }

    // Signup-import: claim any free-try briefs saved under this email and
    // materialize them as deals in the new workspace, so "Save it" on /try is
    // real. Dynamic import keeps the intake chain out of the signup hot path.
    // Best-effort — never breaks signup; no-ops pre-migration-028/029.
    try {
      const importEmail = user.primaryEmailAddress?.emailAddress;
      if (importEmail) {
        const { importTryLeadsForEmail } = await import("@/lib/intake/import-try-leads");
        await importTryLeadsForEmail(importEmail, tenantId, userId);
      }
    } catch (e) {
      console.warn(`[ensureWorkspace] try-lead import skipped: ${(e as Error).message}`);
    }
  }

  return { orgId, tenantId, createdOrg };
}
