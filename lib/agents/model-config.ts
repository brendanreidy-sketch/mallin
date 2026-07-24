/**
 * model-config — the single shared source for Mallín's default model tier.
 *
 * The Core Intelligence and Execution agents run on the Sonnet tier
 * (claude-sonnet-4-6); downstream features (e.g. the internal executive brief)
 * import this constant rather than defining their own default, so nothing
 * drifts onto a stale value. Callers may still inject an explicit override
 * (e.g. tests) — this only fixes the DEFAULT.
 *
 * No production environment variable is introduced here.
 */

/** Shared Sonnet-tier default, aligned with the core-cognition agents. */
export const SONNET_MODEL = "claude-sonnet-4-6";
