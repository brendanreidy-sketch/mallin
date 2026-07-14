"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls /api/intake/status?dealId every few seconds. When the brief is ready,
 * forwards to /prep. Shows reassuring, time-aware copy (the pipeline is slow).
 */
const POLL_MS = 4000;
const STEPS = [
  "Reading the transcript…",
  "Researching the account and stakeholders…",
  "Weighing the evidence…",
  "Writing your brief…",
];

export default function BuildingPoller({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Tick a friendly elapsed counter (drives the step copy).
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll readiness.
  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/intake/status?dealId=${encodeURIComponent(dealId)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { ready?: boolean; error?: string };
        if (!res.ok) throw new Error(data.error || "status check failed");
        if (data.ready && !stop) {
          router.replace(`/prep?dealId=${dealId}`);
          return;
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
      if (!stop) setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [dealId, router]);

  const step = STEPS[Math.min(Math.floor(elapsed / 18), STEPS.length - 1)];
  const slow = elapsed > 150;

  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.spinner} />
        <h1 style={S.h1}>Building your brief</h1>
        <p style={S.step}>{error ? "Still working…" : step}</p>
        <p style={S.sub}>
          {slow
            ? "This one's taking a little longer than usual — hang tight, it's still running."
            : "This usually takes a minute or two. You can leave this open."}
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f1ea",
    color: "#1a2230",
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
  },
  card: { textAlign: "center", maxWidth: 420 },
  spinner: {
    width: 36,
    height: 36,
    margin: "0 auto 22px",
    border: "3px solid #d6cfbe",
    borderTopColor: "#4a7186",
    borderRadius: "50%",
    animation: "spin 0.9s linear infinite",
  },
  h1: { fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" },
  step: { fontSize: 15, fontWeight: 600, color: "#4a7186", margin: "0 0 10px" },
  sub: { fontSize: 13.5, color: "#6b7689", lineHeight: 1.55, margin: 0 },
};
