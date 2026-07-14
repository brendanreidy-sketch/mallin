/**
 * brand-agent — resolve a company's REAL, CURRENT brand (accent color + logo)
 * from its LIVE homepage, using a model to pick the right values from candidate
 * signals scraped off the page.
 *
 * This is the accurate path. Brand APIs (Brandfetch) go stale — they returned
 * Northwind's old teal (#00C37F) when the live site's real accent is lime
 * (#E6FF00, the "Get a demo" button). The company's own homepage is always
 * current, so we read the brand straight off it and let the model choose the
 * accent/primary/logo from candidates ACTUALLY present on the page (it can't
 * invent a hex — it only picks from what we scraped).
 *
 * Used for the SELLER brand only (resolved once per tenant, cached), so the
 * extra fetch + model call is cheap amortized and worth it for customer-facing
 * chrome. Fully fail-safe: any error returns {} and the caller falls back to
 * Brandfetch / the keyless path — never a regression, never a throw.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedBrand } from "./brand-resolver";
import { normDomain } from "./brand-resolver";

const MODEL = "claude-haiku-4-5-20251001";
const liveCache = new Map<string, ResolvedBrand>();

// ── deterministic candidate extraction (pure — unit-tested) ─────────────────

export interface BrandCandidates {
  title?: string;
  themeColors: string[]; // from <meta theme-color> / manifest theme_color
  /** Distinct colors seen on the page, ranked vivid-first then by frequency. */
  colors: { hex: string; count: number; vivid: boolean }[];
  /** Logo URL candidates (absolute), best-guess first. */
  logos: string[];
}

/** Normalize #rgb / #rrggbb / rgb() / rgba() → #rrggbb (lowercase), or null. */
export function normalizeToHex(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return `#${full}`;
  }
  const rgb = /^rgba?\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})/.exec(s);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, parseInt(n, 10)));
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

/** A "vivid" color: saturated and mid-bright — i.e. a plausible brand accent,
 *  not chrome (white / black / near-gray). */
function isVivid(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const chroma = max - min;
  return chroma > 60 && max > 110; // colorful + not too dark
}

function absUrl(href: string, host: string): string | null {
  const h = href.trim();
  if (!h || h.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (h.startsWith("//")) return `https:${h}`;
  return `https://${host}${h.startsWith("/") ? "" : "/"}${h}`;
}

/** Pull ranked color + logo candidates from homepage HTML (+ any fetched CSS). */
export function extractBrandCandidates(html: string, css = "", host = ""): BrandCandidates {
  const blob = `${html}\n${css}`;

  // Colors — every hex + rgb() occurrence, normalized + counted.
  const counts = new Map<string, number>();
  const add = (raw: string) => {
    const hex = normalizeToHex(raw);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  (blob.match(/#[0-9a-fA-F]{6}\b/g) ?? []).forEach(add);
  (blob.match(/#[0-9a-fA-F]{3}\b/g) ?? []).forEach(add);
  (blob.match(/rgba?\([^)]*\)/g) ?? []).forEach(add);

  const colors = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count, vivid: isVivid(hex) }))
    // vivid brand candidates first, then by how often the color appears
    .sort((a, b) => Number(b.vivid) - Number(a.vivid) || b.count - a.count)
    .slice(0, 30);

  // Theme colors — the most intentional brand signal when present.
  const themeColors: string[] = [];
  const meta = /<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i.exec(html);
  if (meta?.[1]) { const h = normalizeToHex(meta[1]); if (h) themeColors.push(h); }

  // Logo candidates — apple-touch-icon, og:image, then header/nav <img>.
  const logos: string[] = [];
  const push = (u: string | null) => { if (u && !logos.includes(u)) logos.push(u); };
  const apple = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i.exec(html);
  push(absUrl(apple?.[1] ?? "", host));
  const og = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html);
  push(absUrl(og?.[1] ?? "", host));
  const header = /<(?:header|nav)[^>]*>([\s\S]{0,4000}?)<\/(?:header|nav)>/i.exec(html)?.[1] ?? "";
  for (const m of header.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) push(absUrl(m[1], host));

  const title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim();

  return { title, themeColors, colors, logos: logos.slice(0, 6) };
}

// ── live fetch + model pick ─────────────────────────────────────────────────

async function fetchText(url: string, ms = 6000): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MallinBrandBot/1.0)" },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) return "";
  return (await res.text()).slice(0, 250_000);
}

