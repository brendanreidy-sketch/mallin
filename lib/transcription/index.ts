import { deepgramProvider } from "./deepgram";
import { whisperProvider } from "./whisper";
import type { TranscriptionProvider, TranscriptionResult } from "./types";

export { TranscriptionError } from "./types";
export type { TranscriptionProvider, TranscriptionResult } from "./types";

const PROVIDERS: Record<string, TranscriptionProvider> = {
  deepgram: deepgramProvider,
  whisper: whisperProvider,
};

/**
 * Resolve the active transcription provider from env. Default: deepgram.
 * Swap to a self-hosted model by setting TRANSCRIPTION_PROVIDER=whisper
 * (+ WHISPER_ENDPOINT) — no code change, no app change. Unknown values fall
 * back to the default rather than breaking the loop.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  const id = (process.env.TRANSCRIPTION_PROVIDER || "deepgram").toLowerCase();
  return PROVIDERS[id] ?? deepgramProvider;
}

/** Transcribe audio with the active provider. */
export async function transcribeAudio(
  audio: Buffer,
  contentType: string,
): Promise<TranscriptionResult> {
  return getTranscriptionProvider().transcribe(audio, contentType);
}
