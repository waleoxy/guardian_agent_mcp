import { Decision, HouseholdEvent } from "./types/domain";
import { decide as decideWithRules } from "./decisionEngine";
import { decide as decideWithBedrock } from "./bedrockDecisionEngine";

/**
 *   DECISION_ENGINE=rules (default) -> deterministic, zero AWS deps
 *   DECISION_ENGINE=bedrock         -> Bedrock reasoning, with automatic
 *                                      fallback to rules if the call fails
 */
export function decide(event: HouseholdEvent): Promise<Decision> {
  return process.env.DECISION_ENGINE === "bedrock"
    ? decideWithBedrock(event)
    : decideWithRules(event);
}
