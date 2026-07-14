"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * On-access refresh trigger. Renders nothing. Fires once when a deal is
 * opened; the endpoint is the authority — it re-checks staleness (and skips
 * demo tenants / already-fresh artifacts) so the costed web-search only runs
 * when a deal is genuinely stale AND someone's actually in it. This is what
 * lets us drop the nightly "refresh every deal" cron: held data shows
 * instantly, and we only pay to freshen what's being used.
 */
export default function IntelAutoRefresh({ dealId }: { dealId: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/intel/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId }),
        });
        const data = (await res.json().catch(() => ({}))) as { refreshed?: boolean };
        // Only re-pull when it actually wrote a fresher artifact.
        if (!cancelled && data.refreshed) router.refresh();
      } catch {
        // Best-effort — the held data is already on screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, router]);

  return null;
}
