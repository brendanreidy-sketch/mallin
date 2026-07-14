import {
  TranscriptionError,
  type TranscriptionProvider,
  type TranscriptionResult,
} from "./types";

/**
 * Self-hosted Whisper provider — the "own it without building it" path.
 *
 * Point WHISPER_ENDPOINT at your own GPU running an OpenAI-compatible
 * `/v1/audio/transcriptions` endpoint (e.g. faster-whisper-server, whisper.cpp
 * server, or vLLM). Audio never leaves your infrastructure and there's no
 * per-minute vendor fee. You didn't build an ASR engine — you deployed an
 * open model behind the same seam Deepgram sits in.
 *
 * Activate by setting TRANSCRIPTION_PROVIDER=whisper (+ WHISPER_ENDPOINT).
 */
export const whisperProvider: TranscriptionProvider = {
  id: "whisper",

  isConfigured() {
    return Boolean(process.env.WHISPER_ENDPOINT);
  },

  async transcribe(audio: Buffer, contentType: string): Promise<TranscriptionResult> {
    const endpoint = process.env.WHISPER_ENDPOINT;
    if (!endpoint) {
      throw new TranscriptionError(
        "Transcription provider not configured.",
        "not_configured",
        501,
      );
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(audio)], { type: contentType }),
      "call-audio",
    );
    form.append("model", process.env.WHISPER_MODEL || "whisper-1");
    form.append("response_format", "text");

    const headers: Record<string, string> = {};
    if (process.env.WHISPER_API_KEY) {
      headers.Authorization = `Bearer ${process.env.WHISPER_API_KEY}`;
    }

    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/v1/audio/transcriptions`,
      { method: "POST", headers, body: form },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new TranscriptionError(
        "Transcription failed.",
        "transcribe_failed",
        502,
        text.slice(0, 300),
      );
    }
    return { transcript: text.trim() };
  },
};
