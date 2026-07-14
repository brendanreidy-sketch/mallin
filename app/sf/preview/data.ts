/**
 * ============================================================================
 *  Cirrus Retail - Platform — demo data (synthetic)
 * ============================================================================
 *
 *  A fully fictional demo deal used to show the CRM side-by-side surface.
 *  It illustrates the pattern the AI fills:
 *
 *    - The rep keeps the structural CRM work current (Next Step, Active
 *      Category %, Stage, Amount) — day-to-day hygiene is fine.
 *    - What's missing is the qualitative MEDDPICC narrative that surfaced
 *      on the call but was never logged — Champion, Economic Buyer,
 *      Compelling Event Details, Competition, Business Drivers, Risks &
 *      Mitigation.
 *
 *  That's the precise gap the AI fills — from the call, narrowly, no
 *  padding. Field labels use generic MEDDPICC concepts so a viewer can
 *  hold this side-by-side with their own CRM.
 * ============================================================================
 */

export type Tier = "auto" | "suggest" | "readonly";

export interface FieldUpdate {
  before: string | null;
  after: string;
  tier: Tier;
  attribution?: string;
}

export interface SectionField {
  label: string;
  value?: string | null;
  update?: FieldUpdate;
  link?: boolean;
  multiline?: boolean;
}

export interface Section {
  title: string;
  fields: SectionField[];
  /** Optional helper note above the field grid — e.g. "rep work,
   *  preserved untouched". */
  note?: string;
}

export interface DemoOpportunity {
  name: string;
  accountName: string;
  closeDate: string;
  amount: string;
  ownerName: string;
  stages: Array<{ label: string; status: "complete" | "current" | "todo" }>;
  callContext: {
    title: string;
    date: string;
    duration: string;
    participants: string;
  };
  /** The 30-second CRO read. What this deal is, what's at risk, what's
   *  the move. Written in the voice of a 10-year sales manager — short
   *  sentences, names not titles, no analyst register. */
  theRead: string;
  sections: Section[];
}

