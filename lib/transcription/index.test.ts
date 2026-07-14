/**
 * The vendor seam: proves transcription is swappable by config alone, so
 * Mallín is never locked to one provider. This is the guarantee the
 * abstraction exists to make.
 */
import { afterEach, describe, expect, it } from "vitest";

import { getTranscriptionProvider } from "./index";

const original = process.env.TRANSCRIPTION_PROVIDER;
afterEach(() => {
  if (original === undefined) delete process.env.TRANSCRIPTION_PROVIDER;
  else process.env.TRANSCRIPTION_PROVIDER = original;
});

describe("getTranscriptionProvider — the swappable vendor seam", () => {
  it("defaults to Deepgram when nothing is configured", () => {
    delete process.env.TRANSCRIPTION_PROVIDER;
    expect(getTranscriptionProvider().id).toBe("deepgram");
  });

  it("swaps to self-hosted Whisper via one env var — no code change", () => {
    process.env.TRANSCRIPTION_PROVIDER = "whisper";
    expect(getTranscriptionProvider().id).toBe("whisper");
  });

  it("is case-insensitive", () => {
    process.env.TRANSCRIPTION_PROVIDER = "Whisper";
    expect(getTranscriptionProvider().id).toBe("whisper");
  });

  it("falls back to the default on an unknown provider (never breaks the loop)", () => {
    process.env.TRANSCRIPTION_PROVIDER = "nonsense";
    expect(getTranscriptionProvider().id).toBe("deepgram");
  });
});
