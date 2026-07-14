/**
 * ============================================================================
 *  Substrate → Salesforce auto-match
 * ============================================================================
 *
 *  Given a substrate deal, score Salesforce opportunities for likelihood
 *  of being the same deal. Returns ranked candidates with confidence
 *  scores. Pure logic — caller does the SF query, this module only
 *  scores.
 *
 *  Design constraints (per Brendan's direction):
 *    - Read-only. Never writes anything.
 *    - Always returns requires_human_confirmation=true. The caller MUST
 *      surface a confirmation step. Auto-selecting a match is forbidden.
 *    - Confidence is informational, not authoritative. A 0.95 match
 *      still requires the human to confirm before downstream use.
 *
 *  Scoring weights (sum = 1.0):
 *    - 0.40 deal name similarity (most signal)
 *    - 0.30 account name similarity
 *    - 0.20 amount proximity
 *    - 0.10 close date proximity
 *
 *  Why these weights:
 *    Deal name is the strongest signal in CRM (reps name deals
 *    consistently across systems). Account is a strong cross-check.
 *    Amount and close date drift more — they're tiebreakers, not
 *    primary signals.
 * ============================================================================
 */

export interface SubstrateDealForMatch {
  name: string | null;
  account_name: string | null;
  amount: number | null;
  close_date: string | null; // YYYY-MM-DD
}

export interface SfOppCandidateInput {
  Id: string;
  Name: string;
  AccountName?: string | null; // joined from Account.Name
  Amount?: number | null;
  CloseDate?: string | null;
  StageName?: string | null;
  IsClosed?: boolean;
}

export interface MatchScoreBreakdown {
  name: number;
  account: number;
  amount: number;
  close_date: number;
}

export interface MatchCandidate {
  sf_id: string;
  sf_name: string;
  sf_account_name: string | null;
  sf_amount: number | null;
  sf_close_date: string | null;
  sf_stage: string | null;
  sf_is_closed: boolean;
  confidence: number; // 0–1
  score_breakdown: MatchScoreBreakdown;
  /** Human-readable signals contributing to (or against) the match. */
  evidence: string[];
}

