/**
 * Apollo.io as an acquisition source for Account Intelligence.
 *
 * ⚠ NOT THE RECOMMENDED PRIMARY SOURCE — see lib/intelligence/sources/proxycurl.ts.
 *
 * Apollo has moved into AI sales coaching (Apollo Intelligence, Apollo AI,
 * real-time deal coaching) over the past 12 months. They've shifted from
 * "data infrastructure provider" toward "AI sales platform" — i.e. a
 * direct competitor with Mallin's operating-layer positioning.
 *
 * Risks of using Apollo as our enrichment layer:
 *   - Data dependency on a growing competitor (they can throttle / cut
 *     us off when they identify Mallin as competitive)
 *   - Usage-pattern disclosure (they see which prospects we look up,
 *     at what frequency, can infer Mallin's behavior + customer base)
 *   - Brand positioning weakened ("Mallin uses Apollo under the hood"
 *     undermines the operating-layer story)
 *
 * Proxycurl (pure LinkedIn data infrastructure, no competing product)
 * is the recommended primary source. This module is kept as a fallback
 * + reference but not the default. Same StakeholderIntel output shape
 * — they're swap-equivalents at the cognition layer per the stable-
 * cognition / unstable-acquisition principle.
 *
 * API: https://docs.apollo.io/reference/people-match
 * Free tier: 50 credits/month, sign up at apollo.io
 *
 * Setup (only if Proxycurl is unavailable):
 *   1. Sign up at apollo.io (free tier)
 *   2. Settings → API → Create API key
 *   3. Add to .env.local: APOLLO_API_KEY=<key>
 *   4. Add to Vercel production env (same name)
 */

import type {
  StakeholderIntel,
  Confidence,
} from "../types";

interface ApolloPersonMatchRequest {
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  domain?: string;
  organization_name?: string;
  linkedin_url?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
}

interface ApolloEmploymentEntry {
  organization_name?: string;
  title?: string;
  start_date?: string;
  end_date?: string;
  current?: boolean;
}

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  headline?: string;
  linkedin_url?: string;
  twitter_url?: string;
  github_url?: string;
  facebook_url?: string;
  photo_url?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: {
    name?: string;
    website_url?: string;
    primary_domain?: string;
    industry?: string;
    founded_year?: number;
    estimated_num_employees?: number;
  };
  employment_history?: ApolloEmploymentEntry[];
  seniority?: string;
  departments?: string[];
  functions?: string[];
}

interface ApolloMatchResponse {
  person?: ApolloPerson;
}

/**
 * Fetches a person from Apollo by name + organization. Returns null
 * if no match or API error. Never throws (instrumentation-grade
 * resilience — Apollo data is enrichment, not gate).
 */
export async function fetchApolloPerson(opts: {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  organizationName?: string;
  domain?: string;
  linkedinUrl?: string;
}): Promise<ApolloPerson | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn(
      "[apollo] APOLLO_API_KEY missing; skipping enrichment. Sign up at apollo.io for a free-tier key (50 credits/mo) and add to .env.local.",
    );
    return null;
  }

  const body: ApolloPersonMatchRequest = {
    first_name: opts.firstName,
    last_name: opts.lastName,
    name: opts.fullName,
    organization_name: opts.organizationName,
    domain: opts.domain,
    linkedin_url: opts.linkedinUrl,
    reveal_personal_emails: false, // costs more credits, not needed for intel
    reveal_phone_number: false,
  };

  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(
        `[apollo] people/match ${res.status}: ${text.slice(0, 200)}`,
      );
      return null;
    }

    const data = (await res.json()) as ApolloMatchResponse;
    return data.person ?? null;
  } catch (err) {
    console.warn(
      `[apollo] fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Maps an Apollo Person response into the stable StakeholderIntel
 * contract. Confidence is set conservatively (medium-high) since
 * Apollo data is real but can be stale.
 */
export function apolloPersonToStakeholderIntel(
  person: ApolloPerson,
  /** Best read on their role in the deal — Apollo doesn't know this,
   *  caller supplies it (or "unknown" until confirmed). */
  roleInDeal: StakeholderIntel["role_in_deal"]["value"] = "unknown",
  capturedAt: string = new Date().toISOString(),
): StakeholderIntel {
  const fullName =
    person.name ?? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim();
  const titleText = person.title ?? person.headline ?? null;
  const currentOrg = person.organization?.name ?? null;
  const location = [person.city, person.state, person.country]
    .filter(Boolean)
    .join(", ");

  // Construct an operator-grade background from Apollo's structured fields
  const bgParts: string[] = [];
  if (titleText && currentOrg) {
    bgParts.push(`${titleText} at ${currentOrg}.`);
  } else if (titleText) {
    bgParts.push(`${titleText}.`);
  }
  if (person.seniority) {
    bgParts.push(`Seniority: ${person.seniority}.`);
  }
  if (location) {
    bgParts.push(`Based in ${location}.`);
  }
  const recentEmp = (person.employment_history ?? []).slice(0, 3);
  if (recentEmp.length > 1) {
    const prior = recentEmp
      .filter((e) => !e.current)
      .slice(0, 2)
      .map((e) => `${e.title ?? "?"} at ${e.organization_name ?? "?"}`)
      .filter((s) => !s.includes("?"));
    if (prior.length > 0) {
      bgParts.push(`Prior: ${prior.join("; ")}.`);
    }
  }
  const background = bgParts.join(" ");

  // Confidence — Apollo data is medium-confidence by default. Title +
  // org match raises it; missing fields lower it.
  let confidence: Confidence = "medium";
  if (titleText && currentOrg && person.linkedin_url) {
    confidence = "high";
  } else if (!titleText || !currentOrg) {
    confidence = "low";
  }

  return {
    name: fullName,
    title: titleText
      ? {
          value: titleText,
          source: "apollo",
          source_url: person.linkedin_url ?? undefined,
          captured_at: capturedAt,
          confidence,
        }
      : undefined,
    role_in_deal: {
      value: roleInDeal,
      confidence: "low", // Apollo doesn't know deal context
      rationale:
        "Apollo provides title + employment data but not role-in-this-deal. Mark as 'unknown' until confirmed in transcripts or by the rep.",
    },
    background: {
      value: background || "Apollo returned a match but no usable background fields.",
      source: "apollo",
      source_url: person.linkedin_url ?? undefined,
      captured_at: capturedAt,
      confidence,
    },
    visible_priorities: [],
    rapport_hooks: [],
    watch_for: [
      "Apollo data is automated and may be stale — verify title + employer in the first call.",
    ],
    linkedin_url: person.linkedin_url ?? undefined,
  };
}
