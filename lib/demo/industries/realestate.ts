import type { DemoIndustry } from "../pipeline";

/**
 * Real Estate industry book.
 *
 * PLACEHOLDER CONTENT — one minimal deal so this industry renders a cockpit
 * (no empty-org bounce). Replace with the full 7-deal book in Slice 4, per
 * docs/demo-industry-instances.md §3.
 */
export const REALESTATE: DemoIndustry = {
  key: "realestate",
  label: "Real Estate",
  sellerContext:
    "The rep sells Meridian, a planning platform, into commercial real-estate firms.",
  deals: [
    {
      key: "realestate_placeholder_ontrack",
      account: {
        name: "Placeholder Realty Co",
        domain: "placeholder-realty.example",
        industry: "Commercial real estate",
      },
      deal: {
        name: "Placeholder Realty Co — planning platform rollout",
        stageLabel: "Proposal",
        stagePosition: 4,
        totalStages: 5,
        arr: 190000,
        closeDate: "2026-09-20",
        methodology: "MEDDPICC",
      },
      stakeholders: [
        {
          name: "Sample Champion",
          title: "SVP Finance",
          role: "champion",
          note: "Placeholder stakeholder — replace in Slice 4.",
        },
      ],
      calls: [
        {
          id: "call_01",
          date: "2026-07-08",
          durationMin: 45,
          title: "Discovery",
          attendees: [{ name: "Sample Champion", airtimeMin: 24 }],
          summary: "Placeholder call summary.",
          excerpts: [{ speaker: "Sample Champion", quote: "Placeholder quote." }],
        },
      ],
      brief: {
        posture: "advancing",
        topLine: "Placeholder top line for the Real Estate proof deal.",
        thesis: "Placeholder thesis.",
        decisionFrame: "Placeholder decision frame.",
        whyMatters: "Placeholder why it matters.",
        whatChanged: "Placeholder what changed.",
        risks: [
          {
            severity: "medium",
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
