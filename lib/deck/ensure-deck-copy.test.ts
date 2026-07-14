import { describe, it, expect } from "vitest";
import { mergeMeeting } from "./ensure-deck-copy";
import type { MeetingBlock } from "@/lib/intelligence/types";

const copy: MeetingBlock = {
  title: "Copy Title",
  date: "2026-05-13",
  meeting_type: "intro",
  attendees: [{ name: "Copy Rep", company: "Northwind", side: "seller" }],
  agenda: ["copy a", "copy b"],
  sections: [{ heading: "Where you are", bullets: ["b1", "b2"] }],
};

describe("mergeMeeting", () => {
  it("uses the copy entirely when there is no existing meeting", () => {
    const m = mergeMeeting(null, copy);
    expect(m.title).toBe("Copy Title");
    expect(m.attendees).toHaveLength(1);
    expect(m.agenda).toEqual(["copy a", "copy b"]);
    expect(m.sections).toHaveLength(1);
  });

  it("takes the whole header from the copy (latest call), not the prior meeting", () => {
    // "existing" here is a PRIOR call's meeting. On a second call the copy is
    // generated from the newer transcript, so the deck header must reflect the
    // latest call — not stay frozen on the intro title/agenda.
    const existing: MeetingBlock = {
      title: "Real Intro Call",
      date: "2026-05-01",
      meeting_type: "intro",
      attendees: [
        { name: "Dimitrie", title: "AE", company: "Northwind", side: "seller" },
        { name: "Ed", title: "VP Finance", company: "Acme Corp", side: "buyer" },
      ],
      agenda: ["real 1", "real 2"],
    };
    const m = mergeMeeting(existing, copy);
    expect(m.title).toBe("Copy Title"); // copy wins
    expect(m.date).toBe("2026-05-13"); // copy wins
    expect(m.attendees).toHaveLength(1); // copy wins
    expect(m.attendees[0].name).toBe("Copy Rep");
    expect(m.agenda).toEqual(["copy a", "copy b"]); // copy wins
    expect(m.sections).toHaveLength(1); // always from copy
    expect(m.sections![0].heading).toBe("Where you are");
  });

  it("falls back to the existing header only for fields the copy didn't yield", () => {
    const existing: MeetingBlock = {
      title: "Prior Title",
      date: "2026-05-01",
      meeting_type: "discovery",
      attendees: [{ name: "Prior Rep", company: "Northwind", side: "seller" }],
      agenda: ["prior a"],
    };
    // A sparse copy — e.g. an undated transcript with no agenda extracted.
    const sparse: MeetingBlock = { title: "New Call", attendees: [], agenda: [], sections: [{ heading: "H", bullets: ["b"] }] };
    const m = mergeMeeting(existing, sparse);
    expect(m.title).toBe("New Call"); // copy wins
    expect(m.date).toBe("2026-05-01"); // copy had none → existing fills
    expect(m.meeting_type).toBe("discovery"); // copy had none → existing fills
    expect(m.agenda).toEqual(["prior a"]); // copy had none → existing fills
    expect(m.attendees[0].name).toBe("Prior Rep"); // copy had none → existing fills
  });

  it("never leaves sections undefined", () => {
    const m = mergeMeeting(null, { ...copy, sections: undefined });
    expect(m.sections).toEqual([]);
  });
});
