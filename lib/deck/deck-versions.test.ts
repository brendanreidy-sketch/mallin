import { describe, it, expect } from "vitest";
import {
  buildVersionList,
  selectArtifactRow,
  versionLabel,
  type DeckArtifactRow,
} from "./deck-versions";

function row(over: Partial<DeckArtifactRow>): DeckArtifactRow {
  return {
    id: "id-x",
    is_current: false,
    generated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    artifact: {},
    ...over,
  };
}

// A deal's history: three artifacts, one flagged current.
const OPP_ROWS: DeckArtifactRow[] = [
  row({
    id: "v1",
    is_current: false,
    generated_at: "2026-05-01T00:00:00Z",
    artifact: { meeting: { title: "Intro call", meeting_type: "intro" } },
  }),
  row({
    id: "v2",
    is_current: false,
    generated_at: "2026-05-13T00:00:00Z",
    artifact: { meeting: { title: "Deep dive", meeting_type: "discovery" } },
  }),
  row({
    id: "v3",
    is_current: true,
    generated_at: "2026-06-02T00:00:00Z",
    artifact: { meeting: { title: "Proposal review" } },
  }),
];

describe("selectArtifactRow", () => {
  it("returns the current row when no version is requested", () => {
    expect(selectArtifactRow(OPP_ROWS)?.id).toBe("v3");
    expect(selectArtifactRow(OPP_ROWS, undefined)?.id).toBe("v3");
    expect(selectArtifactRow(OPP_ROWS, null)?.id).toBe("v3");
  });

  it("returns a specific prior row when its id is requested", () => {
    expect(selectArtifactRow(OPP_ROWS, "v1")?.id).toBe("v1");
    expect(selectArtifactRow(OPP_ROWS, "v2")?.id).toBe("v2");
  });

  // The security-critical case: an id NOT in this opportunity's set must never
  // resolve to it — it silently falls back to the current version.
  it("NEVER returns an artifact not in the opportunity's own set", () => {
    const foreign = selectArtifactRow(OPP_ROWS, "some-other-deals-artifact-id");
    expect(foreign?.id).toBe("v3"); // current, not the foreign id
    // Whatever it returns, it must be a member of the input set.
    expect(OPP_ROWS.map((r) => r.id)).toContain(foreign?.id);
  });

  it("only ever returns a row from the input set, for ANY requested id", () => {
    const ids = OPP_ROWS.map((r) => r.id);
    for (const req of ["v1", "v2", "v3", "nope", "", "../../etc", "v3 OR 1=1", undefined]) {
      const picked = selectArtifactRow(OPP_ROWS, req);
      expect(picked).not.toBeNull();
      expect(ids).toContain(picked!.id);
    }
  });

  it("falls back to newest when there is no flagged-current row", () => {
    const noCurrent = OPP_ROWS.map((r) => ({ ...r, is_current: false }));
    expect(selectArtifactRow(noCurrent)?.id).toBe("v3"); // newest generated_at
  });

  it("returns null for an empty set", () => {
    expect(selectArtifactRow([])).toBeNull();
    expect(selectArtifactRow([], "v1")).toBeNull();
  });
});

describe("buildVersionList", () => {
  it("orders newest-first and flags the current version", () => {
    const list = buildVersionList(OPP_ROWS);
    expect(list.map((v) => v.id)).toEqual(["v3", "v2", "v1"]);
    expect(list.find((v) => v.isCurrent)?.id).toBe("v3");
    expect(list.filter((v) => v.isCurrent)).toHaveLength(1);
  });

  it("exposes ONLY id + label + isCurrent (no artifact leak)", () => {
    for (const v of buildVersionList(OPP_ROWS)) {
      expect(Object.keys(v).sort()).toEqual(["id", "isCurrent", "label"]);
    }
  });
});

describe("versionLabel", () => {
  it("prefers the meeting title", () => {
    expect(versionLabel(row({ artifact: { meeting: { title: "Intro call" } } }))).toBe("Intro call");
  });

  it("falls back to type + date when there is no title", () => {
    expect(
      versionLabel(row({ artifact: { meeting: { meeting_type: "discovery", date: "2026-05-13" } } })),
    ).toBe("Discovery — 2026-05-13");
  });

  it("degrades gracefully with no meeting block", () => {
    expect(versionLabel(row({ artifact: {} }))).toBe("Version");
  });
});