export interface MatchResult {
  substrate: SubstrateDealForMatch;
  candidates: MatchCandidate[];
  best_match: MatchCandidate | null;
  /** Always true. The caller MUST surface a confirmation step before
   *  proceeding to use a match for any downstream operation. */
  requires_human_confirmation: true;
  /** Threshold metadata so callers / UI can render context. */
  thresholds: {
    confidence_for_strong_match: number;
    confidence_for_weak_match: number;
    min_confidence_returned: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// String similarity — token-set Jaccard with stop-word filtering
// ─────────────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "and",
  "&",
  "for",
  "to",
  "with",
  "evaluation",
  "deal",
  "opportunity",
  "renewal",
  "expansion",
  "inc",
  "llc",
  "corp",
  "ltd",
  "co",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Jaccard index over token sets. Returns 0–1. */
function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = new Set([...ta].filter((x) => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric / date proximity
// ─────────────────────────────────────────────────────────────────────────────

/** Amount proximity: 1.0 within 10%, linearly decaying to 0.0 at 50%
 *  delta. Anything >50% off is essentially no signal — most likely a
 *  different deal entirely. Treats either side null as 0 score. */
function amountProximity(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  if (a == null || b == null) return 0;
  if (a === 0 && b === 0) return 1;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 1;
  const delta = Math.abs(a - b) / max;
  if (delta <= 0.1) return 1;
  if (delta >= 0.5) return 0;
  // Linear decay between 10% and 50%: 0.1 → 1.0, 0.5 → 0.0
  return 1 - (delta - 0.1) / 0.4;
}

/** Close date proximity: 1.0 within 30 days, 0.5 at 90, 0.0 at 365+. */
function closeDateProximity(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (!a || !b) return 0;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  const daysApart = Math.abs(da - db) / (1000 * 60 * 60 * 24);
  if (daysApart <= 30) return 1;
  if (daysApart <= 90) return 1 - (daysApart - 30) / 120; // → 0.5 at 90
  if (daysApart <= 365) return 0.5 * (1 - (daysApart - 90) / 275); // → 0 at 365
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scoring function
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  name: 0.4,
  account: 0.3,
  amount: 0.2,
  close_date: 0.1,
} as const;

const MIN_CONFIDENCE_RETURNED = 0.15;
const STRONG_MATCH_THRESHOLD = 0.7;
const WEAK_MATCH_THRESHOLD = 0.4;

function scoreCandidate(
  substrate: SubstrateDealForMatch,
  candidate: SfOppCandidateInput,
): { confidence: number; breakdown: MatchScoreBreakdown; evidence: string[] } {
  const evidence: string[] = [];

  const nameScore = substrate.name
    ? jaccardSimilarity(substrate.name, candidate.Name)
    : 0;
  if (nameScore >= 0.5) {
    evidence.push(
      `Strong name overlap (substrate="${substrate.name}", sf="${candidate.Name}")`,
    );
  } else if (nameScore > 0) {
    evidence.push(`Partial name overlap (${(nameScore * 100).toFixed(0)}%)`);
  } else if (substrate.name) {
    evidence.push("No shared name tokens");
  }

  const accountScore =
    substrate.account_name && candidate.AccountName
      ? jaccardSimilarity(substrate.account_name, candidate.AccountName)
      : 0;
  if (accountScore >= 0.5) {
    evidence.push(
      `Account match (substrate="${substrate.account_name}", sf="${candidate.AccountName}")`,
    );
  } else if (substrate.account_name && !candidate.AccountName) {
    evidence.push("SF candidate has no AccountName");
  } else if (accountScore === 0 && substrate.account_name) {
    evidence.push(
      `Account names differ ("${substrate.account_name}" vs "${candidate.AccountName ?? "—"}")`,
    );
  }

  const amountScore = amountProximity(substrate.amount, candidate.Amount);
  if (amountScore >= 0.9 && substrate.amount && candidate.Amount) {
    evidence.push(
      `Amount within 10% ($${substrate.amount.toLocaleString()} vs $${candidate.Amount.toLocaleString()})`,
    );
  } else if (substrate.amount && candidate.Amount && amountScore < 0.5) {
    evidence.push(
      `Amount differs significantly ($${substrate.amount.toLocaleString()} vs $${candidate.Amount.toLocaleString()})`,
    );
  }

  const closeDateScore = closeDateProximity(
    substrate.close_date,
    candidate.CloseDate,
  );
  if (closeDateScore >= 0.9) {
    evidence.push(
      `Close dates within 30 days (${substrate.close_date} vs ${candidate.CloseDate})`,
    );
  }

  if (candidate.IsClosed) {
    evidence.push("⚠ SF opp is already closed");
  }

  const confidence =
    nameScore * WEIGHTS.name +
    accountScore * WEIGHTS.account +
    amountScore * WEIGHTS.amount +
    closeDateScore * WEIGHTS.close_date;

  return {
    confidence,
    breakdown: {
      name: nameScore,
      account: accountScore,
      amount: amountScore,
      close_date: closeDateScore,
    },
    evidence,
  };
}

/**
 * Rank SF opp candidates against a substrate deal.
 *
 * @param substrate substrate deal shape (name + account + amount + close)
 * @param candidates flat array of SF opp records (caller has already
 *        joined Account.Name)
 * @param options.maxResults cap on candidates returned (default 5)
 * @returns ranked candidates + best_match + flags
 */
export function matchSubstrateToSf(
  substrate: SubstrateDealForMatch,
  candidates: SfOppCandidateInput[],
  options: { maxResults?: number } = {},
): MatchResult {
  const maxResults = options.maxResults ?? 5;

  const scored = candidates
    .map<MatchCandidate>((c) => {
      const { confidence, breakdown, evidence } = scoreCandidate(substrate, c);
      return {
        sf_id: c.Id,
        sf_name: c.Name,
        sf_account_name: c.AccountName ?? null,
        sf_amount: c.Amount ?? null,
        sf_close_date: c.CloseDate ?? null,
        sf_stage: c.StageName ?? null,
        sf_is_closed: !!c.IsClosed,
        confidence,
        score_breakdown: breakdown,
        evidence,
      };
    })
    .filter((c) => c.confidence >= MIN_CONFIDENCE_RETURNED)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults);

  const best_match = scored[0] ?? null;

  return {
    substrate,
    candidates: scored,
    best_match,
    requires_human_confirmation: true,
    thresholds: {
      confidence_for_strong_match: STRONG_MATCH_THRESHOLD,
      confidence_for_weak_match: WEAK_MATCH_THRESHOLD,
      min_confidence_returned: MIN_CONFIDENCE_RETURNED,
    },
  };
}

/**
 * Match-strength label, usable in UI as a heuristic. Never a substitute
 * for the human confirmation step.
 */
export function matchStrength(
  confidence: number,
): "strong" | "weak" | "uncertain" {
  if (confidence >= STRONG_MATCH_THRESHOLD) return "strong";
  if (confidence >= WEAK_MATCH_THRESHOLD) return "weak";
  return "uncertain";
}