const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
const isUrl = (s: unknown): s is string => typeof s === "string" && /^https?:\/\//i.test(s);

/**
 * Resolve {logo, colorPrimary, colorAccent} from a domain's LIVE homepage.
 * Returns {} on any failure (no key, fetch/timeout/parse error, model miss).
 */
export async function resolveBrandFromLiveSite(domain?: string | null): Promise<ResolvedBrand> {
  const host = normDomain(domain);
  if (!host) return {};
  const cached = liveCache.get(host);
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {};

  const result: ResolvedBrand = { domain: host };
  try {
    const html = await fetchText(`https://${host}`);
    if (!html) { liveCache.set(host, {}); return {}; }

    // Grab the first stylesheet too — brand colors usually live there.
    let css = "";
    const sheet = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
    const sheetUrl = absUrl(sheet ?? "", host);
    if (sheetUrl) css = await fetchText(sheetUrl, 5000).catch(() => "");

    // Manifest theme_color — an intentional brand signal when present.
    const manifestHref = /<link[^>]+rel=["']manifest["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
    const manifestUrl = absUrl(manifestHref ?? "", host);
    const candidates = extractBrandCandidates(html, css, host);
    if (manifestUrl) {
      try {
        const mf = JSON.parse(await fetchText(manifestUrl, 4000)) as { theme_color?: string };
        const h = mf.theme_color ? normalizeToHex(mf.theme_color) : null;
        if (h) candidates.themeColors.unshift(h);
      } catch { /* manifest optional */ }
    }

    if (candidates.colors.length === 0 && candidates.logos.length === 0) {
      liveCache.set(host, {}); return {};
    }

    const client = new Anthropic({ apiKey });
    const tool: Anthropic.Tool = {
      name: "emit_brand",
      description: "Emit the company's brand identity chosen from the on-page candidates.",
      input_schema: {
        type: "object",
        properties: {
          colorAccent: { type: "string", description: "The vivid primary brand color as #rrggbb — what appears on primary CTAs/buttons/accents. MUST be one of the provided candidate colors." },
          colorPrimary: { type: "string", description: "A dark backdrop color as #rrggbb (near-black / very dark brand color) for a dark deck background. MUST be a provided candidate color; omit if none is dark enough." },
          logoUrl: { type: "string", description: "Best logo for a DARK background — prefer a full wordmark/logo over a favicon. MUST be one of the provided candidate logo URLs. Omit if none is a real logo." },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["confidence"],
      },
    };

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        "You identify a company's brand identity from signals scraped off its LIVE homepage, for use as chrome on a DARK slide deck. " +
        "Choose the ACCENT (the vivid brand color, typically the primary CTA/button color), a dark PRIMARY backdrop, and the best LOGO for a dark background. " +
        "Choose ONLY from the provided candidate values — never invent a hex or URL. Omit any field you can't fill confidently.",
      tools: [tool],
      tool_choice: { type: "tool", name: "emit_brand" },
      messages: [{ role: "user", content: `Brand candidates scraped from ${host}:\n\n${JSON.stringify(candidates)}` }],
    });

    const block = res.content.find((b) => b.type === "tool_use" && b.name === "emit_brand");
    if (block && block.type === "tool_use") {
      const out = block.input as { colorAccent?: string; colorPrimary?: string; logoUrl?: string };
      if (isHex(out.colorAccent)) result.colorAccent = out.colorAccent.toLowerCase();
      if (isHex(out.colorPrimary)) result.colorPrimary = out.colorPrimary.toLowerCase();
      if (isUrl(out.logoUrl)) result.logoUrl = out.logoUrl;
    }
  } catch {
    // Any failure → empty; caller falls back to Brandfetch. Never throw.
    liveCache.set(host, {});
    return {};
  }

  liveCache.set(host, result);
  return result;
}
