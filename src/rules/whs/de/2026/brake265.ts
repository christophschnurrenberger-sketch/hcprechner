import type { BrakeStep } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";

/**
 * Deutsche Besonderheit „26,5-Bremse“:
 * Zwischen 54,0 und 26,5 werden nur Verbesserungen automatisch wirksam.
 *  - aktueller HCPI ≥ 26,5: der HCPI steigt nicht über den bisherigen Wert.
 *  - aktueller HCPI < 26,5: eine Heraufsetzung erfolgt höchstens bis 26,5.
 * Ist die Bremse (auf Antrag) aufgehoben, gilt der Wert nach Cap-Verfahren.
 */
export function applyBrake265(
  input: { candidate: number; previousCurrent: number; active: boolean },
  cfg: WhsRuleConfig,
): BrakeStep {
  const { candidate, previousCurrent, active } = input;
  if (!active) {
    return { active: false, applied: false, upperBound: null, before: candidate, after: candidate };
  }
  const threshold = cfg.brake265.threshold;
  const upperBound =
    previousCurrent >= threshold
      ? previousCurrent
      : cfg.brake265.limitIncreaseFromBelowToThreshold
        ? threshold
        : Number.POSITIVE_INFINITY;
  const after = Math.min(candidate, upperBound);
  return {
    active: true,
    applied: after < candidate,
    upperBound: Number.isFinite(upperBound) ? upperBound : null,
    before: candidate,
    after,
  };
}
