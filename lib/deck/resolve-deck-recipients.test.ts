import { describe, it, expect } from "vitest";
import { resolveDeckRecipients } from "./resolve-deck-recipients";

describe("resolveDeckRecipients", () => {
  it("returns buyer-side stakeholders with emails", () => {
    const out = resolveDeckRecipients({
      stakeholders: [
        { name: "Wade Martin", email: "wade@islandtech.com" },
        { name: "Jeff Lankford", email: "jeff@islandtech.com" },
      ],
    });
    expect(out).toEqual([
      { name: "Wade Martin", email: "wade@islandtech.com" },
      { name: "Jeff Lankford", email: "jeff@islandtech.com" },
    ]);
  });

  it("NEVER returns the rep's own email", () => {
    const out = resolveDeckRecipients({
      stakeholders: [{ name: "Rep", email: "builtalone@gmail.com" }],
      repEmail: "builtalone@gmail.com",
    });
    expect(out).toEqual([]);
  });

  it("excludes internal-participant (seller-side) emails", () => {
    const out = resolveDeckRecipients({
      stakeholders: [
        { name: "Rep", email: "ae@northwind.com" },
        { name: "Wade Martin", email: "wade@islandtech.com" },
      ],
      internalParticipantEmails: ["ae@northwind.com"],
    });
    expect(out).toEqual([{ name: "Wade Martin", email: "wade@islandtech.com" }]);
  });

  it("excludes any stakeholder sharing a seller-side domain", () => {
    const out = resolveDeckRecipients({
      stakeholders: [
        { name: "Another Rep", email: "sdr@northwind.com" },
        { name: "Buyer", email: "buyer@islandtech.com" },
      ],
      internalParticipantEmails: ["ae@northwind.com"],
    });
    expect(out).toEqual([{ name: "Buyer", email: "buyer@islandtech.com" }]);
  });

  it("returns empty when no buyer-side email is known (rep must pick)", () => {
    const out = resolveDeckRecipients({
      stakeholders: [
        { name: "Wade Martin" },
        { name: "Jeff Lankford", email: "not-an-email" },
      ],
    });
    expect(out).toEqual([]);
  });

  it("is case-insensitive and dedupes on exclusion", () => {
    const out = resolveDeckRecipients({
      stakeholders: [
        { name: "Rep Upper", email: "AE@northwind.com" },
        { name: "Buyer", email: "buyer@islandtech.com" },
        { name: "Buyer Dupe", email: "BUYER@islandtech.com" },
      ],
      repEmail: "ae@northwind.com",
    });
    expect(out).toEqual([{ name: "Buyer", email: "buyer@islandtech.com" }]);
  });

  it("handles empty / missing input safely", () => {
    expect(resolveDeckRecipients({})).toEqual([]);
    expect(resolveDeckRecipients({ stakeholders: [] })).toEqual([]);
  });
});
