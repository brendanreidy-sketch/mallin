import "server-only";

/**
 * internal-brief-access — the SINGLE source of truth for the internal-brief
 * rollout gate. It governs BOTH surfaces:
 *   - whether the InternalBrief control renders on /prep (server component), and
 *   - whether POST /api/internal-brief accepts an enqueue.
 *
 * It reads the server-only INTERNAL_BRIEF_TENANT_ALLOWLIST at call time, so the
 * value baked into the DEPLOYED runtime governs (changing it requires a fresh
 * deployment). The env var is a comma-separated list of EXACT Supabase tenant
 * UUIDs. It is fail-closed:
 *   - absent / blank / whitespace-only / all-malformed  → disabled for everyone
 *   - only complete UUIDs are honored; malformed entries are silently dropped
 *   - exact matching only — no wildcard, no substring, no names/emails/orgs
 *
 * `import "server-only"` makes an accidental client import a build error (the env
 * var must never reach the browser). The parsed list is never exported and never
 * logged — only the boolean decision leaves this module.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True only when `tenantId` is an exact match in the configured allowlist. */
export function isInternalBriefEnabledForTenant(tenantId: string | null | undefined): boolean {
  if (!tenantId) return false;
  const id = tenantId.trim().toLowerCase();
  if (!UUID_RE.test(id)) return false; // the caller's tenant must be a real UUID
  const allow = (process.env.INTERNAL_BRIEF_TENANT_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s)); // drop blanks + malformed — they enable no one
  return allow.includes(id);
}
