import type { DemoIndustry } from "../pipeline";

/**
 * SaaS industry book.
 *
 * PLACEHOLDER CONTENT — Slice 1 proves the industry switch with a single
 * minimal deal. Replace this with the full 7-deal book in Slice 3 (won / lost
 * / stalled / needs-you×2 / on-track×2), per docs/demo-industry-instances.md §3.
 */
export const SAAS: DemoIndustry = {
  key: "saas",
  label: "SaaS",
  sellerContext:
    "The rep sells Meridian, a B2B analytics platform, into software companies.",
  deals: [
    {
      key: "saas_placeholder_won",
      account: {
        name: "Placeholder SaaS Co",
        domain: "placeholder-saas.example",
        industry: "Software",
      },
      deal: {
        name: "Placeholder SaaS Co — analytics rollout",
        stageLabel: "Closed Won",
        stagePosition: 5,
        totalStages: 5,
        arr: 120000,
        closeDate: "2026-06-15",
        methodology: "MEDDPICC",
      },
      stakeholders: [
        {
          name: "Sample Champion",
          title: "VP Product",
          role: "champion",
          note: "Placeholder stakeholder — replace in Slice 3.",
        },
      ],
      calls: [
        {
          id: "call_01",
          date: "2026-05-20",
          durationMin: 40,
          title: "Discovery",
          attendees: [{ name: "Sample Champion", airtimeMin: 20 }],
          summary: "Placeholder call summary.",
          excerpts: [{ speaker: "Sample Champion", quote: "Placeholder quote." }],
        },
      ],
      brief: {
        posture: "advancing",
        topLine: "Placeholder top line for the SaaS proof deal.",
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
      outcome: {
        outcome: "won",
        closedAt: "2026-06-15",
        notes: "Placeholder win reason.",
        riskMaterialized: false,
        moveTaken: true,
      },
    },
  ],
};
