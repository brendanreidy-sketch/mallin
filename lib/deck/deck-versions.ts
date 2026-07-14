/**
 * Deck version history — the pure, view-agnostic logic for exposing a deal's
 * PRIOR customer-facing decks alongside the current one.
 *
 * `account_intelligence_artifacts` is an immutable ledger: each regeneration
 * inserts a new row and flips the prior one to `is_current = false`. A deal
 * therefore accumulates a history of artifacts (one per call / regeneration).
 * The deck route can render ANY of them — but only ever one that belongs to the
 * opportunity that owns the share_token.
 *
 * SECURITY: `selectArtifactRow` is the single choke point. It only ever returns
 * a row from the `rows` list it was handed — a list the caller MUST have
 * fetched with `opportunity_id = opp.id`. An unknown / foreign artifact id can
 * never resolve to a row, so it falls back to the current one. There is no path
 * that trusts a caller-supplied id without confirming it maps to this deal.
 */

/** A history row as fetched from `account_intelligence_artifacts` for ONE
 *  opportunity. Kept minimal on purpose — the label fields live in `artifact`. */
export interface DeckArtifactRow {
  id: string;
  is_current: boolean;
  generated_at: string | null;
  created_at: string | null;
  artifact: unknown;
}

/** Client-safe version summary: id + label + isCurrent only. NEVER the full
 *  artifact (that would leak rep-internal fields to the browser). */
export interface DeckVersion {
  id: string;
  label: string;
  isCurrent: boolean;
}

/** Pull a human label off an artifact's meeting block, with safe fallbacks. */
export function versionLabel(row: DeckArtifactRow): string {
  const meeting = (row.artifact as { meeting?: { title?: string; date?: string; meeting_type?: string } } | null)
    ?.meeting;
  const title = meeting?.title?.trim();
  const date = meeting?.date?.trim();
  const type = meeting?.meeting_type?.trim();

  if (title) return title;
  // No curated title — assemble something readable from type + date.
  const parts = [type ? type[0].toUpperCase() + type.slice(1) : "Version", date].filter(Boolean);
  return parts.join(" — ");
}

/** Newest-first sort key for a history row. Prefer `generated_at` (when the
 *  intel was produced), fall back to `created_at` (row insert). */
function sortKey(row: DeckArtifactRow): number {
  const t = Date.parse(row.generated_at ?? row.created_at ?? "");
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Build the client-safe version list: newest first, each labeled, the current
 * one flagged. Returns [] when there's zero or one artifact (no switcher UI
 * worth showing for a single version — the caller can decide to hide it).
 */
export function buildVersionList(rows: DeckArtifactRow[]): DeckVersion[] {
  return [...rows]
    .sort((a, b) => sortKey(b) - sortKey(a))
    .map((row) => ({
      id: row.id,
      label: versionLabel(row),
      isCurrent: row.is_current === true,
    }));
}

/**
 * Choose which artifact row to render.
 *
 * - `requestedId` is the untrusted `?v=` param (or undefined for default).
 * - `rows` MUST be the artifacts fetched for THIS opportunity only.
 *
 * Resolution:
 *   1. If a requestedId is given AND it matches a row in `rows`, return it.
 *      (This is the ONLY way a specific prior version renders — and it can only
 *      ever be a row from this opportunity's own history.)
 *   2. Otherwise return the current row (`is_current = true`).
 *   3. If there's no current row, fall back to the newest row.
 *   4. If `rows` is empty, return null (caller 404s).
 *
 * A foreign / unknown id silently falls through to the current version — it is
 * never trusted, never fetched separately, never leaks another deal's deck.
 */
export function selectArtifactRow(
  rows: DeckArtifactRow[],
  requestedId?: string | null,
): DeckArtifactRow | null {
  if (rows.length === 0) return null;

  if (requestedId) {
    const match = rows.find((r) => r.id === requestedId);
    if (match) return match;
    // Unknown id → do NOT error and do NOT trust it; fall through to current.
  }

  const current = rows.find((r) => r.is_current === true);
  if (current) return current;

  // No flagged-current row (shouldn't happen, but be safe): newest wins.
  return [...rows].sort((a, b) => sortKey(b) - sortKey(a))[0];
}
