/**
 * JSON Schema for the prompt-driven theme generation endpoint.
 *
 * Passed to Anthropic's Messages API via `output_config.format` so
 * the model's response is structurally constrained to this exact
 * shape. With `additionalProperties: false` at every object level,
 * the model cannot return any field outside the schema — which means
 * structural elements (sources, evidence citations, approval gates,
 * recommendation sequence) cannot be requested through this surface
 * even if the user prompt asks for them.
 *
 * This is integrity-preserving friction at the API contract layer.
 * The schema is the wrong-move-is-impossible bound; runtime
 * validation (validateThemeConfig in types.ts) is defense-in-depth.
 */

export const THEME_GENERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["theme", "summary", "unmet_requests"],
  properties: {
    theme: {
      type: "object",
      additionalProperties: false,
      required: [
        "mode",
        "density",
        "accent",
        "fontFamily",
        "borderRadius",
        "sections",
      ],
      properties: {
        mode: { type: "string", enum: ["dark", "light"] },
        density: {
          type: "string",
          enum: ["compact", "comfortable", "spacious"],
        },
        accent: {
          type: "object",
          additionalProperties: false,
          required: ["hue", "saturation", "lightness"],
          properties: {
            // NOTE: Anthropic's JSON schema validator does not accept
            // `minimum`/`maximum` on integer types. Range bounds are
            // enforced in the system prompt + validateThemeConfig
            // runtime check. Defense-in-depth: route handler clamps
            // lightness defensively after validation.
            hue: {
              type: "integer",
              description: "Hue in degrees, 0-360 (0=red, 30=orange, 120=green, 180=cyan, 220=blue, 270=violet, 300=magenta).",
            },
            saturation: {
              type: "integer",
              description: "Saturation percent, 0-100. Keep above 25 for visible color presence.",
            },
            lightness: {
              type: "integer",
              description: "Lightness percent, 30-70 ONLY. Outside this range the accent loses contrast against backgrounds and becomes unreadable. Values outside 30-70 will be rejected.",
            },
          },
        },
        fontFamily: { type: "string", enum: ["system", "serif", "mono"] },
        borderRadius: {
          type: "string",
          enum: ["sharp", "subtle", "rounded", "pill"],
        },
        sections: {
          type: "object",
          additionalProperties: false,
          required: [
            "recentEventsDefaultExpanded",
            "stakeholdersDefaultExpanded",
            "coachDefaultExpanded",
          ],
          properties: {
            recentEventsDefaultExpanded: { type: "boolean" },
            stakeholdersDefaultExpanded: { type: "boolean" },
            coachDefaultExpanded: { type: "boolean" },
          },
        },
      },
    },
    summary: {
      type: "string",
      description:
        "One sentence, operator voice, describing what changed. Example: 'Switched to a warmer accent and tightened density.' Max 200 chars.",
    },
    unmet_requests: {
      type: "array",
      description:
        "Each entry is a single sentence describing something the user asked for that the bounded theme schema cannot express, plus a brief reason. Empty array if everything the user asked for was applicable. Examples: 'Hiding source citations is not customizable — sources are part of the cognition contract.' or 'Removing the approval gate is not available — governance is structural.'",
      items: { type: "string" },
    },
  },
} as const;
