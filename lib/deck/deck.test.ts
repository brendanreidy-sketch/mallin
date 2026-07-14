import { describe, it, expect } from "vitest";
import { buildDeckModel } from "./deck-model";
import { buildPptx } from "./build-pptx";
import { resolveBranding } from "./brands";
import type { MeetingBlock } from "@/lib/intelligence/types";
import { OLIVE_JUNE_INTELLIGENCE } from "@/lib/intelligence/fixtures/olive-june-intelligence";

// Northwind seller brand (logoUrl null → no network fetch in tests).
const NORTHWIND_BRANDING = resolveBranding(
  { displayName: "Northwind", logoUrl: null, colorPrimary: "#0A2540", colorAccent: "#00A4BD" },
  "Olive & June",
  "oliveandjune.com",
);

// Fictional attendees + agenda for a seller/buyer intro call.
const OJ_MEETING: MeetingBlock = {
  title: "Northwind / Olive & June — Intro Call",
  date: "2026-05-13",
  meeting_type: "intro",
  attendees: [
    { name: "Alex Rivera", title: "BDR", company: "Northwind", side: "seller" },
    { name: "Jordan Mills", title: "Sr. Mid Market Sales Rep", company: "Northwind", side: "seller" },
    { name: "Ed Pawelko", title: "VP of Finance", company: "Olive & June", side: "buyer" },
    { name: "Steven Dixon", title: "VP of Operations", company: "Olive & June", side: "buyer" },
    { name: "Anthony Montijo", title: "Controller", company: "Olive & June", side: "buyer" },
  ],
  agenda: ["Systems landscape", "Integration requirements", "Rollout timeline", "Security review", "Reporting needs"],
};

const FIXTURES = [
  { name: "Olive & June", artifact: OLIVE_JUNE_INTELLIGENCE },
] as const;

