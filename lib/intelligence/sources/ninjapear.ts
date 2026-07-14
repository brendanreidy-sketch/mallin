/**
 * NinjaPear as an acquisition source for Account Intelligence.
 *
 * NinjaPear (https://nubela.co) is the successor to Proxycurl, run by
 * the same team (Steven Goh / Nubela). Proxycurl was shut down on
 * 2025-07-04 after losing a LinkedIn lawsuit filed in January 2025.
 * LinkedIn-URL lookup is now legally radioactive industry-wide —
 * NinjaPear explicitly does NOT scrape LinkedIn and does NOT accept
 * LinkedIn URLs as input. Public-web sourcing only.
 *
 * Why NinjaPear over the alternatives:
 *   - Pure data infrastructure (no competing AI sales product)
 *   - Same team / lineage as Proxycurl (continuity of approach)
 *   - Post-litigation legal posture (verified compliant sourcing)
 *   - Pay-as-you-go, ~3 credits per profile, 10 free credits to start
 *
 * Trade-off vs. the dead Proxycurl era:
 *   - No LinkedIn-URL input — you provide work_email OR name+domain
 *     OR role+domain. We still display LinkedIn URLs in the artifact
 *     for human reference (rep clicks through), but they are not part
 *     of the lookup contract.
 *   - Slightly less LinkedIn-mirror density; broader public sources
 *     (company sites, talks, press, public profiles).
 *
 * API: https://nubela.co/docs
 * Endpoint (profile): GET https://nubela.co/api/v1/employee/profile
 *   - work_email=...                                 OR
 *   - first_name=...&employer_website=...            OR
 *   - employer_website=...&role=...
 * Auth: Authorization: Bearer <NINJAPEAR_API_KEY>
 * Cost: 3 credits per successful profile lookup
 *
 * Setup:
 *   1. Sign up at https://nubela.co (3-day trial, 10 free credits)
 *   2. Dashboard → API → Create API key
 *   3. Add to .env.local: NINJAPEAR_API_KEY=<key>
 *   4. Add to Vercel production env (same name)
 *
 * Output shape: identical StakeholderIntel — same cognition contract
 * regardless of source. See memory: stable_cognition_layer.md.
 */

import type {
  StakeholderIntel,
  Confidence,
} from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NinjaPearDate {
  day?: number;
  month?: number;
  year?: number;
}

interface NinjaPearWorkExperience {
  company?: string;
  company_website?: string;
  title?: string;
  role?: string;
  description?: string;
  starts_at?: NinjaPearDate | null;
  ends_at?: NinjaPearDate | null;
  location?: string;
  is_current?: boolean;
}

interface NinjaPearEducation {
  school?: string;
  degree?: string;
  field_of_study?: string;
  starts_at?: NinjaPearDate | null;
  ends_at?: NinjaPearDate | null;
}

interface NinjaPearProfile {
  /** Stable identity ID assigned by NinjaPear */
  id?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  full_name?: string;
  bio?: string;
  x_handle?: string;
  x_profile_url?: string;
  personal_website?: string;
  profile_pic_url?: string;
  country?: string;
  city?: string;
  state?: string;
  work_experience?: NinjaPearWorkExperience[];
  education?: NinjaPearEducation[];
  /** URL helpers returned by the API for follow-up calls */
  work_email_lookup?: string;
  similar_people?: string;
}

export interface NinjaPearLookupInput {
  /** Best-quality input — direct match */
  workEmail?: string;
  /** Name + employer domain — primary fallback */
  firstName?: string;
  lastName?: string;
  middleName?: string;
  /** Role + employer domain — last-resort fallback when name unknown */
  role?: string;
  /** Employer domain. Pass either bare domain ("flow.life") or full URL —
   *  we'll normalize. */
  employerWebsite?: string;
}

function normalizeDomain(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  // Strip protocol + path; keep just the host.
  try {
    const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return trimmed;
  }
}

/**
 * Fetches a person profile from NinjaPear. Returns null on any failure
 * (instrumentation-grade resilience — enrichment, never gate).
 *
 * At least ONE of:
 *   - workEmail
 *   - firstName + employerWebsite
 *   - role + employerWebsite
 */