export const DEMO_OPPORTUNITY: DemoOpportunity = {
  name: "Cirrus Retail - Platform",
  accountName: "Cirrus Retail",
  closeDate: "7/2/2026",
  amount: "USD 35,000",
  ownerName: "Jordan Mills",
  stages: [
    { label: "1 - Identify", status: "complete" },
    { label: "2 - Discovery", status: "complete" },
    { label: "3 - Solution Validation", status: "current" },
    { label: "4 - Proposal", status: "todo" },
    { label: "5 - Short List", status: "todo" },
    { label: "6 - Due Diligence", status: "todo" },
    { label: "7 - Contract", status: "todo" },
    { label: "Closed", status: "todo" },
  ],
  callContext: {
    title: "Northwind / Cirrus Retail - Intro Call",
    date: "Mar 6, 2026",
    duration: "34 min via Microsoft Teams",
    participants:
      "Sam Reyes (BDR) · Jordan Mills (SE) ↔ Dana Okafor (Sr. Finance Manager) · Priya Anand (Finance Analyst)",
  },
  theRead:
    "If Alex isn't involved in this deal, we run the risk of it slipping or not happening. We already gave a $10K concession without even having the signer involved. Why?",
  sections: [
    // ─── Current Position (rep work — preserved) ─────────────────────
    {
      title: "Current Position",
      note: "What the rep already filled. Untouched.",
      fields: [
        { label: "Opportunity Name", value: "Cirrus Retail - Platform" },
        { label: "Account Name", value: "Cirrus Retail", link: true },
        { label: "Primary Contact", value: "Priya Anand", link: true },
        { label: "Close Date", value: "7/2/2026" },
        { label: "Opportunity Owner", value: "Jordan Mills", link: true },
        { label: "Product Line", value: "Northwind Mid-Market" },
        { label: "Type", value: "New Logo" },
        { label: "Stage", value: "3 - Solution Validation" },
        { label: "Probability (%)", value: "15%" },
        { label: "Top Feeling", value: "10%" },
        { label: "Forecast Category", value: "Upside" },
        { label: "Probable", value: "No" },
        { label: "Stage Duration (in days)", value: "32" },
        { label: "SQL Date", value: "3/6/2026 1:37 PM" },
      ],
    },

    // ─── Execution Dashboard — MEDDPICC ──────────────────────────────
    // Generic MEDDPICC field labels (the "5-", "10-", "15-" prefixes are
    // weighted scoring). Most blank in the record after 2 months. This is
    // the gap the AI fills from the call.
    {
      title: "Execution Dashboard — MEDDPICC",
      note: "The qualitative stuff most reps skip. We pull it from the call.",
      fields: [
        {
          label: "5- Comp. Event (Why now)?",
          update: {
            before: "(unchecked)",
            after: "✓ Yes",
            tier: "suggest",
            attribution: "Dana @ 8:09 — Vantage contract is up in November.",
          },
        },
        {
          label: "Compelling Event Details",
          update: {
            before: null,
            after:
              "Vantage is up in November. They want the new system locked by midyear so there's 2-3 months of overlap before contract end. Priya said the business case is already in flight — that's why they took our call.",
            tier: "suggest",
            attribution: "Dana @ 8:09, Priya @ 5:08",
          },
          multiline: true,
        },
        {
          label: "5- Bus. Drivers identified?",
          update: {
            before: "(unchecked)",
            after: "✓ Yes",
            tier: "auto",
            attribution:
              "Three real drivers from the call: reporting consolidation, ERP integration (off a legacy system), data reconciliation gap.",
          },
        },
        {
          label: "Who's the Champion",
          update: {
            before: null,
            after: "Dana Okafor — Sr. Finance Manager.",
            tier: "suggest",
            attribution:
              "She used a similar platform at a prior company, knows what good looks like. She did the talking, she's the one pushing this.",
          },
        },
        {
          label: "Who's the Economic Buyer",
          update: {
            before: null,
            after: "Alex — Dana's boss.",
            tier: "suggest",
            attribution:
              "Don't have a last name yet. Haven't met him. Need to before this is a real deal.",
          },
        },
        {
          label: "15- Who signs?",
          update: {
            before: null,
            after: "Probably Alex. Confirm next call.",
            tier: "suggest",
            attribution:
              "Same person as the economic buyer unless someone else surfaces. Direct ask Dana.",
          },
        },
        {
          label: "Customer knows/agrees on deal?",
          update: {
            before: null,
            after: "Yes — they're already building the business case.",
            tier: "suggest",
            attribution: "Priya @ 5:08.",
          },
        },
        {
          label: "15- Power Map both IT&Business done",
          update: {
            before: "(unchecked)",
            after: "Finance covered. No IT, no finance leadership, no Alex.",
            tier: "suggest",
            attribution: "Don't check this until they're all mapped.",
          },
        },
        {
          label: "10- Competition",
          update: {
            before: "(unchecked)",
            after: "✓ Yes",
            tier: "suggest",
            attribution: "Vantage — the incumbent. Dana named it directly.",
          },
        },
        {
          label: "Shortlisted Competition",
          update: {
            before: null,
            after: "Just Vantage.",
            tier: "suggest",
            attribution:
              "No active bake-off. They're deciding whether to keep Vantage or switch to us.",
          },
        },
        {
          label: "Final Competitor",
          update: {
            before: null,
            after: "Vantage — the incumbent.",
            tier: "suggest",
            attribution: "Same. We're displacing, not winning a bake-off.",
          },
        },
        {
          label: "Roadmap to close in place?",
          value: "✓ Yes (rep-set)",
        },
        {
          label: "5- Budget?",
          value: "✓ Yes (rep-set)",
        },
      ],
    },

    // ─── Risks & Mitigation ────────────────────────────────────────
    {
      title: "Risks & Mitigation",
      note: "The read on the deal — pulled from what the call surfaced and what the CRM already shows.",
      fields: [
        {
          label: "Risks/Threats",
          update: {
            before: null,
            after:
              "No signer on a call → slips.\n" +
              "Already gave $10K → more pressure coming.\n" +
              "Vantage is good enough → change management is the real fight, not features.",
            tier: "suggest",
            attribution: "Call + CRM ($45K → $35K, Forecast=Upside, signer never on a call).",
          },
          multiline: true,
        },
        {
          label: "Mitigation",
          update: {
            before: null,
            after:
              "Get Alex on the next call. Non-negotiable.\n" +
              "Anchor on the reporting/ERP gap. That's where Vantage can't go.\n" +
              "No price moves until we know who signs.",
            tier: "suggest",
            attribution: "Three moves for the next call. Everything else is secondary.",
          },
          multiline: true,
        },
      ],
    },

    // ─── Active Category & Sales Play (rep work, preserved) ────────
    {
      title: "Active Category & Sales Play",
      note: "Jordan filled these in after the intro call. Untouched.",
      fields: [
        { label: "Active Core Platform", value: "50.00%" },
        { label: "Active Analytics", value: "25.00%" },
        { label: "Active Automation", value: "0.00%" },
        { label: "Active Integrations", value: "25.00%" },
        { label: "Active Reporting", value: "0.00%" },
        { label: "Sales Play", value: "Platform & Analytics" },
      ],
    },

    // ─── Next Steps (rep work, mostly preserved + Manager note) ────
    {
      title: "Next Steps",
      note: "Jordan keeps Next Step current. We add the manager-level read.",
      fields: [
        {
          label: "Next Step",
          value:
            "4/24: Scheduling mtg for early next week to run through adjusted Northwind offer/push for tenative mm reference.",
        },
        {
          label: "Manager Next Steps",
          update: {
            before: null,
            after:
              "Why is this Upside and not Probable? Because Alex hasn't shown up. Get him on the next call or this slips. And we already gave $10K — hold the line now.",
            tier: "suggest",
            attribution:
              "From the forecast (Upside + Probable=No), the missing economic buyer, and the price thread already visible in the CRM.",
          },
          multiline: true,
        },
        {
          label: "Next Step Update Date",
          value: "4/24/2026",
        },
        {
          label: "Last Activity",
          value: "5/8/2026 (current via call sync)",
        },
      ],
    },

    // ─── Amounts (rep work, preserved) ────────────────────────────
    {
      title: "Amounts",
      note: "Untouched. The $45K → $35K story is in Risks above.",
      fields: [
        { label: "Amount", value: "USD 35,000.00" },
        { label: "Product MRR", value: "USD 0.00" },
        { label: "Exit Run Rate ARR", value: "USD 35,000.00" },
        { label: "First Amount", value: "USD 45,000.00" },
        { label: "Net Product ARR (Yr 1)", value: "USD 35,000.00" },
        { label: "Gross ARR", value: "USD 35,000.00" },
      ],
    },
  ],
};
