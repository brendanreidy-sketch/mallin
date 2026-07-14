/**
 * ============================================================================
 *  POST /api/transcribe-voice
 * ============================================================================
 *
 *  Accepts an audio file (multipart/form-data, field name "audio") and
 *  returns the transcribed text via OpenAI's Whisper API.
 *
 *  This is the lower-friction input path for the off-platform-touch loop.
 *  Reps record a 30-second voice memo (walking to their car after a phone
 *  call, etc.); Whisper transcribes server-side; the result is returned to
 *  the client which uses it to pre-fill the touch composer for review +
 *  edit + save via /api/log-touch.
 *
 *  This route does NOT persist anything. Transcription is separated from
 *  persistence so the rep can edit before committing.
 *
 *  Request:
 *    POST /api/transcribe-voice
 *    Content-Type: multipart/form-data
 *    Body: { audio: <File>, filename?: <string> }
 *
 *  Response (200):
 *    { ok: true, text: "<transcript>", duration_ms?: number }
 *
 *  Response (400/500):
 *    { ok: false, error: "<reason>" }
 *
 *  Audio format support (per Whisper API):
 *    mp3, mp4, mpeg, mpga, m4a, wav, webm
 *    Max file size: 25 MB
 *
 *  Browser MediaRecorder defaults:
 *    Chrome → audio/webm (Opus codec)
 *    Safari → audio/mp4 (AAC codec)
 *  Both work with Whisper without conversion.
 *
 *  Cost: $0.006 per minute. A 30-second touch = $0.0003.
 *
 *  NOTE: This route requires OPENAI_API_KEY to be set. Without it we
 *  return a clear 503 so the frontend can hide the voice button gracefully.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-1";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB Whisper limit

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "voice transcription not configured — set OPENAI_API_KEY in .env.local",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "expected multipart/form-data" },
      { status: 400 },
    );
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json(
      { ok: false, error: "missing field 'audio' (Blob)" },
      { status: 400 },
    );
  }
  if (audio.size === 0) {
    return NextResponse.json(
      { ok: false, error: "audio file is empty" },
      { status: 400 },
    );
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `audio exceeds ${MAX_BYTES / 1024 / 1024}MB Whisper limit`,
      },
      { status: 400 },
    );
  }

  // Whisper accepts the original Blob — no transcoding needed for webm/mp4.
  const filenameHint =
    (typeof formData.get("filename") === "string"
      ? (formData.get("filename") as string)
      : null) ??
    inferFilenameFromMime(audio.type) ??
    "audio.webm";

  const upstream = new FormData();
  // Re-wrap as a File so the upstream sees a proper filename + content-type.
  upstream.append(
    "file",
    new File([audio], filenameHint, { type: audio.type || "audio/webm" }),
  );
  upstream.append("model", WHISPER_MODEL);
  // Optional: bias toward English. Comment out to auto-detect.
  upstream.append("language", "en");
  // response_format=json gives us {text}; verbose_json adds segments + duration.
  upstream.append("response_format", "verbose_json");

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(WHISPER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstream,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `transport error: ${(err as Error).message}`,
      },
      { status: 502 },
    );
  }
  const latency_ms = Date.now() - t0;

  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.text()).slice(0, 400);
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      {
        ok: false,
        error: `Whisper API ${resp.status}${detail ? `: ${detail}` : ""}`,
      },
      { status: 502 },
    );
  }

  let data: { text?: string; duration?: number };
  try {
    data = (await resp.json()) as { text?: string; duration?: number };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Whisper response was not JSON" },
      { status: 502 },
    );
  }

  const text = (data.text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "transcription returned empty — speak more clearly or check microphone",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    text,
    duration_seconds: data.duration ?? null,
    latency_ms,
  });
}

function inferFilenameFromMime(mime: string): string | null {
  if (!mime) return null;
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("mp4")) return "audio.mp4";
  if (mime.includes("m4a")) return "audio.m4a";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("ogg")) return "audio.ogg";
  return null;
}