describe("buildDeckModel", () => {
  for (const { name, artifact } of FIXTURES) {
    it(`builds a dual-branded model for ${name}`, () => {
      const model = buildDeckModel(artifact, name, NORTHWIND_BRANDING);
      expect(model.slides.length).toBeGreaterThanOrEqual(3);
      expect(model.slides[0].kind).toBe("title");
      expect(model.slides.at(-1)!.kind).toBe("closing");
      expect(model.branding.seller.name).toBe("Northwind");
      expect(model.branding.seller.colorPrimary).toBe("#0A2540");
    });

    it(`never leaks a rep-internal field for ${name}`, () => {
      const model = buildDeckModel(artifact, name, NORTHWIND_BRANDING);
      const json = JSON.stringify(model);
      for (const sh of artifact.stakeholders) {
        for (const w of sh.watch_for ?? []) expect(json).not.toContain(w);
        if (sh.role_in_deal?.rationale) expect(json).not.toContain(sh.role_in_deal.rationale);
      }
      for (const lm of artifact.pre_call_brief?.landmines ?? []) expect(json).not.toContain(lm);
      for (const q of artifact.pre_call_brief?.questions_to_qualify ?? []) {
        if (q.rationale) expect(json).not.toContain(q.rationale);
      }
      if (artifact.pre_call_brief?.primary_objective) {
        expect(json).not.toContain(artifact.pre_call_brief.primary_objective);
      }
    });
  }

  it("renders agenda + attendees slides (grouped by company) when a meeting block is present", () => {
    const withMeeting = { ...OLIVE_JUNE_INTELLIGENCE, meeting: OJ_MEETING };
    const model = buildDeckModel(withMeeting, "Olive & June", NORTHWIND_BRANDING);

    const title = model.slides.find((s) => s.kind === "title");
    expect(title).toBeTruthy();
    if (title?.kind === "title") {
      expect(title.sellerName).toBe("Northwind");
      expect(title.meetingTitle).toBe("Northwind / Olive & June — Intro Call");
    }

    const agenda = model.slides.find((s) => s.kind === "agenda");
    expect(agenda?.kind === "agenda" && agenda.items).toContain("Integration requirements");

    const attendees = model.slides.find((s) => s.kind === "attendees");
    expect(attendees).toBeTruthy();
    if (attendees?.kind === "attendees") {
      expect(attendees.sellerPeople.map((p) => p.name)).toEqual(["Alex Rivera", "Jordan Mills"]);
      expect(attendees.buyerPeople).toHaveLength(3);
      expect(attendees.buyerPeople.map((p) => p.name)).toContain("Steven Dixon");
    }
  });

  it("omits agenda/attendees slides when no meeting block (backward compatible)", () => {
    const model = buildDeckModel(OLIVE_JUNE_INTELLIGENCE, "Olive & June", NORTHWIND_BRANDING);
    expect(model.slides.find((s) => s.kind === "agenda")).toBeFalsy();
    expect(model.slides.find((s) => s.kind === "attendees")).toBeFalsy();
  });

  it("inserts a 'Your contact' intro slide right after the title when a confirmed AE profile is passed", () => {
    const model = buildDeckModel(OLIVE_JUNE_INTELLIGENCE, "Olive & June", NORTHWIND_BRANDING, {
      name: "Jordan Alvarez",
      title: "Account Executive",
      bio: "Ten years selling B2B software to mid-market finance teams.",
      linkedinUrl: "https://www.linkedin.com/in/jordan-alvarez",
    });
    expect(model.slides[0].kind).toBe("title");
    expect(model.slides[1].kind).toBe("intro");
    const intro = model.slides[1];
    if (intro.kind === "intro") {
      expect(intro.person.name).toBe("Jordan Alvarez");
      expect(intro.person.title).toBe("Account Executive");
      expect(intro.person.linkedinUrl).toBe("https://www.linkedin.com/in/jordan-alvarez");
      expect(intro.sellerName).toBe("Northwind");
    }
  });

  it("omits the intro slide when no AE profile is passed (backward compatible)", () => {
    const model = buildDeckModel(OLIVE_JUNE_INTELLIGENCE, "Olive & June", NORTHWIND_BRANDING);
    expect(model.slides.find((s) => s.kind === "intro")).toBeFalsy();
  });

  it("omits the intro slide when the profile has no name", () => {
    const model = buildDeckModel(OLIVE_JUNE_INTELLIGENCE, "Olive & June", NORTHWIND_BRANDING, {
      name: "   ",
      title: "Account Executive",
    });
    expect(model.slides.find((s) => s.kind === "intro")).toBeFalsy();
  });
});

describe("buildPptx", () => {
  it("produces a valid OOXML .pptx including meeting slides", async () => {
    const withMeeting = { ...OLIVE_JUNE_INTELLIGENCE, meeting: OJ_MEETING };
    const model = buildDeckModel(withMeeting, "Olive & June", NORTHWIND_BRANDING);
    const buf = await buildPptx(model);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buf.length).toBeGreaterThan(5000);
  });

  for (const { name, artifact } of FIXTURES) {
    it(`produces a valid OOXML .pptx for ${name}`, async () => {
      const model = buildDeckModel(artifact, name, NORTHWIND_BRANDING);
      const buf = await buildPptx(model);
      expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
      expect(buf.length).toBeGreaterThan(5000);
    });
  }

  it("renders the AE intro slide into a valid .pptx", async () => {
    const model = buildDeckModel(OLIVE_JUNE_INTELLIGENCE, "Olive & June", NORTHWIND_BRANDING, {
      name: "Jordan Alvarez",
      title: "Account Executive",
      bio: "Ten years selling B2B software to mid-market finance teams.",
      linkedinUrl: "https://www.linkedin.com/in/jordan-alvarez",
    });
    expect(model.slides.some((s) => s.kind === "intro")).toBe(true);
    const buf = await buildPptx(model);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buf.length).toBeGreaterThan(5000);
  });
});
