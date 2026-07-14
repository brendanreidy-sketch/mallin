/**
 * MallinMark — the brand icon. Extracted from app/page.tsx so it's
 * reusable across surfaces (landing, sign-in, prep header, future).
 *
 * Two horizontal currents:
 *   - the visible surface with three vegetation tufts (the lush
 *     mallín cover)
 *   - the underground flow beneath (in stream-blue) that extends
 *     slightly past the surface — the water that sustains everything
 *     visible above.
 *
 * Caller controls size via `size` prop; default 22px matches the
 * wordmark on the landing page.
 */

interface MallinMarkProps {
  size?: number;
  /** Color of the surface line + tufts. Default is the dark slate
   *  used on light backgrounds; on dark surfaces pass "#e8e8ed". */
  surfaceColor?: string;
  /** Color of the underground stream. Default is the slate-blue
   *  accent. On dark surfaces pass "#88b8d0" for slightly more punch. */
  streamColor?: string;
  className?: string;
}

export default function MallinMark({
  size = 22,
  surfaceColor = "#1a2230",
  streamColor = "#4a7186",
  className,
}: MallinMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="Mallin"
    >
      {/* Surface wave — the visible mallín cover. Stroke bumped to 5
          so at 22px display size the path is ~1.7px on screen — thick
          enough to read as a deliberate mark, not a hairline. */}
      <path
        d="M 4 28 Q 18 20, 32 28 T 60 28"
        stroke={surfaceColor}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Three vegetation tufts — taller + thicker so they read at
          small sizes. Center tuft is the tallest (visual anchor). */}
      <line x1="20" y1="24" x2="20" y2="14" stroke={surfaceColor} strokeWidth="3" strokeLinecap="round" />
      <line x1="32" y1="24" x2="32" y2="8"  stroke={surfaceColor} strokeWidth="3" strokeLinecap="round" />
      <line x1="44" y1="24" x2="44" y2="14" stroke={surfaceColor} strokeWidth="3" strokeLinecap="round" />
      {/* Underground stream — extends slightly past the surface
          on both sides to suggest flow continuing beyond what's
          visible. Stroke matched to surface. */}
      <path
        d="M 2 46 Q 17 38, 32 46 T 62 46"
        stroke={streamColor}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
