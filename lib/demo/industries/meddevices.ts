import type { DemoIndustry } from "../pipeline";

/**
 * Med Devices industry book.
 *
 * PLACEHOLDER CONTENT — one minimal deal so this industry renders a cockpit
 * (no empty-org bounce). Replace with the full 7-deal book in Slice 4, per
 * docs/demo-industry-instances.md §3.
 */
export const MEDDEVICES: DemoIndustry = {
  key: "meddevices",
  label: "Med Devices",
  sellerContext:
    "The rep sells Meridian, a planning platform, into medical-device manufacturers.",
  deals: [
    {
      key: "meddev_placeholder_stalled",
      account: {
        name: "Placeholder MedTech Co",
        domain: "placeholder-medtech.example",
        industry: "Medical devices",
      },
      deal: {
        name: "Placeholder MedTech Co — planning platform evaluation",
        stageLabel: "Evaluation",
        stagePosition: 3,
        totalStages: 5,
        arr: 160000,
        closeDate: "2026-10-15",
        methodology: "MEDDPICC",
      },
      stakeholders: [
        {
          name: "Sample Champion",
          title: "VP Finance",
          role: "champion",
          note: "Placeholder stakeholder — replace in Slice 4.",
        },
      ],
      calls: [
        {
          id: "call_01",
          date: "2026-07-05",
          durationMin: 45,
          title: "Discovery",
          attendees: [{ name: "Sample Champion", airtimeMin: 22 }],
          summary: "Placeholder call summary.",
          excerpts: [{ speaker: "Sample Champion", quote: "Placeholder quote." }],
        },
      ],
      brief: {
        posture: "stalled",
        topLine: "Placeholder top line for the Med Devices proof deal.",
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
