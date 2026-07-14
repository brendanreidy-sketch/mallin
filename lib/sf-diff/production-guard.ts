/**
 * ============================================================================
 *  Production guard for Salesforce debug surfaces
 * ============================================================================
 *
 *  /api/sf/diff and /sf/diff are READ-ONLY but they hit live Salesforce
 *  data. Leaving them public on a production URL is unsafe — anyone who
 *  can guess a substrate dealId and SF opp id sees both side by side.
 *
 *  Policy:
 *    - Local dev (NODE_ENV !== "production"):     allow
 *    - Vercel preview (NODE_ENV === "production"  but VERCEL_ENV === "preview"
 *                                                 and SF_DEBUG_ENABLED=true): allow
 *    - Vercel prod (NODE_ENV === "production"):    deny unless SF_DEBUG_ENABLED=true
 *
 *  Default-deny in production. The opt-in env flag SF_DEBUG_ENABLED=true
 *  exists so we can flip these on temporarily for an admin debug session
 *  without a redeploy if needed.
 *
 *  Until proper RBAC + admin-role check exists, this is the right floor.
 * ============================================================================
 */

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

export function checkSfDebugAccess(): GuardResult {
  const isProd = process.env.NODE_ENV === "production";
  const explicitlyEnabled = process.env.SF_DEBUG_ENABLED === "true";

  if (!isProd) {
    return {
      allowed: true,
      reason: "non-production environment (NODE_ENV != 'production')",
    };
  }
  if (explicitlyEnabled) {
    return {
      allowed: true,
      reason: "production with SF_DEBUG_ENABLED=true (admin opt-in)",
    };
  }
  return {
    allowed: false,
    reason:
      "production environment. Set SF_DEBUG_ENABLED=true to enable temporarily, or move behind admin auth before exposing.",
  };
}
