"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

/**
 * Completes the active-organization handoff after server-side provisioning,
 * then (for a direct signup that hasn't told us their tenure) asks one quick
 * question — "how long in sales?" — before forwarding into the app.
 *
 * A Clerk org created on the server is not automatically the session's ACTIVE
 * org — auth().orgId stays null until the client sets it. setActive fixes that;
 * without it the user lands in /cockpit with no orgId and bounces to sign-in.
 *
 * The tenure step is OPTIONAL and only shows when askExperience is true (we
 * don't already have it from a /try import). Skipping never blocks entry.
 */
const BANDS: { value: string; label: string }[] = [
  { value: "new", label: "New to sales — under 1 year" },
  { value: "1-3", label: "1–3 years" },
  { value: "3-7", label: "3–7 years" },
  { value: "7-15", label: "7–15 years" },
  { value: "15+", label: "15+ years" },
];

export default function ActivateAndContinue({
  orgId,
  next,
  createdOrg = false,
  askExperience = false,
}: {
  orgId: string;
  next: string;
  createdOrg?: boolean;
  askExperience?: boolean;
}) {
  const { setActive } = useClerk();
  const router = useRouter();
  const [phase, setPhase] = useState<"activating" | "asking" | "error">("activating");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!setActive) return;
        await setActive({ organization: orgId });
        if (createdOrg) {
          try {
            track("signup_completed");
          } catch {
            /* analytics best-effort */
          }
        }
        if (cancelled) return;
        // Ask the tenure question, or forward straight in.
        // Hard navigation (not router.replace): a soft nav reuses a cached RSC
        // payload / stale auth, so /cockpit can render before the just-set
        // active org is visible server-side and bounce back here — an infinite
        // /welcome ⇄ /cockpit loop. A full load forces a fresh request that
        // carries the updated session.
        if (askExperience) setPhase("asking");
        else window.location.assign(next);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || "Activation failed");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, next, setActive, router, createdOrg, askExperience]);

  async function chooseExperience(band: string | null) {
    setSaving(true);
    if (band) {
      try {
        await fetch("/api/onboarding/experience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ salesExperience: band }),
        });
      } catch {
        /* best-effort — never block entry on the save */
      }
    }
    // Hard navigation for the same reason as the activation path above.
    window.location.assign(next);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f1ea",
        color: "#3b4658",
        fontFamily:
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%" }}>
        {phase === "asking" ? (
          <>
            <h1
              style={{
                margin: "0 0 6px",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#1a2230",
              }}
            >
              One quick thing.
            </h1>
            <p style={{ margin: "0 0 22px", fontSize: 14.5, color: "#6b7689", lineHeight: 1.5 }}>
              How long have you been in sales? Mallín uses this to pitch its
              coaching at the right level — no fundamentals for a veteran, more
              of the &ldquo;why&rdquo; for a newer rep.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {BANDS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  disabled={saving}
                  onClick={() => chooseExperience(b.value)}
                  style={{
                    padding: "13px 16px",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#1a2230",
                    background: "#ffffff",
                    border: "1px solid #e3dccc",
                    borderRadius: 10,
                    cursor: saving ? "default" : "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => chooseExperience(null)}
              style={{
                marginTop: 16,
                background: "none",
                border: "none",
                color: "#6b7689",
                fontSize: 13.5,
                cursor: saving ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Skip for now
            </button>
          </>
        ) : phase === "error" ? (
          <>
            <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#1a2230" }}>
              Something went wrong finishing setup.
            </h1>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6b7689" }}>{error}</p>
            <button
              onClick={() => router.refresh()}
              style={{
                padding: "10px 18px",
                background: "#1a2230",
                color: "#f4f1ea",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <h1
              style={{
                margin: "0 0 8px",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#1a2230",
              }}
            >
              Setting up your workspace…
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7689" }}>
              One moment — taking you into Mallín.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
