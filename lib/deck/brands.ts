/**
 * Deck branding — the dual-brand identity a customer-facing deck renders with.
 *
 *   seller = the rep's company (e.g. Northwind). Resolved from the opportunity's
 *            tenant brand columns (migration 016) so the PUBLIC token-gated
 *            export still gets the right brand with no session.
 *   buyer  = the prospect's company (e.g. Acme Corp). Logo resolved from the
 *            account domain; colors stay neutral (we don't presume a buyer's
 *            exact palette).
 *
 * Everything degrades gracefully: a missing logo falls back to a text wordmark,
 * missing colors fall back to a Mallin-neutral palette. The deck must never
 * fail to render because a brand asset is absent.
 */

import type { TenantBrand } from "@/lib/auth/tenant-context";
import { resolveCompanyDomain, fetchBrandFromDomain } from "./brand-resolver";
import { resolveBrandFromLiveSite } from "./brand-agent";

export interface DeckBrand {
  name: string;
  /** Public logo URL — fetched + embedded for .pptx, <img src> for the web view. */
  logoUrl?: string;
  /** Hex incl. # — backdrop / bars. */
  colorPrimary: string;
  /** Hex incl. # — rules / eyebrows / emphasis. */
  colorAccent: string;
}

export interface DeckBranding {
  seller: DeckBrand;
  buyer: DeckBrand;
}

// Mallin-neutral fallbacks (match the /share + deck dark palette).
const SELLER_FALLBACK_PRIMARY = "#11161F";
const SELLER_FALLBACK_ACCENT = "#7AA8D8";
const BUYER_FALLBACK_PRIMARY = "#1A212D";
const BUYER_FALLBACK_ACCENT = "#9898A3";

/** Brand mark by domain. Uses Google's public favicon service, which returns a
 *  real PNG for any resolvable domain with no auth or API key (Clearbit's
 *  logo.clearbit.com was deprecated). Returns undefined when no usable domain is
 *  available (renderer then uses a text wordmark). */
export function logoFromDomain(domain?: string | null): string | undefined {
  if (!domain) return undefined;
  const host = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .trim()
    .toLowerCase();
  if (!host || !host.includes(".")) return undefined;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=256`;
}

/**
 * Build the dual-brand identity for a deck.
 *
 * @param sellerBrand  tenant brand columns (any field may be null)
 * @param buyerName    the account / buyer company name
 * @param buyerDomain  the account domain (for the buyer logo)
 * @param sellerOrgName fallback seller name (e.g. Clerk org name) when the
 *                      tenant has no display_name set
 */
export function resolveBranding(
  sellerBrand: TenantBrand | null,
  buyerName: string,
  buyerDomain?: string | null,
  sellerOrgName?: string | null,
): DeckBranding {
  const seller: DeckBrand = {
    name: sellerBrand?.displayName ?? sellerOrgName ?? "Mallin",
    logoUrl: sellerBrand?.logoUrl ?? undefined,
    colorPrimary: sellerBrand?.colorPrimary ?? SELLER_FALLBACK_PRIMARY,
    colorAccent: sellerBrand?.colorAccent ?? SELLER_FALLBACK_ACCENT,
  };
  const buyer: DeckBrand = {
    name: buyerName,
    logoUrl: logoFromDomain(buyerDomain),
    colorPrimary: BUYER_FALLBACK_PRIMARY,
    colorAccent: BUYER_FALLBACK_ACCENT,
  };
  return { seller, buyer };
}

/**
 * Autonomous dual-brand resolution. Same shape as resolveBranding, but fills
 * any gap automatically from the company NAME / DOMAIN instead of requiring
 * manual config:
 *
 *   seller — manual tenant columns ALWAYS win (a deliberate brand override is
 *            authoritative). Any missing piece (logo / colors) is resolved from
 *            the stated company name → domain → brand.
 *   buyer  — logo upgraded from the account domain (apple-touch-icon / official
 *            logo, better than a favicon). Colors stay neutral: the deck chrome
 *            is the SELLER's brand; the buyer is represented by name + mark.
 *
 * Async (it may hit the network) and fully fail-safe — on any miss it returns
 * exactly what resolveBranding would have. `sellerCompany` is the rep's stated
 * company (tenant display_name or the org name) — the seed for autonomy.
 */
export async function resolveBrandingAuto(args: {
  sellerBrand: TenantBrand | null;
  sellerCompany?: string | null;
  buyerName: string;
  buyerDomain?: string | null;
}): Promise<DeckBranding> {
  const sb = args.sellerBrand;
  const sellerName = sb?.displayName ?? args.sellerCompany ?? "Mallin";
  let logo = sb?.logoUrl ?? undefined;
  let primary = sb?.colorPrimary ?? undefined;
  let accent = sb?.colorAccent ?? undefined;

  // Fill seller gaps agentically (manual columns above always win). The seller
  // is the AE's own company — resolved once per tenant, so accuracy is worth a
  // real read: the LIVE homepage wins (it's current), Brandfetch only fills
  // whatever the live read couldn't. This is what stops the deck rendering a
  // stale Brandfetch color (e.g. Northwind teal) over the real one (lime).
  if (!logo || !primary || !accent) {
    const domain = await resolveCompanyDomain(args.sellerCompany ?? sb?.displayName ?? null);
    if (domain) {
      const live = await resolveBrandFromLiveSite(domain);
      // Colors: the live homepage is authoritative — it's current (Northwind's real
      // lime over Brandfetch's stale teal).
      primary ||= live.colorPrimary;
      accent ||= live.colorAccent;
      // Logo: prefer Brandfetch's HOSTED image, which renders. The live-site
      // scrape often yields a proxied / SVG / hotlink-blocked URL that won't load
      // in the deck — letting it win short-circuited the reliable logo and left
      // the seller mark blank (the "Northwind icon missing" regression). Fall back
      // to the live logo only if Brandfetch has none.
      if (!logo || !primary || !accent) {
        const r = await fetchBrandFromDomain(domain);
        logo ||= r.logoUrl;
        primary ||= r.colorPrimary;
        accent ||= r.colorAccent;
      }
      logo ||= live.logoUrl;
    }
  }

  const seller: DeckBrand = {
    name: sellerName,
    logoUrl: logo,
    colorPrimary: primary ?? SELLER_FALLBACK_PRIMARY,
    colorAccent: accent ?? SELLER_FALLBACK_ACCENT,
  };

  // Buyer — upgrade the mark from the domain; keep colors neutral.
  const br = await fetchBrandFromDomain(args.buyerDomain);
  const buyer: DeckBrand = {
    name: args.buyerName,
    logoUrl: br.logoUrl ?? logoFromDomain(args.buyerDomain),
    colorPrimary: BUYER_FALLBACK_PRIMARY,
    colorAccent: BUYER_FALLBACK_ACCENT,
  };

  return { seller, buyer };
}
