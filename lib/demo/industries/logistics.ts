import type { DemoIndustry } from "../pipeline";

/**
 * Logistics industry book.
 *
 * PLACEHOLDER CONTENT — Slice 1 proves the industry switch with a single
 * minimal deal (a different posture than SaaS, so switching is visibly
 * distinct). Replace with the full 7-deal book in Slice 4, per
 * docs/demo-industry-instances.md §3.
 */
export const LOGISTICS: DemoIndustry = {
  key: "logistics",
  label: "Logistics",
  sellerContext:
    "The rep sells Meridian, a planning platform, into freight and logistics operators.",
  deals: [
    {
      key: "logistics_placeholder_atrisk",
      account: {
        name: "Placeholder Freight Co",
        domain: "placeholder-freight.example",
        industry: "Freight & logistics",
      },
      deal: {
        name: "Placeholder Freight Co — planning platform evaluation",
        stageLabel: "Negotiation",
        stagePosition: 4,
        totalStages: 5,
        arr: 140000,
        closeDate: "2026-09-01",
        methodology: "MEDDPICC",
      },
      stakeholders: [
        {
          name: "Sample Champion",
          title: "Director of Operations",
          role: "champion",
          note: "Placeholder stakeholder — replace in Slice 4.",
        },
      ],
      calls: [
        {
          id: "call_01",
          date: "2026-07-02",
          durationMin: 45,
          title: "Discovery",
          attendees: [{ name: "Sample Champion", airtimeMin: 22 }],
          summary: "Placeholder call summary.",
          excerpts: [{ speaker: "Sample Champion", quote: "Placeholder quote." }],
        },
      ],
      brief: {
        posture: "at_risk",
        topLine: "Placeholder top line for the Logistics proof deal.",
        thesis: "Placeholder thesis.",
        decisionFrame: "Placeholder decision frame.",
        whyMatters: "Placeholder why it matters.",
        whatChanged: "Placeholder what changed.",
        risks: [
          {
            severity: "high",
            title: "Placeholder risk",
            description: "Placeholder description.",
            failureMode: "Placeholder failure mode.",
            posture: "Placeholder recommended move.",
          },
        ],
        howYouWin: "Placeholder how-you-win.",
        opening: "Placeholder opening line.",
        questions: ["Placeholder question?"],
        nextSteps: ["Placeholder next step"],
      },
    },
  ],
};
