/**
 * ============================================================================
 *  Salesforce → Substrate field mapping (generic, standard-fields only)
 * ============================================================================
 *
 *  Vendor-neutral mapping between Salesforce Opportunity STANDARD fields
 *  and our substrate model. Uses only Salesforce-built-in fields (same
 *  shape across every org) — no org-specific custom ("__c") fields.
 *
 *  The write-back feature is deferred/reserved. When a tenant's own SF
 *  custom schema is introspected via describeOpportunity(), org-specific
 *  fields can be layered on per-tenant at that time. Until then the
 *  engine reasons against standard fields, which every org has.
 *
 *  TIERS (what the system may auto-write / suggest / never write):
 *    - auto     — high-confidence, low-risk, easy to revert
 *    - suggest  — default; requires rep approval before write
 *    - readonly — forecast-impacting or system-managed; never written
 * ============================================================================
 */

/**
 * Standard Salesforce Opportunity fields — built in to every org.
 */
export const SF_OPPORTUNITY_FIELDS = {
  standard: [
    "Id",
    "Name",
    "AccountId",
    "OwnerId",
    "StageName",
    "Amount",
    "CloseDate",
    "Probability",
    "ForecastCategory",
    "ForecastCategoryName",
    "Type",
    "LeadSource",
    "Description",
    "NextStep",
    "CreatedDate",
    "CreatedById",
    "LastModifiedDate",
    "LastModifiedById",
    "LastActivityDate",
    "IsClosed",
    "IsWon",
  ],
} as const;

/**
 * Salesforce-platform fields that are NOT directly writable via the
 * REST API — they're system-computed from related records or from Stage.
 *
 *   - LastActivityDate: derived from the most recent Task/Event.
 *     PATCH calls against it are silently ignored on most orgs. The
 *     correct path is to create a Task/Event, which SF then rolls up.
 *   - IsClosed / IsWon / IsArchived: computed from StageName.
 *   - CreatedDate / LastModifiedDate: managed by SF.
 *   - Probability: computed from Stage in many configurations.
 *
 * These are forced into the readonly tier so the dry-run never builds a
 * payload that would no-op on apply.
 */
export const SF_SYSTEM_MANAGED_FIELDS = [
  "LastActivityDate", // → derived from Task/Event; use createTask() instead
  "IsClosed",
  "IsWon",
  "IsArchived",
  "CreatedDate",
  "LastModifiedDate",
  "CreatedById",
  "LastModifiedById",
  "Probability", // typically stage-derived
] as const;

/**
 * Tier classification — what the system can auto-write, suggest, or
 * never write back. Standard fields only.
 */
export const SF_FIELD_TIERS = {
  // Auto-write tier — high-confidence, low-risk, easy to revert.
  auto: [
    "NextStep",
    "Description", // append-only summary
  ],

  // Suggest + approve tier — no standard fields default here today; the
  // fallthrough in tierForField() sends anything not listed elsewhere to
  // "suggest". Kept explicit for future per-tenant custom fields.
  suggest: [] as string[],

  // Never auto — forecast-impacting fields. Rep must edit in SF directly.
  readonly: [
    "StageName",
    "Amount",
    "CloseDate",
    "ForecastCategory",
    "ForecastCategoryName",
    "Probability",
    "Type",
    "IsClosed",
    "IsWon",
  ],
} as const;

/**
 * Returns the tier for a given field name. Defaults to "suggest" — the
 * safe default for anything not explicitly classified.
 *
 * SF system-managed fields are forced to readonly regardless of any
 * other classification — they cannot be written via REST PATCH.
 */
export function tierForField(
  fieldName: string,
): "auto" | "suggest" | "readonly" {
  if ((SF_SYSTEM_MANAGED_FIELDS as readonly string[]).includes(fieldName)) {
    return "readonly";
  }
  if ((SF_FIELD_TIERS.readonly as readonly string[]).includes(fieldName)) {
    return "readonly";
  }
  if ((SF_FIELD_TIERS.auto as readonly string[]).includes(fieldName)) {
    return "auto";
  }
  return "suggest";
}

/**
 * Build a SOQL field list for opportunity queries. Standard fields only.
 * Caller can pare down for specific use cases.
 */
export function allOpportunityFields(): string[] {
  return [...SF_OPPORTUNITY_FIELDS.standard];
}
