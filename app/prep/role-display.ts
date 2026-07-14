/**
 * Operator-voice display labels for role_in_deal.
 *
 * Hard rule (voice_compression_rule): NEVER render "economic buyer" or "EB"
 * on a rep-facing surface. The methodology talks that way; reps don't.
 *
 * Shared by the brief ("In the room") and the stakeholder profile card so
 * the two surfaces can never drift apart.
 */
export const ROLE_DISPLAY: Record<string, string> = {
  champion: "champion",
  economic_buyer: "decision-maker",
  operator: "operator",
  procurement: "procurement",
  technical_evaluator: "technical evaluator",
  user: "end user",
  unknown: "unknown",
};
