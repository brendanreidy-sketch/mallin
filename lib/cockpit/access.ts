import { currentUser } from '@clerk/nextjs/server';

/**
 * Who can see the cockpit (Altitude 1 — the book — and Altitude 2 — a deal).
 *
 * TODAY: a hard owner allowlist. This is Brendan's personal operating view while
 * the surface is still evolving — it is deliberately NOT "any logged-in Clerk
 * user." A random sign-up must never land in the book. The route is also
 * protected by middleware (login required); this gate is the second, sharper
 * check: login gets you to the door, the allowlist decides if it opens.
 *
 * EVOLUTION PATH (per intake_primitive_doctrine): when the cockpit graduates
 * from "Brendan's view" to a per-tenant surface, replace this allowlist with a
 * tenant-membership check (orgId / artifact ownership) — NOT a longer hardcoded
 * list. The allowlist is scaffolding; membership is the product. Pages call
 * `hasCockpitAccess()` and never need to change when that swap happens.
 */
const COCKPIT_OWNER_EMAILS = new Set<string>([
  'brendan@mallin.io',
  // Brendan's current working Clerk account. brendan@mallin.io is the intended
  // owner identity but isn't provisioned in the live Clerk instance yet; this
  // is the address he actually signs in with today. Both resolve to the owner.
  'builtalone@gmail.com',
]);

/** Signed-in user's primary email, lowercased — or null if not resolvable. */
async function currentEmail(): Promise<string | null> {
  const user = await currentUser().catch(() => null);
  if (!user) return null;
  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress;
  return primary ? primary.toLowerCase() : null;
}

/** True only for the cockpit owner(s). The single gate every cockpit route uses. */
export async function hasCockpitAccess(): Promise<boolean> {
  const email = await currentEmail();
  return email !== null && COCKPIT_OWNER_EMAILS.has(email);
}
