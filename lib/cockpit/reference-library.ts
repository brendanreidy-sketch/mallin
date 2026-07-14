/**
 * Reference library — closed-won proof points the rep can cite while working a
 * live opp. NOT a fabricated logo wall: in production every entry is one of the
 * rep's own closed-won deals already in the book, with its real industry and
 * outcome. The matcher (match-reference.ts) ranks this pool against the open opp
 * by industry proximity + module overlap and surfaces ONE best fit in the
 * cockpit.
 *
 * The entries below are SYNTHETIC demo data (fictional accounts) used to
 * exercise the surface.
 *
 * Honesty contract:
 *   - `referenceable` is a REP-MAINTAINED flag (has this customer agreed to take
 *     reference calls / be cited?). It is NOT auto-derived from "closed-won".
 *     We seed it true only for deals the rep has confirmed; the cockpit frames
 *     the surface as "closest closed-won comparable", not an asserted public
 *     reference, so we never claim a willingness we can't verify.
 *   - `modules` footprints are AUTHOR-INFERRED from the deal substrate and
 *     marked for rep correction. Industry + outcome are ground truth.
 *
 * Drift signal (intake_primitive_doctrine): if this file starts accumulating
 * customers that are NOT real closed-won deals in the book, stop — that is the
 * invented-logo failure mode this design exists to prevent.
 */

/** Generic, vendor-neutral product-module taxonomy. Keep small. */
export type ModuleKey =
  | 'core_platform'
  | 'analytics'
  | 'integrations'
  | 'automation'
  | 'data_sync'
  | 'reporting'
  | 'security_compliance'
  | 'api_platform'
  | 'onboarding';

export const MODULE_LABELS: Record<ModuleKey, string> = {
  core_platform: 'Core Platform',
  analytics: 'Analytics',
  integrations: 'Integrations',
  automation: 'Workflow Automation',
  data_sync: 'Data Sync',
  reporting: 'Reporting',
  security_compliance: 'Security & Compliance',
  api_platform: 'API Platform',
  onboarding: 'Onboarding & Enablement',
};

/**
 * Per-deal profile used for matching. Keyed by the registry dealId so the
 * matcher can read the open deal's own profile AND score the reference pool.
 * industryTags + competitors are ground truth from substrate; `modules` are the
 * author-inferred footprint (conservative — core scope + what each deal
 * explicitly discussed).
 */
export interface DealProfile {
  industryLabel: string;
  industryTags: string[];
  modules: ModuleKey[];
  /** Competitors LIVE in this deal (the prospect is evaluating them). */
  competitors: string[];
}

export const DEAL_PROFILES: Record<string, DealProfile> = {
  'hooli-holdings': {
    industryLabel: 'Technology / Diversified Holdings',
    industryTags: ['technology', 'holdings', 'multi_entity'],
    modules: ['core_platform', 'analytics', 'integrations', 'reporting'],
    competitors: ['Vantage'],
  },
  'acme-beneba': {
    industryLabel: 'Industrial Manufacturing',
    industryTags: ['manufacturing', 'industrial'],
    modules: ['core_platform', 'automation', 'reporting'],
    competitors: [],
  },
};

/**
 * A closed-won customer the rep can cite. `dealId` links back to that deal's
 * cockpit (real evidence trail). `proofPoint` is grounded in the call
 * substrate; `competitorsBeaten` is deal-outcome history.
 */
export interface ReferenceCustomer {
  id: string;
  /** Registry dealId for the cockpit link + profile lookup. */
  dealId: string;
  name: string;
  /** Rep-confirmed willingness to be cited. */
  referenceable: boolean;
  /** Closed-won headline fact (date / size). */
  outcome: string;
  /** What this customer proves for a comparable prospect — operator voice. */
  proofPoint: string;
  /** Competitors beaten to win this account (deal-outcome history). */
  competitorsBeaten: string[];
}

/**
 * Seeded from closed-won demo deals in the book. (Synthetic accounts.)
 */
export const REFERENCES: ReferenceCustomer[] = [
  {
    id: 'ref_hooli',
    dealId: 'hooli-holdings',
    name: 'Hooli Holdings',
    referenceable: true,
    outcome: 'Closed-won · Dec 2025',
    proofPoint:
      'Diversified multi-entity holding company that consolidated reporting and analytics across operating companies onto a single governed platform.',
    competitorsBeaten: ['Vantage'],
  },
  {
    id: 'ref_beneba',
    dealId: 'acme-beneba',
    name: 'Beneba Industries',
    referenceable: true,
    outcome: 'Closed-won · $107K',
    proofPoint:
      'Industrial manufacturer that automated core workflows and stood up consolidated reporting for senior management after outgrowing spreadsheets.',
    competitorsBeaten: [],
  },
];

export function getDealProfile(dealId: string): DealProfile | undefined {
  return DEAL_PROFILES[dealId];
}
