/**
 * ThemeConfig — the bounded set of per-user visual customizations.
 *
 * Critical: this type defines the entire surface a user can customize.
 * The shape itself is the integrity-preserving boundary — there is no
 * field for "hide sources", "remove approval gates", or "strip
 * evidence citations" because those are structural elements, not
 * cosmetic ones. The wrong move literally cannot be expressed in this
 * shape, which means the wrong move literally cannot be requested
 * through the prompt-driven theme endpoint.
 *
 * Architecture: theme is applied via CSS variables on the document
 * root. Components don't need to know about ThemeConfig — they read
 * CSS vars (--accent-h, --density-scale, etc.) and the theme layer
 * sets them. That decoupling is what makes the cognition contract
 * stable across themes.
 *
 * See memory: integrity_preserving_friction.md, reserved_not_forgotten.md.
 */

export interface ThemeConfig {
  /** Background / surface palette. Default: dark (matches the
   *  monochrome+one-accent design language). */
  mode: "dark" | "light";

  /** Information density. Controls padding, line-height, gap sizes
   *  globally via CSS variable scale factors. */
  density: "compact" | "comfortable" | "spacious";

  /** Accent color in HSL — bounds: hue 0-360, sat 0-100, light 30-70.
   *  Default is the existing slate-blue: hsl(204, 40%, 67%).
   *  Lightness bounded to 30-70 to prevent accent from collapsing
   *  into background or foreground (and becoming unreadable). */
  accent: {
    hue: number; // 0-360
    saturation: number; // 0-100
    lightness: number; // 30-70
  };

  /** Type family selection. Three pre-validated families that all
   *  meet the operator-voice typography rule (no marketing-display
   *  fonts, no novelty serifs). */
  fontFamily: "system" | "serif" | "mono";

  /** Border radius scale. */
  borderRadius: "sharp" | "subtle" | "rounded" | "pill";

  /** Default expand/collapse state for major sections on initial
   *  load. Does NOT remove any section — only changes whether it
   *  starts open. Affects "what to focus on first" without dismantling
   *  the artifact structure. */
  sections: {
    recentEventsDefaultExpanded: boolean;
    stakeholdersDefaultExpanded: boolean;
    coachDefaultExpanded: boolean;
  };
}

/** The current production design. Cream (light) brand surface to match
 *  the marketing landing, slate-blue accent, comfortable density. This is
 *  what every user sees before they customize anything; dark stays one
 *  toggle away (ThemeConfig.mode: "dark"). */
export const DEFAULT_THEME: ThemeConfig = {
  mode: "light",
  density: "comfortable",
  accent: { hue: 204, saturation: 40, lightness: 67 }, // slate-blue
  fontFamily: "system",
  borderRadius: "subtle",
  sections: {
    recentEventsDefaultExpanded: true,
    stakeholdersDefaultExpanded: true,
    coachDefaultExpanded: false,
  },
};

/** Response shape from /api/theme/generate. Includes the new theme
 *  plus transparency about what the user asked for that we couldn't
 *  honor. */
export interface ThemeGenerationResponse {
  /** The new theme to apply. */
  theme: ThemeConfig;
  /** One-sentence summary of what changed (rep-facing). */
  summary: string;
  /** Things the user asked for that aren't expressible in the bounded
   *  schema. Each entry explains WHY it can't be customized (e.g.
   *  "Sources are part of the cognition contract — they aren't
   *  cosmetic, so they can't be themed away"). This is the
   *  fail-loudly behavior at the rep-facing layer: rejected requests
   *  are surfaced, not silently dropped. */
  unmet_requests: string[];
}

/** Bounds for runtime validation after the model returns JSON.
 *  Defense-in-depth: the schema enforces these on the Anthropic side,
 *  and we re-check on receipt to catch any edge case where the model
 *  returned something marginally out-of-range. */
export const THEME_BOUNDS = {
  hue: { min: 0, max: 360 },
  saturation: { min: 0, max: 100 },
  // Lightness is intentionally clamped — accent at L<30 or L>70
  // becomes unreadable against dark/light backgrounds respectively.
  lightness: { min: 30, max: 70 },
} as const;

/** Validates a parsed JSON object against the ThemeConfig contract.
 *  Returns the validated config or null. Strict — any deviation
 *  rejects the whole config. */
export function validateThemeConfig(input: unknown): ThemeConfig | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;

  if (i.mode !== "dark" && i.mode !== "light") return null;
  if (
    i.density !== "compact" &&
    i.density !== "comfortable" &&
    i.density !== "spacious"
  ) {
    return null;
  }
  if (
    i.fontFamily !== "system" &&
    i.fontFamily !== "serif" &&
    i.fontFamily !== "mono"
  ) {
    return null;
  }
  if (
    i.borderRadius !== "sharp" &&
    i.borderRadius !== "subtle" &&
    i.borderRadius !== "rounded" &&
    i.borderRadius !== "pill"
  ) {
    return null;
  }

  const accent = i.accent as Record<string, unknown> | null;
  if (!accent || typeof accent !== "object") return null;
  const h = accent.hue, s = accent.saturation, l = accent.lightness;
  if (
    typeof h !== "number" ||
    h < THEME_BOUNDS.hue.min ||
    h > THEME_BOUNDS.hue.max
  ) {
    return null;
  }
  if (
    typeof s !== "number" ||
    s < THEME_BOUNDS.saturation.min ||
    s > THEME_BOUNDS.saturation.max
  ) {
    return null;
  }
  if (
    typeof l !== "number" ||
    l < THEME_BOUNDS.lightness.min ||
    l > THEME_BOUNDS.lightness.max
  ) {
    return null;
  }

  const sections = i.sections as Record<string, unknown> | null;
  if (!sections || typeof sections !== "object") return null;
  const re = sections.recentEventsDefaultExpanded;
  const sh = sections.stakeholdersDefaultExpanded;
  const co = sections.coachDefaultExpanded;
  if (
    typeof re !== "boolean" ||
    typeof sh !== "boolean" ||
    typeof co !== "boolean"
  ) {
    return null;
  }

  return {
    mode: i.mode,
    density: i.density,
    fontFamily: i.fontFamily,
    borderRadius: i.borderRadius,
    accent: { hue: h, saturation: s, lightness: l },
    sections: {
      recentEventsDefaultExpanded: re,
      stakeholdersDefaultExpanded: sh,
      coachDefaultExpanded: co,
    },
  };
}
