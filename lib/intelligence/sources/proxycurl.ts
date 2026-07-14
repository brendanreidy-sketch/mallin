/**
 * ⛔ DEFUNCT — DO NOT USE.
 *
 * Proxycurl shut down on 2025-07-04 after losing a LinkedIn lawsuit
 * filed in January 2025. The endpoint below (`/proxycurl/api/v2/linkedin`)
 * is dead. API keys no longer work. LinkedIn-URL lookup is gone
 * industry-wide — the legal precedent (HiQ Labs v. LinkedIn, 2022 9th
 * Circuit) was not enough to survive the merits ruling.
 *
 * REPLACEMENT: lib/intelligence/sources/ninjapear.ts
 *
 * NinjaPear is the successor product from the same team (Nubela /
 * Steven Goh). It does NOT scrape LinkedIn and does NOT accept
 * LinkedIn URLs as input — public-web sourcing only, lookup by
 * work_email or name+employer-domain.
 *
 * This module is kept ONLY as historical reference for the cognition
 * contract pattern (`*ProfileToStakeholderIntel` mapping). Imports
 * from this file will fail at runtime (PROXYCURL_API_KEY won't exist
 * in any env; even if it did, the upstream endpoint is gone).
 *
 * See memory: stable_cognition_layer.md — same StakeholderIntel
 * output shape regardless of source. Swap-equivalent at the cognition
 * layer is exactly the property that made this transition safe.
 */

import type {
  StakeholderIntel,
  Confidence,
} from "../types";

interface ProxycurlExperience {
  starts_at?: { day?: number; month?: number; year?: number };
  ends_at?: { day?: number; month?: number; year?: number } | null;
  company?: string;
  company_linkedin_profile_url?: string;
  title?: string;
  description?: string;
  location?: string;
}

interface ProxycurlEducation {
  starts_at?: { day?: number; month?: number; year?: number };
  ends_at?: { day?: number; month?: number; year?: number } | null;
  field_of_study?: string;
  degree_name?: string;
  school?: string;
}

interface ProxycurlProfile {
  public_identifier?: string;
  profile_pic_url?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  summary?: string;
  occupation?: string;
  country_full_name?: string;
  city?: string;
  state?: string;
  experiences?: ProxycurlExperience[];
  education?: ProxycurlEducation[];
  languages?: string[];
  /** Returned at endpoint */
  linkedin_profile_url?: string;
}

/**
 * Fetches a LinkedIn profile via Proxycurl. Takes a LinkedIn URL
 * directly (the cheapest + most reliable endpoint). Returns null on
 * any failure (instrumentation-grade resilience — Proxycurl data is
 * enrichment, never gate).
 */