export async function fetchNinjaPearProfile(
  input: NinjaPearLookupInput,
  opts: {
    useCache?: "if-recent" | "if-present" | "if-present-only" | "never";
  } = {},
): Promise<NinjaPearProfile | null> {
  const apiKey = process.env.NINJAPEAR_API_KEY;
  if (!apiKey) {
    console.warn(
      "[ninjapear] NINJAPEAR_API_KEY missing; skipping enrichment. Sign up at https://nubela.co and add to .env.local + Vercel env.",
    );
    return null;
  }

  const employer = normalizeDomain(input.employerWebsite);
  const hasEmail = Boolean(input.workEmail);
  const hasNameCombo = Boolean(input.firstName && employer);
  const hasRoleCombo = Boolean(input.role && employer);

  if (!hasEmail && !hasNameCombo && !hasRoleCombo) {
    console.warn(
      "[ninjapear] insufficient input — need work_email OR first_name+employer_website OR role+employer_website",
    );
    return null;
  }

  const params = new URLSearchParams();
  if (input.workEmail) params.set("work_email", input.workEmail);
  if (input.firstName) params.set("first_name", input.firstName);
  if (input.lastName) params.set("last_name", input.lastName);
  if (input.middleName) params.set("middle_name", input.middleName);
  if (input.role) params.set("role", input.role);
  if (employer) params.set("employer_website", employer);
  params.set("use_cache", opts.useCache ?? "if-recent");

  try {
    const res = await fetch(
      `https://nubela.co/api/v1/employee/profile?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[ninjapear] ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as NinjaPearProfile;
    return data;
  } catch (err) {
    console.warn(
      `[ninjapear] fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Format a NinjaPear date as "YYYY" or "YYYY-MM" for display. */
function formatYear(d?: NinjaPearDate | null): string {
  if (!d || !d.year) return "";
  return String(d.year);
}

function isCurrentRole(e: NinjaPearWorkExperience): boolean {
  if (e.is_current === true) return true;
  if (!e.ends_at) return true; // null/undefined ends_at == still there
  return false;
}

/**
 * Maps a NinjaPear profile into the stable StakeholderIntel contract.
 * Same operator-voice background convention as the prior Proxycurl
 * mapper — the cognition layer doesn't care which acquisition source
 * fed it.
 *
 * `linkedinUrlForReference` is optional and human-curated — passed
 * through into StakeholderIntel.linkedin_url so the rep can still
 * click through, but NEVER used as input to the lookup.
 */
export function ninjaPearProfileToStakeholderIntel(
  profile: NinjaPearProfile,
  opts: {
    linkedinUrlForReference?: string;
    roleInDeal?: StakeholderIntel["role_in_deal"]["value"];
    capturedAt?: string;
    /** Optional — the page the user can read for human verification */
    sourceUrlForCitation?: string;
  } = {},
): StakeholderIntel {
  const {
    linkedinUrlForReference,
    roleInDeal = "unknown",
    capturedAt = new Date().toISOString(),
    sourceUrlForCitation,
  } = opts;

  const fullName =
    profile.full_name ??
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();

  const experiences = profile.work_experience ?? [];
  const currentRole =
    experiences.find(isCurrentRole) ?? experiences[0];
  const titleText = currentRole?.title ?? currentRole?.role ?? null;
  const currentCompany = currentRole?.company ?? null;

  const location = [profile.city, profile.state, profile.country]
    .filter(Boolean)
    .join(", ");

  // Pick a stable citation URL: prefer the personal website, then the
  // LinkedIn-for-reference (if the caller passed one), then the company
  // website on the current role. Operators want a link they can open.
  const citationUrl =
    sourceUrlForCitation ??
    profile.personal_website ??
    linkedinUrlForReference ??
    currentRole?.company_website ??
    undefined;

  // --- Operator-voice background ---
  const bgParts: string[] = [];
  if (titleText && currentCompany) {
    const startYear = formatYear(currentRole?.starts_at);
    const tenureNote = startYear ? ` (since ${startYear})` : "";
    bgParts.push(`${titleText} at ${currentCompany}${tenureNote}.`);
  } else if (titleText) {
    bgParts.push(`${titleText}.`);
  }

  // Prior experiences — most recent 2 (excluding current)
  const priorRoles = experiences
    .filter((e) => !isCurrentRole(e))
    .slice(0, 2);
  if (priorRoles.length > 0) {
    const priorParts = priorRoles
      .map((e) => {
        const start = formatYear(e.starts_at);
        const end = formatYear(e.ends_at);
        const range = start && end ? ` (${start}–${end})` : "";
        const t = e.title ?? e.role ?? "?";
        const c = e.company ?? "?";
        return `${t} at ${c}${range}`;
      })
      .filter((s) => !s.startsWith("? at"));
    if (priorParts.length > 0) {
      bgParts.push(`Prior: ${priorParts.join("; ")}.`);
    }
  }

  if (location) bgParts.push(`Based in ${location}.`);

  // Education — top entry only, for rapport context
  const topEdu = profile.education?.[0];
  let educationFact: string | null = null;
  if (topEdu?.school) {
    const degree = topEdu.degree ? `${topEdu.degree}, ` : "";
    educationFact = `${degree}${topEdu.school}`;
  }

  // Self-described bio — useful for tone-matching, NOT for inferring
  // buying authority. Surfaced into visible_priorities with a confidence
  // note that flags this.
  let bioCompact: string | null = null;
  if (profile.bio && profile.bio.length > 20) {
    bioCompact = profile.bio.replace(/\s+/g, " ").trim().slice(0, 280);
  }

  const background = bgParts.join(" ");

  // --- Confidence (cognition-layer policy) ---
  // NinjaPear data is medium-high by default. Current role + experiences
  // populated raises it. Sparse fields lower it.
  let confidence: Confidence = "medium";
  if (titleText && currentCompany && experiences.length > 1) {
    confidence = "high";
  } else if (!titleText || !currentCompany) {
    confidence = "low";
  }

  // --- Rapport hooks ---
  const rapportHooks: StakeholderIntel["rapport_hooks"] = [];
  if (educationFact) {
    rapportHooks.push({
      value: educationFact,
      source: "web_search",
      source_url: citationUrl,
      captured_at: capturedAt,
      confidence: "medium",
    });
  }
  if (location) {
    rapportHooks.push({
      value: `Located: ${location}`,
      source: "web_search",
      source_url: citationUrl,
      captured_at: capturedAt,
      confidence: "medium",
    });
  }

  // --- Visible priorities (from self-described bio if any) ---
  const visiblePriorities: StakeholderIntel["visible_priorities"] = [];
  if (bioCompact) {
    visiblePriorities.push({
      value: `Self-described focus: ${bioCompact}${
        (profile.bio?.length ?? 0) > 280 ? "…" : ""
      }`,
      source: "web_search",
      source_url: citationUrl,
      captured_at: capturedAt,
      confidence: "medium",
      confidence_note:
        "Bio is what THEY say about themselves — useful for tone-matching but not for inferring buying authority",
    });
  }

  return {
    name: fullName,
    title: titleText
      ? {
          value: currentCompany ? `${titleText} at ${currentCompany}` : titleText,
          source: "web_search",
          source_url: citationUrl,
          captured_at: capturedAt,
          confidence,
        }
      : undefined,
    role_in_deal: {
      value: roleInDeal,
      confidence: "low",
      rationale:
        "NinjaPear provides public-web-derived title + employment data but not role-in-this-deal. Mark as 'unknown' until confirmed in transcripts or by the rep.",
    },
    background: {
      value:
        background ||
        "NinjaPear returned a match but no usable background fields.",
      source: "web_search",
      source_url: citationUrl,
      captured_at: capturedAt,
      confidence,
    },
    visible_priorities: visiblePriorities,
    rapport_hooks: rapportHooks,
    watch_for: [
      "NinjaPear sources from public web (not LinkedIn) — current title/employer may lag reality by weeks. Verify in the first call.",
    ],
    linkedin_url: linkedinUrlForReference,
  };
}
