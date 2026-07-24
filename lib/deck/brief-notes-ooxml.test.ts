import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { renderableBrief } from "./fixtures/brief-mock-drafts";
import { buildBriefPptx } from "./build-brief-pptx";

/**
 * Proves speaker-note evidence in the actual OOXML ZIP — not merely that
 * slide.addNotes() exists. Confirms notes-slide parts exist, are wired to the
 * correct slides via relationships, carry the expected evidence reference, do
 * not contain a full transcript, and are not attached to the wrong slide.
 */

let zip: JSZip;
let names: string[];
beforeAll(async () => {
  const brief = await renderableBrief();
  const { buffer } = await buildBriefPptx(brief);
  zip = await JSZip.loadAsync(buffer);
  names = Object.keys(zip.files);
});

async function xml(path: string): Promise<string> {
  const f = zip.file(path);
  if (!f) throw new Error(`missing ${path}`);
  return f.async("string");
}

describe("speaker notes — OOXML evidence", () => {
  it("includes notesSlide parts", () => {
    const notes = names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    expect(notes.length).toBeGreaterThan(0);
  });

  it("wires each notes slide to a real slide via relationships", async () => {
    const notes = names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    for (const n of notes) {
      const relPath = n.replace(/notesSlides\/(notesSlide\d+)\.xml$/, "notesSlides/_rels/$1.xml.rels");
      const rels = await xml(relPath);
      expect(rels).toMatch(/slides\/slide\d+\.xml/); // notes → its slide
    }
  });

  it("puts the executive-summary evidence in the notes of the executive-summary slide, not another", async () => {
    // Find the slide whose text contains the executive-summary title.
    const slideFiles = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
    let execSlide = "";
    for (const s of slideFiles) if ((await xml(s)).includes("Executive summary")) execSlide = s;
    expect(execSlide).toBeTruthy();

    // Resolve exec slide → its notes slide via the slide's rels.
    const slideNo = execSlide.match(/slide(\d+)\.xml/)![1];
    const rels = await xml(`ppt/slides/_rels/slide${slideNo}.xml.rels`);
    const notesTarget = rels.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/);
    expect(notesTarget).toBeTruthy();
    const execNotes = await xml(`ppt/notesSlides/${notesTarget![1]}`);

    // The exec-summary evidence detail lands here (posture binding), and the
    // stakeholder evidence (Marcus Bell) does NOT.
    expect(execNotes).toMatch(/deal_posture\.posture = at_risk|posture/);
    expect(execNotes).toContain("evidence:");
    expect(execNotes).not.toContain("Marcus Bell"); // that belongs to the stakeholder slide's notes
  });

  it("never embeds a full transcript into the notes", async () => {
    const notes = names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    const all = (await Promise.all(notes.map(xml))).join("\n");
    // An UNCITED transcript segment (call_nw_1 seg0) must not appear anywhere.
    expect(all).not.toContain("We can't risk migrating off the legacy dispatch board");
  });
});
