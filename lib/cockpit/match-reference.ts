/**
 * Reference matcher — picks the single closest closed-won customer to cite while
 * working a live opp. Opinionated by design (product north star: ONE primary
 * thing): we return the best fit, not a shortlist.
 *
 * Score = industry proximity (Jaccard over industry tags) + module overlap
 * (Jaccard over module footprint) + a competitive-overlap bonus when the
 * reference BEAT a competitor that is live in the current deal. That bonus is
 * the operator-grade signal: "you're up against Vantage, here's a comparable
 * shop where we beat Vantage and won."
 *
 * Everything resolves to real deals in the book — the reference links back to
 * its own cockpit so the proof is one click from its evidence trail.
 */

import {
  DEAL_PROFILES,
  REFERENCES,
  getDealProfile,
  type ModuleKey,
  type ReferenceCustomer,
} from './reference-library';

export interface ReferenceMatch {
  reference: ReferenceCustomer;
  /** 0..1 overall fit. */
  score: number;
  /** Shared modules between the open deal and the reference. */
  sharedModules: ModuleKey[];
  /** Industry tags both deals share. */
  sharedIndustryTags: string[];
  /** Live competitors in the current deal that this reference beat. */
  competitorOverlap: string[];
  /** Short, rep-facing reason this is the pick. */
  reason: string;
}

function jaccard<T>(a: T[], b: T[]): { score: number; shared: T[] } {
  const sa = new Set(a);
  const sb = new Set(b);
  const shared = [...sa].filter((x) => sb.has(x));
  const union = new Set([...a, ...b]);
  return { score: union.size === 0 ? 0 : shared.length / union.size, shared };
}

const W_INDUSTRY = 0.5;
const W_MODULES = 0.4;
const W_COMPETITOR = 0.1;

/**
 * Best-fit closed-won reference for the given open deal, or null if there is no
 * usable comparable (no profile, or the only candidate is the deal itself).
 */
export function matchReference(currentDealId: string): ReferenceMatch | null {
  const current = getDealProfile(currentDealId);
  if (!current) return null;

  let best: ReferenceMatch | null = null;

  for (const ref of REFERENCES) {
    if (!ref.referenceable) continue;
    if (ref.dealId === currentDealId) continue; // never cite the deal to itself
    const refProfile = DEAL_PROFILES[ref.dealId];
    if (!refProfile) continue;

    const industry = jaccard(current.industryTags, refProfile.industryTags);
    const modules = jaccard(current.modules, refProfile.modules);
    const competitorOverlap = current.competitors.filter((c) =>
      ref.competitorsBeaten.includes(c),
    );

    const score =
      W_INDUSTRY * industry.score +
      W_MODULES * modules.score +
      W_COMPETITOR * (competitorOverlap.length > 0 ? 1 : 0);

    if (!best || score > best.score) {
      best = {
        reference: ref,
        score,
        sharedModules: modules.shared,
        sharedIndustryTags: industry.shared,
        competitorOverlap,
        reason: buildReason(industry.shared, competitorOverlap),
      };
    }
  }

  // Comparability gate. A "closest comparable" that shares ZERO industry tags
  // and has NO competitive tie isn't a comparable — it's just an overlapping
  // back-office footprint. Per the honesty contract, show nothing rather than a
  // stretch the rep can see through. (ONE opinionated pick, or none.)
  if (best && best.sharedIndustryTags.length === 0 && best.competitorOverlap.length === 0) {
    return null;
  }

  return best;
}

function prettyTag(tag: string): string {
  return tag.replace(/_/g, ' ');
}

/**
 * The "why this surfaced" line — deliberately mirrors the comparability gate, so
 * the reason a rep reads is the SAME reason the card cleared the floor. We lead
 * with the industry profile; when there's no industry tie we fall back to the
 * competitive motion (the only other thing that earns a card). We do NOT verbal-
 * ize a module COUNT here — that's a pseudo-number; the modules render as their
 * own labeled chips, and the competitive tie has its own pill. This line owns
 * one job: the load-bearing why, in operator voice.
 */
function buildReason(sharedIndustryTags: string[], competitorOverlap: string[]): string {
  if (sharedIndustryTags.length) {
    return `Same ${sharedIndustryTags.slice(0, 2).map(prettyTag).join(' / ')} profile`;
  }
  if (competitorOverlap.length) {
    return `Same competitive motion — beat ${competitorOverlap.join(' & ')}, live in this deal`;
  }
  // Unreachable given the comparability gate above, but keep a safe fallback.
  return 'Closest closed-won comparable in your book';
}
