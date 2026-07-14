/**
 * ============================================================================
 *  System attribution — what shows up in SF when our writes land
 * ============================================================================
 *
 *  When the writer updates a Salesforce text field (NextStep, Description),
 *  we append a small suffix so any rep / manager / CRO opening the SF
 *  record sees who actually made the change. This is the in-CRM audit
 *  trail visible alongside SF's standard LastModifiedById.
 *
 *  Format:
 *    "<original value> · <SystemName> from <callSource> on <YYYY-MM-DD>"
 *
 *  Example after wrap:
 *    "5/13: pricing call · RevOps from intro_call_2026-03-06 on 2026-05-09"
 *
 *  Idempotent: a prior tag is stripped before appending so re-writes
 *  don't nest. System name is configurable via REVOPS_SYSTEM_NAME env
 *  (default "RevOps") — when the product is renamed, tags update on
 *  the next write.
 *
 *  This module is pure (no I/O, no DB, no SF) so it's directly testable
 *  and importable from anywhere without env requirements.
 * ============================================================================
 */

/** System name shown in SF when our writes land. Configurable via env
 *  so the deployed name can change without code edits. */
export function systemName(): string {
  const fromEnv = process.env.REVOPS_SYSTEM_NAME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : "RevOps";
}

/** Fields that get the system-attribution tag appended. Whitelist —
 *  if you want to wrap a new field, add it here explicitly. Don't
 *  wrap structured fields (booleans, picklists, currency, dates) —
 *  the suffix would corrupt their type. */
export const TAG_WRAPPED_FIELDS: ReadonlySet<string> = new Set([
  "NextStep",
  "Description",
]);

/** Strip a previously-applied tag so re-writes don't nest. Pattern is
 *  conservative — only matches the exact suffix shape we generate. */
export function stripPriorTag(value: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Two patterns we generate:
  //   1. " · <name> from <source> on YYYY-MM-DD"
  //   2. " · auto-logged by <name> on YYYY-MM-DD"
  const pattern = new RegExp(
    `\\s*·\\s*(auto-logged by\\s+)?${escapedName}(\\s+from[^·]*?)?(\\s+on\\s+\\d{4}-\\d{2}-\\d{2})?\\s*$`,
    "i",
  );
  return value.replace(pattern, "").trimEnd();
}

/** Append a system-attribution suffix to a text-field value. Idempotent
 *  in the sense that prior tags are stripped before appending. */
export function wrapWithSystemAttribution(
  rawValue: string,
  callSource: string | null | undefined,
  name: string = systemName(),
  /** Override for testing. Defaults to today (UTC, YYYY-MM-DD). */
  date: string = new Date().toISOString().slice(0, 10),
): string {
  const cleaned = stripPriorTag(rawValue, name);
  if (callSource && callSource.length > 0) {
    return `${cleaned} · ${name} from ${callSource} on ${date}`;
  }
  return `${cleaned} · auto-logged by ${name} on ${date}`;
}
