import type { Metadata } from "next";
import TryForm from "./TryForm";

export const metadata: Metadata = {
  title: "Mallín — Try one call, free",
  description:
    "Tell us who you're meeting. Mallín researches the account and the people and hands you a real pre-call brief in minutes — free preview, no transcript needed.",
};

export const dynamic = "force-dynamic";

const INK = "#1a2230";
const INK2 = "#3b4658";
const BLUE = "#4a7186";

export default function TryPage() {
  return (
    <main
      style={{
        minHeight: "100svh",
        background: "#f4f1ea",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "64px 24px 96px",
        color: INK,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: BLUE,
            margin: 0,
          }}
        >
          —  Try one call, free
        </p>
        <h1
          style={{
            fontSize: "clamp(30px, 5vw, 44px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.04,
            margin: "16px 0 14px",
          }}
        >
          Who are you meeting? <span style={{ color: BLUE }}>Get the brief.</span>
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: INK2, margin: "0 0 8px", maxWidth: 600 }}>
          Tell us the company and what you sell. Mallín researches the account
          and the people in the room, then hands you a pre-call brief — the
          decisive risk, the opening, who to win. Free preview, no transcript;
          create a free account to see the full brief.
        </p>
        <TryForm />
      </div>
    </main>
  );
}
