import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getTranscriptionProvider,
  transcribeAudio,
  TranscriptionError,
} from "@/lib/transcription";

/**
 * POST /api/intake/transcribe — turn recorded/uploaded call audio into text.
 *
 * Closes the capture loop: the rep records the call in the browser (or uploads
 * an audio file), this transcribes it, and the text drops into the "Add the
 * call" box for them to verify + submit. Batch (whole-file), not streaming —
 * the use case is "after the call," so a single request is enough.
 *
 * Provider-agnostic: the actual speech-to-text runs behind `lib/transcription`
 * (Deepgram by default, a self-hosted Whisper via TRANSCRIPTION_PROVIDER=whisper).
 * This route never names a vendor. Returns 501 (plain message) when no provider
 * is configured, so the feature degrades honestly instead of erroring silently.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const provider = getTranscriptionProvider();
  if (!provider.isConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: `Call recording isn't switched on yet (transcription provider "${provider.id}" is unconfigured).`,
      },
      { status: 501 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "no_audio", message: "No audio received." },
      { status: 400 },
    );
  }

  const contentType = file.type || "audio/webm";
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json(
      { error: "empty_audio", message: "That recording was empty." },
      { status: 400 },
    );
  }

  try {
    const { transcript } = await transcribeAudio(buf, contentType);
    if (!transcript) {
      return NextResponse.json(
        { error: "no_speech", message: "Couldn't make out any speech in that audio." },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: true, transcript });
  } catch (err) {
    if (err instanceof TranscriptionError) {
      return NextResponse.json(
        { error: err.code, message: err.message, detail: err.detail },
        { status: err.status },
      );
    }
    console.error("[transcribe] failed:", err);
    return NextResponse.json(
      { error: "transcribe_failed", message: "Transcription failed — try again." },
      { status: 502 },
    );
  }
}
