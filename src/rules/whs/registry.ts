import type { RuleSetRef } from "@/lib/whs/types";
import { DE_2026_RULESET } from "./de/2026";
import type { WhsRuleSet } from "./types";

/**
 * Verfügbare Regelversionen. Neue Versionen (2027, 2028 …) oder Länder werden
 * hier registriert; die Anwendung wählt über das Spielerprofil.
 */
const RULESETS: readonly WhsRuleSet[] = [DE_2026_RULESET];

export const DEFAULT_RULESET_REF: RuleSetRef = { country: "DE", version: "2026" };

export function listRuleSets(): readonly WhsRuleSet[] {
  return RULESETS;
}

export function getRuleSet(ref: RuleSetRef = DEFAULT_RULESET_REF): WhsRuleSet {
  const found = RULESETS.find((r) => r.country === ref.country && r.version === ref.version);
  if (!found) {
    throw new Error(`Regelversion ${ref.country}-${ref.version} ist nicht verfügbar`);
  }
  return found;
}

export const defaultRuleSet = DE_2026_RULESET;
