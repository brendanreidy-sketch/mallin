import {
  TranscriptionError,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";

/**
 * Deepgram provider — the hosted default. Batch (whole-file) transcription via
 * the nova-2 model. Needs DEEPGRAM_API_KEY.
 */
export const deepgramProvider: TranscriptionProvider = {
  id: "deepgram",

  isConfigured() {
    return Boolean(process.env.DEEPGRAM_API_KEY);
  },

  async transcribe(audio: Buffer, contentType: string): Promise<TranscriptionResult> {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) {
      throw new TranscriptionError(
        "Transcription provider not configured.",
        "not_configured",
        501,
      );
    }

    const res = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&paragraphs=true",
      {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
        body: new Uint8Array(audio),
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      throw new TranscriptionError(
        data?.err_msg || "Transcription failed.",
        "transcribe_failed",
        502,
        JSON.stringify(data).slice(0, 300),
      );
    }
    const alt = data?.results?.channels?.[0]?.alternatives?.[0];
    const transcript = (alt?.paragraphs?.transcript || alt?.transcript || "").trim();
    return { transcript };
  },
};
