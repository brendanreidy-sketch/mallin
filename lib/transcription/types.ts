/**
 * Transcription provider contract. Speech-to-text is a commodity *input* to
 * Mallín, not the product — so it sits behind this thin interface and any
 * provider (Deepgram today, a self-hosted Whisper tomorrow) is a drop-in swap
 * with zero app changes. This is how we get vendor independence WITHOUT
 * building an ASR engine: own the seam, rent (or self-host) the model.
 */

export interface TranscriptionResult {
  /** The transcript text. Empty string if no speech was detected. */
  transcript: string;
}

export interface TranscriptionProvider {
  /** Stable id, for config + logging. */
  readonly id: string;
  /** True when this provider has what it needs to run (API key / endpoint). */
  isConfigured(): boolean;
  /** Transcribe audio bytes. Throws TranscriptionError on failure. */
  transcribe(audio: Buffer, contentType: string): Promise<TranscriptionResult>;
}

/** Carries an HTTP status + machine code so the route can map provider
 *  failures to clean responses without knowing which provider ran. */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}
