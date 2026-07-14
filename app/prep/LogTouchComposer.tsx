"use client";

/**
 * "Log a touch" composer — client-side form for capturing off-platform
 * conversations (phone calls, hallway chats, texts).
 *
 *   - Top-bar button "+ Log touch" opens a tray
 *   - Tray fields: stakeholder dropdown, when, body
 *   - VOICE INPUT (NEW): record button transcribes via Whisper and fills
 *     the body field. Reps can record 30s walking to their car instead
 *     of typing. Text input still works for desk moments.
 *   - On submit: POST /api/log-touch, then router.refresh() so the
 *     server component re-reads the substrate
 *
 * Voice transcription requires OPENAI_API_KEY on the server; without it
 * the API returns 503 and the voice button shows a soft error.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import s from "./logTouch.module.css";

export interface ComposerStakeholder {
  id: string;
  name: string;
  title?: string;
  email?: string;
}

export interface LogTouchComposerProps {
  filename: string;
  stakeholders: ComposerStakeholder[];
}

type RecordingState = "idle" | "recording" | "transcribing";

export default function LogTouchComposer({
  filename,
  stakeholders,
}: LogTouchComposerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stakeholderId, setStakeholderId] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup any running recording when unmounting / closing.
  useEffect(() => {
    return () => {
      stopRecordingTimer();
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  function stopRecordingTimer() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }

  function close() {
    if (submitting || recordingState !== "idle") return;
    setOpen(false);
    setError(null);
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("microphone not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick the first MIME type the browser supports (Chrome→webm, Safari→mp4).
      const mime = pickMimeType();
      const mr = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        // Stop the mic stream tracks (release the green dot in the browser).
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        await transcribeAudio(audioBlob);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecordingState("recording");
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((n) => n + 1);
      }, 1000);
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e.name === "NotAllowedError") {
        setError("microphone permission denied");
      } else {
        setError(`recording failed: ${e.message}`);
      }
    }
  }

  function stopRecording() {
    stopRecordingTimer();
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      // onstop handler will fire transcribe.
      mr.stop();
    }
    setRecordingState("transcribing");
  }

  async function transcribeAudio(audioBlob: Blob) {
    if (audioBlob.size === 0) {
      setError("no audio captured");
      setRecordingState("idle");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("audio", audioBlob, "voice-touch.webm");
      const resp = await fetch("/api/transcribe-voice", {
        method: "POST",
        body: fd,
      });
      const data = (await resp.json()) as {
        ok: boolean;
        text?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setError(data.error ?? `transcription failed (${resp.status})`);
        setRecordingState("idle");
        return;
      }
      // Append to body — preserves whatever the rep already typed.
      const transcript = data.text ?? "";
      setBody((existing) => {
        const sep = existing && !existing.endsWith("\n") ? "\n" : "";
        return (existing + sep + transcript).trim();
      });
      // Auto-suggest stakeholder from transcript if rep hasn't picked one.
      // Only suggest — never override an existing manual pick.
      if (!stakeholderId) {
        const suggested = suggestStakeholder(transcript, stakeholders);
        if (suggested) setStakeholderId(suggested);
      }
      setRecordingState("idle");
    } catch (err) {
      setError(`transcription error: ${(err as Error).message}`);
      setRecordingState("idle");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError("Type or speak something — what was said?");
      return;
    }
    setSubmitting(true);
    setError(null);
    const sh = stakeholders.find((x) => x.id === stakeholderId);
    try {
      const resp = await fetch("/api/log-touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: filename,
          stakeholder_id: stakeholderId || null,
          stakeholder_name: sh?.name ?? null,
          stakeholder_email: sh?.email ?? null,
          occurred_at: occurredAt || null,
          body: body.trim(),
        }),
      });
      const data = (await resp.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setError(data.error ?? `failed (${resp.status})`);
        setSubmitting(false);
        return;
      }
      setBody("");
      setStakeholderId("");
      setOccurredAt("");
      setOpen(false);
      setSubmitting(false);
      // Append savedTouch=1 so the prep page knows this is a fresh-save
      // render. The page infers regen state (in-flight / succeeded /
      // failed) from data — touch.created_at vs artifact.generated_at —
      // so we don't need to pass regen status through the URL. This also
      // means the URL flag survives auto-refresh: while regen is in
      // flight, savedTouch=1 stays put, and as soon as the new artifact
      // lands, the next refresh flips the banner from progress to
      // success.
      const url = new URL(window.location.href);
      url.searchParams.set("savedTouch", "1");
      // We can't router.replace AND router.refresh cleanly together;
      // window.location is the simplest way to refresh with the flag.
      window.location.href = url.toString();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const formDisabled = submitting || recordingState !== "idle";

  return (
    <>
      <button type="button" className={s.trigger} onClick={() => setOpen(true)}>
        + Log touch
      </button>

      {open && (
        <div className={s.scrim} onClick={close} role="presentation">
          <div
            className={s.tray}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Log an off-platform touch"
          >
            <div className={s.head}>
              <div className={s.title}>Log a touch</div>
              <div className={s.hint}>
                Phone calls, texts, hallway chats — anything Gong didn&apos;t
                catch.
              </div>
              <button
                type="button"
                className={s.close}
                onClick={close}
                aria-label="Close"
                disabled={recordingState !== "idle"}
              >
                ✕
              </button>
            </div>

            <form onSubmit={submit} className={s.form}>
              <div className={s.row}>
                <label className={s.label}>With</label>
                <select
                  className={s.select}
                  value={stakeholderId}
                  onChange={(e) => setStakeholderId(e.target.value)}
                  disabled={formDisabled}
                >
                  <option value="">— pick stakeholder (optional) —</option>
                  {stakeholders.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.name}
                      {sh.title ? ` · ${sh.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className={s.row}>
                <label className={s.label}>When</label>
                <input
                  className={s.input}
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  disabled={formDisabled}
                  placeholder="leave blank for now"
                />
              </div>

              <div className={s.row}>
                <div className={s.bodyHead}>
                  <label className={s.label}>What was said</label>
                  <VoiceButton
                    state={recordingState}
                    seconds={recordSeconds}
                    onStart={startRecording}
                    onStop={stopRecording}
                  />
                </div>
                <textarea
                  className={s.textarea}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    recordingState === "recording"
                      ? "Listening — your speech will appear here when you stop."
                      : recordingState === "transcribing"
                        ? "Transcribing…"
                        : 'Speak or type. e.g. "Leo on the phone — Nadia is the real holdout. PE board reviews next Tuesday."'
                  }
                  rows={5}
                  maxLength={2000}
                  disabled={submitting || recordingState !== "idle"}
                />
                <div className={s.counter}>{body.length}/2000</div>
              </div>

              {error && <div className={s.error}>{error}</div>}

              <div className={s.actions}>
                <button
                  type="button"
                  className={s.cancel}
                  onClick={close}
                  disabled={formDisabled}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={s.submit}
                  disabled={formDisabled || !body.trim()}
                >
                  {submitting ? "Saving…" : "Save touch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Voice button ───────────────────────────────────────────────────────────

function VoiceButton({
  state,
  seconds,
  onStart,
  onStop,
}: {
  state: RecordingState;
  seconds: number;
  onStart: () => void;
  onStop: () => void;
}) {
  if (state === "recording") {
    return (
      <button
        type="button"
        className={`${s.voiceBtn} ${s.voiceBtnRecording}`}
        onClick={onStop}
        aria-label="Stop recording"
      >
        <span className={s.recordDot} />
        <span className={s.recordTimer}>{formatSeconds(seconds)}</span>
        <span>Stop</span>
      </button>
    );
  }
  if (state === "transcribing") {
    return (
      <button
        type="button"
        className={`${s.voiceBtn} ${s.voiceBtnTranscribing}`}
        disabled
      >
        <span className={s.transcribeDot} />
        <span>Transcribing…</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={s.voiceBtn}
      onClick={onStart}
      aria-label="Start recording"
    >
      <span className={s.micIcon}>🎤</span>
      <span>Record</span>
    </button>
  );
}

function formatSeconds(n: number): string {
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Browser MediaRecorder mime negotiation — pick first supported.
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// ── Auto-detect stakeholder from transcript ─────────────────────────────────
//
// Scans the transcript for names matching anyone in the deal's stakeholder
// list. Scoring (highest match wins):
//   3 = full-name substring match ("Leo Le")
//   2 = first-name word match ("Leo")
//   1 = last-name word match ("Le")
//
// Names shorter than 3 characters are skipped to avoid false positives
// (e.g. matching "Le" inside "Leo" or generic words). Returns the
// stakeholder id of the best match, or null if no match.
//
// Phonetic mismatches (Whisper hearing "Pay-man" for "Peiman") are NOT
// handled here — if it becomes a problem, swap regex for Levenshtein
// distance or pass through Claude for disambiguation.
function suggestStakeholder(
  transcript: string,
  stakeholders: ComposerStakeholder[],
): string | null {
  if (!transcript || stakeholders.length === 0) return null;
  const t = transcript.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const sh of stakeholders) {
    const full = sh.name.toLowerCase().trim();
    if (!full) continue;
    const parts = full.split(/\s+/).filter(Boolean);
    const first = parts[0] ?? "";
    const last = parts[parts.length - 1] ?? "";
    let score = 0;
    if (full.length >= 3 && t.includes(full)) {
      score = 3;
    } else if (first.length >= 3 && wordInText(first, t)) {
      score = 2;
    } else if (last.length >= 3 && last !== first && wordInText(last, t)) {
      score = 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = sh.id;
    }
  }
  return bestId;
}

function wordInText(word: string, text: string): boolean {
  // Case-insensitive whole-word match. Escapes regex metacharacters in the
  // word in case a stakeholder name contains punctuation.
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}
