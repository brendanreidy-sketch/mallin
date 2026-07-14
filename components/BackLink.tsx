import Link from "next/link";

/**
 * In-app back navigation — a consistent "← Back" affordance so users move
 * within Mallín instead of reaching for the browser's back button.
 *
 * Hook-free and theme-agnostic: the color is a CSS variable (the themed
 * `--ck-ink-3` used on the cockpit/deal views) with a cream-brand fallback,
 * so the same component drops cleanly into both themed (deal/prep) and
 * plain (new-deal, setup) surfaces. This is the standard back control —
 * place it at the top of every sub-view as we build them out.
 */
export function BackLink({
  href = "/cockpit",
  label = "All deals",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 16,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.01em",
        color: "var(--ck-ink-3, #6b7689)",
        textDecoration: "none",
        width: "fit-content",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>
        ←
      </span>
      {label}
    </Link>
  );
}
