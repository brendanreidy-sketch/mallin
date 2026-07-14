/**
 * ============================================================================
 *  Outbound targeting — the customer-governed config (agnostic engine input)
 * ============================================================================
 *
 * The generic contract the sourcing engine runs on. The LOGIC is built once and
 * is company-agnostic; the VALUES are governance — supplied per customer. Same
 * discipline as the inbound SDR's SdrTenantConfig (multi-tenant by
 * construction): the engine has no opinions of its own about who to target; it
 * applies the customer's configured personas + industries + triggers.
 *
 * Two first-class governing dimensions, by design:
 *   - INDUSTRY  → where to look (IndustryTarget[])
 *   - PERSONA   → who to reach, matched by DUTIES/PAINS not just a title
 *                 (reuses SdrPersona from the inbound SDR — one config plane,
 *                  no parallel model; see write_through_operating_layer.md)
 *
 * `MALLIN_OUTBOUND` is ONE instance — Mallin dogfooding its own product on its
 * own pipeline. A future customer supplies their own OutboundConfig; the
 * per-tenant storage + config UI is the reserved product SURFACE, not this
 * contract. Keeping `offering` central is what keeps sourcing judgment-led
 * (news_to_product_relevance.md): every reason-to-reach is written through the
 * lens of what THIS customer sells, never generic firmographics.
 * ============================================================================
 */

import type { SdrPersona } from "../types";
import type { TargetSeniority } from "./seniority";
import { AE_SENIORITY } from "./seniority";

/** A first-class industry target — where to look, and what fit looks like there. */
export interface IndustryTarget {
  /** e.g. "Fintech", "Vertical SaaS", "Infrastructure / dev tools". */
  name: string;
  /** Optional: what a good fit looks like specifically in this industry. */
  fit_notes?: string;
}

/**
 * A customer-governed outbound targeting config. The sourcing engine consumes
 * this and nothing hard-coded — swap the instance, retarget the whole engine.
 */
export interface OutboundConfig {
  /** The customer whose pipeline this fills — the agent represents them. */
  company_name: string;
  /** Authoritative identity for research (disambiguates same-named companies). */
  website?: string;
  /**
   * What the customer sells. Anchors why_fit + the outreach hook so every
   * reason-to-reach is offering-relative — the judgment-led anchor.
   */
  offering: string;
  /** First-class INDUSTRY dimension — where to source. */
  industries: IndustryTarget[];
  /**
   * First-class PERSONA dimension — who to reach, matched by duties/pains, not
   * just title. Reused from the inbound SDR (role, duties, pains, cares_about).
   */
  personas: SdrPersona[];
  /**
   * Company-level firmographic filters (size, geo, ACV, sales motion, tooling)
   * — the "right kind of company" gate, orthogonal to industry + persona.
   */
  company_filters?: string[];
  /**
   * Trigger events — a fitting company WITH a live trigger is the whole point.
   * The highest-leverage governance field.
   */
  trigger_events: string[];
  /** Hard non-fits — sourcing excludes these on sight. */
  disqualifiers: string[];
  /**
   * Which buyer seniority to reach — a size-adaptive BAND, not a fixed title
   * (see seniority.ts). AE band by default; the SDR preset widens to Manager.
   */
  target_seniority?: TargetSeniority;
}

/**
 * Mallin's own instance — the internal-pipeline strawman. Edit in place.
 * Personas carry duties/pains/cares_about so the engine matches on the JOB, not
 * the title (e.g. a "Head of Revenue" whose pains match the RevOps persona).
 */
export const MALLIN_OUTBOUND: OutboundConfig = {
  company_name: "Mallin",
  website: "https://mallin.io",
  offering:
    "Mallin — a governed AI operating layer for revenue execution. It reads each live deal from the call substrate, surfaces the one load-bearing risk or move a rep can't hold in their head mid-call, and drafts the CRM update + follow-up for one-click approval. The wedge is in-flight execution judgment, not prospecting or reporting.",
  industries: [
    { name: "B2B SaaS", fit_notes: "Rep-led enterprise/mid-market motion, not pure PLG." },
    { name: "Enterprise software", fit_notes: "Long, committee-decided deals." },
    { name: "Fintech", fit_notes: "Regulated, procurement-heavy, multi-stakeholder cycles." },
    { name: "Vertical SaaS", fit_notes: "Domain-specific buyers, consultative sales." },
    { name: "Infrastructure / dev tools", fit_notes: "Technical + economic buyers in one deal." },
  ],
  personas: [
    {
      role: "VP / Director of Sales",
      duties: "Owns the number, the forecast, and rep performance.",
      pains: [
        "Reps lose winnable deals to blind spots they can't hold mid-call",
        "Forecast accuracy — surprises late in the quarter",
        "Execution quality varies rep to rep",
      ],
      cares_about: ["Win rate", "Predictable forecast", "Consistent rep execution"],
    },
    {
      role: "RevOps / Revenue Operations leader",
      duties: "Owns the sales tooling stack, CRM hygiene, and process.",
      pains: [
        "CRM data rot — the qualitative deal narrative never gets logged",
        "Tool sprawl with no shared execution layer",
        "Governance lives in slides, not in the flow of work",
      ],
      cares_about: ["Clean pipeline data", "Governed process", "Tool ROI"],
    },
    {
      role: "Chief Revenue Officer",
      duties: "Owns all of revenue and GTM strategy.",
      pains: [
        "Scaling the motion without losing deal quality",
        "Inconsistent execution as headcount grows",
      ],
      cares_about: ["Repeatable motion", "Governance at scale", "Growth efficiency"],
    },
    {
      role: "Head of Sales Enablement",
      duties: "Onboards and coaches reps; owns methodology adoption.",
      pains: [
        "Ramp time for new reps",
        "Methodology gets taught but not applied in live deals",
      ],
      cares_about: ["Faster ramp", "In-deal coaching that actually sticks"],
    },
  ],
  company_filters: [
    "~5-100 AEs (roughly Series A through pre-IPO)",
    "Complex, multi-stakeholder sales (ACV > $25k, 60+ day cycles)",
    "Runs a real sales org on Salesforce or HubSpot",
    "US / Canada / UK",
  ],
  trigger_events: [
    "New VP Sales / RevOps / CRO hired in the last ~90 days (mandate to fix the motion)",
    "Recent funding round (Series A-C) — scaling GTM, adding reps fast",
    "Actively hiring AEs or RevOps (open reqs = growing motion, onboarding pain)",
    "Public signal of forecast / CRM-hygiene pain (leadership posts, podcast, job-req language)",
    "Recently adopted or migrating CRM / revenue tooling (in-market for the category)",
  ],
  disqualifiers: [
    "Pure PLG / self-serve with no sales reps",
    "Transactional, low-ACV, single-call sales",
    "Fewer than ~5 reps / no real sales team",
    "Pre-revenue / pre-product seed stage",
    "Agencies or consultancies looking to resell",
  ],
  target_seniority: AE_SENIORITY,
};
