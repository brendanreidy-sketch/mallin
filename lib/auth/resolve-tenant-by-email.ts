/**
 * Resolves a rep's tenant + Clerk user id from their email address.
 *
 * Used by the intake CLI (scripts/intake/intake-deal.ts) so a rep can
 * be addressed by email rather than hand-edited tenant_id/user_id
 * placeholders in per-deal seed scripts.
 *
 * Flow:
 *   1. GET /v1/users?email_address=<email> via Clerk REST API
 *   2. Read the user's organization memberships
 *   3. Use the user's first (or "primary") org's id as tenants.slug lookup
 *   4. Return { tenantId, ownerId, orgId, isDemo }
 *
 * Throws on any failure — the CLI surfaces a clean error to the
 * caller instead of seeding into the wrong place.
 *
 * Requires: CLERK_SECRET_KEY in env (server-side only).
 */

import { supabaseAdmin } from "@/lib/db/client";

const CLERK_BASE = "https://api.clerk.com/v1";

export interface RepIdentity {
  /** UUID of the tenants row */
  tenantId: string;
  /** Clerk user id (e.g. user_xxx) */
  ownerId: string;
  /** Clerk org id (matches tenants.slug) */
  orgId: string;
  /** Whether the tenant is flagged demo */
  isDemo: boolean;
  /** Rep's email as Clerk has it on file */
  email: string;
  /** Rep's display name from Clerk */
  name: string | null;
}

async function clerkFetch<T>(path: string): Promise<T> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new Error(
      "CLERK_SECRET_KEY not set — required to resolve rep identity from email",
    );
  }
  const res = await fetch(`${CLERK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Clerk API ${path} failed: ${res.status} ${res.statusText} — ${body}`,
    );
  }
  return (await res.json()) as T;
}

interface ClerkUser {
  id: string;
  email_addresses: Array<{ id: string; email_address: string }>;
  first_name: string | null;
  last_name: string | null;
}

interface ClerkOrgMembership {
  id: string;
  organization: { id: string; name: string };
  role: string;
}

interface ClerkPaginated<T> {
  data: T[];
  total_count: number;
}

export async function resolveTenantByEmail(
  email: string,
): Promise<RepIdentity> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) {
    throw new Error(`Invalid email: "${email}"`);
  }

  // /v1/users returns a bare array; /v1/users/:id/organization_memberships
  // returns the paginated { data, total_count } shape.
  const users = await clerkFetch<ClerkUser[]>(
    `/users?email_address=${encodeURIComponent(normalized)}`,
  );
  const user = users[0];
  if (!user) {
    throw new Error(
      `No Clerk user found for "${normalized}". Provision the user first via scripts/clerk/provision-demo-partner.mjs.`,
    );
  }

  const membershipsResp = await clerkFetch<ClerkPaginated<ClerkOrgMembership>>(
    `/users/${user.id}/organization_memberships`,
  );
  const memberships = membershipsResp.data ?? [];
  if (memberships.length === 0) {
    throw new Error(
      `Clerk user ${user.id} has no organization memberships. Provision an org or add to one.`,
    );
  }
  // Use the first membership. Reps in multiple orgs would need a
  // --org-id flag — defer until the n=multi case actually shows up.
  const orgId = memberships[0].organization.id;

  const { data: tenant, error } = await supabaseAdmin
    .from("tenants")
    .select("id, is_demo, slug")
    .eq("slug", orgId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Tenant lookup failed for Clerk org "${orgId}": ${error.message}`,
    );
  }
  if (!tenant) {
    throw new Error(
      `No tenant row for Clerk org "${orgId}". Run scripts/clerk/provision-demo-partner.mjs to create one.`,
    );
  }

  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    tenantId: tenant.id,
    ownerId: user.id,
    orgId,
    isDemo: tenant.is_demo ?? false,
    email: normalized,
    name: displayName || null,
  };
}
