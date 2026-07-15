import { supabaseAdmin } from "@/lib/db/client";

/**
 * Company graph — links separate personal workspaces that belong to the same
 * real-world company, WITHOUT merging them.
 *
 * Product model: every rep keeps their own private workspace and their own
 * deals. But Mallín's coaching memory is COMPANY-scoped — a new deal is
 * strategized against what won / lost / stalled across every rep at the same
 * company. Deals stay private; only the LESSONS travel. This is the read-side
 * link that makes that possible. It NEVER touches Clerk orgs, memberships, or
 * setActive, so it can't break the signup/auth path the way a shared-workspace
 * model did — it only reads owner_email/email_domain, already captured at
 * signup (see lib/auth/ensure-personal-workspace.ts, migration 018).
 *
 * The link key is the signup email's company identity:
 *   • Real company domain (acme.com) → key = the domain. Everyone at the
 *     domain is one company.
 *   • Consumer domain (gmail.com, …) → key = the BASE MAILBOX. Only plus-
 *     aliases of the SAME inbox link (founder@gmail vs founder+rep2@gmail);
 *     two DIFFERENT gmail accounts never pool into a fake "company." This is
 *     also what lets us test team-coaching with a gmail plus-alias.
 *
 * Fails closed: any gap resolves to just the caller's own tenant, so coaching
 * degrades to single-workspace rather than breaking or leaking across strangers.
 */

// Free/consumer mailbox providers — an address here is an individual, never a
// company. Two of them link ONLY when they're plus-aliases of the same inbox.
export const CONSUMER_EMAIL_DOMAINS = new Set<string>([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "gmx.com", "gmx.net", "mail.com", "zoho.com",
  "proton.me", "protonmail.com", "pm.me",
  "yandex.com", "yandex.ru", "fastmail.com", "hey.com",
  "qq.com", "163.com", "126.com", "foxmail.com",
]);

export interface CompanyKey {
  /** Comparable identity string — a domain for companies, a base mailbox for consumers. */
  key: string;
  /** true = real company domain (whole domain groups); false = consumer mailbox. */
  isCompany: boolean;
}

/**
 * Derive a company-identity key from a signup email. Returns null when the
 * email is missing/unparseable (caller then treats the tenant as solo).
 */
export function companyKeyForEmail(email: string | null | undefined): CompanyKey | null {
  if (!email || !email.includes("@")) return null;
  const at = email.lastIndexOf("@");
  let local = email.slice(0, at).trim().toLowerCase();
  let domain = email.slice(at + 1).trim().toLowerCase();
  if (!local || !domain) return null;

  if (!CONSUMER_EMAIL_DOMAINS.has(domain)) {
    // Real company: the domain IS the company.
    return { key: domain, isCompany: true };
  }

  // Consumer mailbox: normalize to the base inbox so only plus-aliases of the
  // SAME mailbox collide.
  //   • strip the +suffix on the local part (universal Gmail/Outlook/… behavior)
  //   • Gmail: dots in the local part are insignificant; googlemail == gmail
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  if (!local) return null;
  return { key: `${local}@${domain}`, isCompany: false };
}

/**
 * All tenant ids belonging to the SAME company as `tenantId` (self included).
 * Resolves via each tenant's stored owner_email/email_domain. Never throws —
 * on any gap returns [tenantId] so coaching degrades to single-workspace.
 */
export async function getCompanyTenantIds(tenantId: string): Promise<string[]> {
  try {
    const { data: self } = await supabaseAdmin
      .from("tenants")
      .select("owner_email, email_domain")
      .eq("id", tenantId)
      .maybeSingle();

    const selfKey = companyKeyForEmail(self?.owner_email);
    // No usable identity → solo. (email_domain alone can't disambiguate a
    // consumer base-mailbox, so a stored owner_email is required to federate.)
    if (!selfKey) return [tenantId];

    // Candidate pool: everyone sharing the raw stored domain. For a company
    // domain that's already the answer; for a consumer domain we then filter
    // down to the same base mailbox in code.
    const domain = selfKey.isCompany ? selfKey.key : (self?.email_domain ?? null);
    if (!domain) return [tenantId];

    const { data: candidates } = await supabaseAdmin
      .from("tenants")
      .select("id, owner_email")
      .eq("email_domain", domain);

    const ids = new Set<string>([tenantId]);
    for (const c of candidates ?? []) {
      if (selfKey.isCompany) {
        ids.add(c.id);
      } else {
        const k = companyKeyForEmail(c.owner_email);
        if (k && !k.isCompany && k.key === selfKey.key) ids.add(c.id);
      }
    }
    return [...ids];
  } catch {
    return [tenantId];
  }
}
