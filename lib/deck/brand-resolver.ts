/**
 * Autonomous brand resolution — turn a company NAME or DOMAIN into a usable
 * brand identity (logo + colors), with no manual configuration.
 *
 * Two layers, best-first with graceful fallback:
 *   1. Brandfetch (if BRANDFETCH_API_KEY is set): name → domain → official logo
 *      + official palette, as structured data. The accurate path.
 *   2. Keyless: slug-guess + verify the domain, then scrape the homepage for an
 *      apple-touch-icon / og:image (logo) and <meta name="theme-color"> (color).
 *      Always finishes with the Google favicon so there is always a mark.
 *
 * Everything degrades to `undefined` rather than throwing — a deck must never
 * fail to render because a brand couldn't be resolved. Results are cached per
 * process so a deck (or a batch) resolves each domain at most once.
 *
 * This is the "acquisition layer" for branding (see memory: stable_cognition_
 * layer). The deck contract is fixed; only the SOURCE of the brand evolves —
 * manual tenant columns → keyless scrape → Brandfetch — behind this seam.
 */

// Brandfetch uses two distinct credentials:
//   BRANDFETCH_API_KEY   — server-side Bearer token for the Brand API
//                          (/v2/brands/{domain}) → logo + official colors.
//   BRANDFETCH_CLIENT_ID — client credential for the Brand Search API
//                          (/v2/search/{query}?c=…) → name → domain.
// Either can be absent; the resolver degrades to the keyless path.
const BF_KEY = process.env.BRANDFETCH_API_KEY;
const BF_CLIENT_ID = process.env.BRANDFETCH_CLIENT_ID;

export interface ResolvedBrand {
  domain?: string;
  logoUrl?: string;
  colorPrimary?: string;
  colorAccent?: string;
}

const domainCache = new Map<string, ResolvedBrand>();
const nameToDomain = new Map<string, string | undefined>();

/** Normalize a raw domain/URL to a bare host, or undefined if unusable. */
export function normDomain(d?: string | null): string | undefined {
  if (!d) return undefined;
  const host = d
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .trim()
    .toLowerCase();
  return host.includes(".") ? host : undefined;
}

/** Slug a company name into a best-guess .com domain ("Macerich" → macerich.com). */
function slugDomainGuess(name: string): string | undefined {
  const slug = name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|group|company|holdings|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  return slug ? `${slug}.com` : undefined;
}

/** Cheap reachability check via the favicon service (no API key, fast). */
async function domainResolves(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${host}&sz=64`, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    // The service 200s with a generic globe for unknown domains, so also require
    // a non-trivial body. Good enough as a keyless heuristic.
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 120;
  } catch {
    return false;
  }
}

/** Company name → domain. Brandfetch search if keyed; else slug-guess + verify. */
export async function resolveCompanyDomain(
  name?: string | null,
  knownDomain?: string | null,
): Promise<string | undefined> {
  const known = normDomain(knownDomain);
  if (known) return known;
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  if (nameToDomain.has(key)) return nameToDomain.get(key);

  let domain: string | undefined;
  // Brand Search API is authed with the Client ID as a query param (?c=…),
  // NOT the Bearer API key.
  if (BF_CLIENT_ID) {
    try {
      const res = await fetch(
        `https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}?c=${BF_CLIENT_ID}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (res.ok) {
        const arr = (await res.json()) as Array<{ domain?: string }>;
        domain = normDomain(arr?.[0]?.domain);
      }
    } catch {
      /* fall through to keyless */
    }
  }
  if (!domain) {
    const guess = slugDomainGuess(name);
    if (guess && (await domainResolves(guess))) domain = guess;
  }
  nameToDomain.set(key, domain);
  return domain;
}

/** Lighten a hex color toward white by `amt` (0–1) — to derive an accent from a
 *  single brand color when only one is available. */
function lighten(hex: string, amt: number): string | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function absUrl(href: string, host: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `https://${host}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** Pull a logo URL from homepage HTML — apple-touch-icon (clean square PNG) is
 *  the best keyless source; fall back to og:image. */
function logoFromHtml(html: string, host: string): string | undefined {
  const apple =
    /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(html) ||
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*apple-touch-icon[^"']*["']/i.exec(html);
  if (apple?.[1]) return absUrl(apple[1], host);
  const og = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return absUrl(og[1], host);
  return undefined;
}

function themeColorFromHtml(html: string): string | undefined {
  const m = /<meta[^>]+name=["']theme-color["'][^>]*content=["'](#[0-9a-fA-F]{6})["']/i.exec(html);
  return m?.[1];
}

interface BrandfetchColor { hex?: string; type?: string }
interface BrandfetchLogo { type?: string; theme?: string; formats?: Array<{ src?: string; format?: string }> }

/** Domain → { logo, colorPrimary, colorAccent }. Brandfetch if keyed, else keyless. */
export async function fetchBrandFromDomain(domain?: string | null): Promise<ResolvedBrand> {
  const host = normDomain(domain);
  if (!host) return {};
  const cached = domainCache.get(host);
  if (cached) return cached;

  const out: ResolvedBrand = { domain: host };

  if (BF_KEY) {
    try {
      const res = await fetch(`https://api.brandfetch.io/v2/brands/${host}`, {
        headers: { Authorization: `Bearer ${BF_KEY}` },
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const data = (await res.json()) as { logos?: BrandfetchLogo[]; colors?: BrandfetchColor[] };
        // The deck renders on a DARK background, so prefer the logo variant
        // built FOR dark (Brandfetch theme:"dark" = the light/white version).
        // Otherwise we sometimes grab the light-theme (dark-ink) logo, which
        // reads as invisible / "not illuminated" on the dark deck.
        const logos = data.logos ?? [];
        const logo =
          logos.find((l) => l.type === "logo" && l.theme === "dark") ??
          logos.find((l) => l.type === "logo") ??
          logos.find((l) => l.type === "icon" && l.theme === "dark") ??
          logos.find((l) => l.type === "icon");
        const fmt =
          logo?.formats?.find((f) => f.format === "png") ?? logo?.formats?.[0];
        out.logoUrl = fmt?.src ?? out.logoUrl;
        const colors = data.colors ?? [];
        out.colorPrimary =
          colors.find((c) => c.type === "dark")?.hex ??
          colors.find((c) => c.type === "brand")?.hex ??
          colors[0]?.hex;
        out.colorAccent =
          colors.find((c) => c.type === "accent")?.hex ??
          colors.find((c) => c.hex && c.hex !== out.colorPrimary)?.hex;
      }
    } catch {
      /* fall through to keyless */
    }
  }

  if (!out.logoUrl || !out.colorPrimary) {
    try {
      const res = await fetch(`https://${host}`, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MallinBrandBot/1.0)" },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 200_000);
        out.logoUrl ||= logoFromHtml(html, host);
        const tc = themeColorFromHtml(html);
        if (tc) {
          out.colorPrimary ||= tc;
          out.colorAccent ||= lighten(tc, 0.45);
        }
      }
    } catch {
      /* keep whatever we have */
    }
  }

  // Always leave a usable mark.
  out.logoUrl ||= `https://www.google.com/s2/favicons?domain=${host}&sz=256`;
  domainCache.set(host, out);
  return out;
}
