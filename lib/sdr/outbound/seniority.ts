/**
 * Target seniority — which level of buyer the agent prospects into.
 *
 * The SECOND dial (orthogonal to autonomy, which is how much the agent does on
 * its own). An AE reaches senior — C-suite / VP / Director; an SDR casts wider,
 * adding Manager for volume. Crucially it's a BAND, not a fixed title: the
 * sourcing agent maps the band to the real decision-maker for the company's
 * SIZE and TYPE — the founder at a startup, a Director who owns the workflow at
 * an enterprise. Seniority is the band; duties/pains fit is still the filter.
 *
 * Pure config + prompt text. The band lives on the OutboundConfig; the sourcing
 * agent injects seniorityGuidance() so targeting is judgment-led, not a dumb
 * title match.
 */

export type SeniorityLevel = "c_suite" | "vp" | "director" | "manager";

export interface TargetSeniority {
  /** Which levels are in scope, senior → junior. */
  levels: SeniorityLevel[];
  /** Which role preset this came from, for the UI. */
  preset?: "ae" | "sdr";
}

/** AE reach — the senior band, no manager. */
export const AE_SENIORITY: TargetSeniority = {
  levels: ["c_suite", "vp", "director"],
  preset: "ae",
};

/** SDR reach — the AE band plus manager-level, for volume + entry points. */
export const SDR_SENIORITY: TargetSeniority = {
  levels: ["c_suite", "vp", "director", "manager"],
  preset: "sdr",
};

/** Default to the AE band — start senior; widening to manager is a deliberate SDR choice. */
export const DEFAULT_SENIORITY: TargetSeniority = AE_SENIORITY;

const LABEL: Record<SeniorityLevel, string> = {
  c_suite: "C-suite (CEO, CFO, CRO)",
  vp: "VP",
  director: "Director",
  manager: "Manager",
};

/** Resolve a role preset to its band (for the AE/SDR toggle in the UI/CLI). */
export function seniorityForRole(role: "ae" | "sdr"): TargetSeniority {
  return role === "sdr" ? SDR_SENIORITY : AE_SENIORITY;
}

/**
 * The prompt block that makes targeting size-adaptive. Injected into the
 * sourcing agent's system prompt so it reaches the RIGHT person for each
 * company's scale — not the same title everywhere.
 */
export function seniorityGuidance(t?: TargetSeniority | null): string {
  const levels = t?.levels?.length ? t.levels : DEFAULT_SENIORITY.levels;
  const includesManager = levels.includes("manager");
  return `# TARGET SENIORITY (who to reach)
Target decision-makers at these levels: ${levels.map((l) => LABEL[l]).join(", ")}.
This is a BAND, not a fixed title — map it to the real decision-maker for THIS company's size and type:
- Small / startup (<~100 people): the buyer IS the C-suite — founder / CEO / CFO. Don't hunt for a VP that doesn't exist there.
- Mid-market: the VP or head who OWNS the function and the pain (e.g. VP Finance, Controller).
- Enterprise (~5k+): the Director who owns the specific workflow, ideally with a VP-level champion above them.
Pick the ONE person whose actual duties + pains match — seniority is the band, fit is the filter.
${includesManager
      ? "Manager-level is IN scope (the SDR volume net) — a manager who owns the workflow is a strong entry point or champion."
      : "Manager-level is OUT of scope for this run — stay at Director and above."}`;
}
