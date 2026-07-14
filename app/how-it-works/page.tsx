/**
 * /how-it-works — public marketing page that walks through one real
 * sanitized deal end-to-end. Renders the content from
 * docs/landing-concepts/24-real-deal-walkthrough.html verbatim.
 *
 * The HTML source stays in docs/ so it's still previewable as a
 * standalone file. This page reads it at build time (server component)
 * and inlines the styles + body so the marketing copy is the single
 * source of truth — edit the HTML, redeploy, page updates.
 *
 * Video hero is intentionally removed for now — will land in a
 * follow-up once the cockpit auth render mismatch is resolved and we
 * have a clean recording at public/assets/cockpit-full-tour.webm.
 */
import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const metadata: Metadata = {
  title: "Mallín — how it works (one real deal, end to end)",
  description:
    "Walk through one sanitized deal end-to-end: the call, the read, the deck, the next move. See what Mallín reads, what it changes, and what it gives back.",
};

const HTML_PATH = resolve(
  process.cwd(),
  "docs/landing-concepts/24-real-deal-walkthrough.html",
);

function extractStylesAndBody(html: string): { styles: string; body: string } {
  const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? [];
  const styles = styleMatches
    .map((s) => s.replace(/<\/?style[^>]*>/g, ""))
    .join("\n");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  const body = bodyMatch ? bodyMatch[1] : html;
  return { styles, body };
}

export default function HowItWorksPage() {
  const html = readFileSync(HTML_PATH, "utf-8");
  const { styles, body } = extractStylesAndBody(html);

  return (
    <>
      {/* Walkthrough's own stylesheet — scoped via its body class selectors */}
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      {/* The existing real-deal walkthrough content */}
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