export async function fetchProxycurlProfile(
  linkedinUrl: string,
  opts: { useCache?: "if-present" | "never" } = {},
): Promise<ProxycurlProfile | null> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    console.warn(
      "[proxycurl] PROXYCURL_API_KEY missing; skipping enrichment. Sign up at https://nubela.co/proxycurl and add to .env.local + Vercel env.",
    );
    return null;
  }
  if (!linkedinUrl) {
    console.warn("[proxycurl] no LinkedIn URL provided");
    return null;
  }

  const useCache = opts.useCache ?? "if-present";
  const params = new URLSearchParams({
    url: linkedinUrl,
    use_cache: useCache,
    skills: "include",
    inferred_salary: "exclude",
    personal_email: "exclude",
    personal_contact_number: "exclude",
    twitter_profile_id: "exclude",
    facebook_profile_id: "exclude",
    github_profile_id: "exclude",
    extra: "exclude",
  });

  try {
    const res = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[proxycurl] ${res.status}: ${text.slice(0, 200)}`,
      );
      return null;
    }

    const data = (await res.json()) as ProxycurlProfile;
    return data;
  } catch (err) {
    console.warn(
      `[proxycurl] fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Format a Proxycurl date object as "YYYY" or "YYYY-MM" for display. */
function formatProxycurlDate(d?: {
  day?: number;
  month?: number;
  year?: number;
} | null): string {
  if (!d || !d.year) return "";
  if (d.month) {
    const mm = String(d.month).padStart(2, "0");
    return `${d.year}-${mm}`;
  }
  return String(d.year);
}

/**
 * Maps a Proxycurl LinkedIn profile into the stable StakeholderIntel
 * contract. Confidence is set based on data quality (presence of
 * current role + recent experiences raises it).
 */
export function proxycurlProfileToStakeholderIntel(
  profile: ProxycurlProfile,
  linkedinUrl: string,
  roleInDeal: StakeholderIntel["role_in_deal"]["value"] = "unknown",
  capturedAt: string = new Date().toISOString(),
): StakeholderIntel {
  const fullName =
    profile.full_name ??
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  const currentRole =
    profile.experiences?.find((e) => !e.ends_at) ?? profile.experiences?.[0];
  const titleText =
    profile.headline ??
    currentRole?.title ??
    profile.occupation ??
    null;
  const currentCompany = currentRole?.company ?? null;
  const location = [profile.city, profile.state, profile.country_full_name]
    .filter(Boolean)
    .join(", ");

  // Construct an operator-grade background from Proxycurl's structured
  // fields. Operator voice — concrete, terse, no marketing fluff.
  const bgParts: string[] = [];
  if (titleText && currentCompany) {
    const startedAt = currentRole?.starts_at?.year;
    const tenureNote = startedAt ? ` (since ${startedAt})` : "";
    bgParts.push(`${titleText} at ${currentCompany}${tenureNote}.`);
  } else if (titleText) {
    bgParts.push(`${titleText}.`);
  }

  // Prior experiences — most recent 2 (excluding current role)
  const priorRoles = (profile.experiences ?? [])
    .filter((e) => e.ends_at)
    .slice(0, 2);
  if (priorRoles.length > 0) {
    const priorParts = priorRoles
      .map((e) => {
        const start = e.starts_at?.year;
        const end = e.ends_at?.year;
        const range = start && end ? ` (${start}–${end})` : "";
        return `${e.title ?? "?"} at ${e.company ?? "?"}${range}`;
      })
      .filter((s) => !s.startsWith("? at"));
    if (priorParts.length > 0) {
      bgParts.push(`Prior: ${priorParts.join("; ")}.`);
    }
  }

  if (location) {
    bgParts.push(`Based in ${location}.`);
  }

  // Education — top entry only, for rapport context
  const topEdu = profile.education?.[0];
  let educationFact: string | null = null;
  if (topEdu?.school) {
    const degree = topEdu.degree_name ? `${topEdu.degree_name}, ` : "";
    educationFact = `${degree}${topEdu.school}`;
  }

  const background = bgParts.join(" ");

  // Confidence — Proxycurl data is medium-high by default.
  // Current role + experiences[] populated raises it.
  let confidence: Confidence = "medium";
  if (titleText && currentCompany && (profile.experiences?.length ?? 0) > 1) {
    confidence = "high";
  } else if (!titleText || !currentCompany) {
    confidence = "low";
  }

  // Rapport hooks — surface education + location-based hooks as
  // sourced facts (rep can use these to open the conversation).
  const rapportHooks: StakeholderIntel["rapport_hooks"] = [];
  if (educationFact) {
    rapportHooks.push({
      value: educationFact,
      source: "web_search",
      source_url: linkedinUrl,
      captured_at: capturedAt,
      confidence: "medium",
    });
  }
  if (location) {
    rapportHooks.push({
      value: `Located: ${location}`,
      source: "web_search",
      source_url: linkedinUrl,
      captured_at: capturedAt,
      confidence: "medium",
    });
  }

  // Visible priorities — if Proxycurl returned a summary, surface a
  // truncated version as a stated priority. Otherwise empty.
  const visiblePriorities: StakeholderIntel["visible_priorities"] = [];
  if (profile.summary && profile.summary.length > 20) {
    const compact = profile.summary
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    visiblePriorities.push({
      value: `Self-described focus: ${compact}${profile.summary.length > 280 ? "…" : ""}`,
      source: "web_search",
      source_url: linkedinUrl,
      captured_at: capturedAt,
      confidence: "medium",
      confidence_note:
        "Summary is what THEY say about themselves — useful for tone-matching but not for inferring buying authority",
    });
  }

  return {
    name: fullName,
    title: titleText
      ? {
          value: currentCompany ? `${titleText} at ${currentCompany}` : titleText,
          source: "web_search",
          source_url: linkedinUrl,
          captured_at: capturedAt,
          confidence,
        }
      : undefined,
    role_in_deal: {
      value: roleInDeal,
      confidence: "low",
      rationale:
        "Proxycurl provides LinkedIn-derived title + employment data but not role-in-this-deal. Mark as 'unknown' until confirmed in transcripts or by the rep.",
    },
    background: {
      value:
        background ||
        "Proxycurl returned a match but no usable background fields.",
      source: "web_search",
      source_url: linkedinUrl,
      captured_at: capturedAt,
      confidence,
    },
    visible_priorities: visiblePriorities,
    rapport_hooks: rapportHooks,
    watch_for: [
      "Proxycurl data is scraped from LinkedIn — verify current title + employer in the first call (people change jobs faster than LinkedIn updates).",
    ],
    linkedin_url: linkedinUrl,
  };
}
