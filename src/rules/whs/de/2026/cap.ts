import type { CapStep, CapStatus } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";
import { normalizeDecimal, roundHandicapIndex } from "./rounding";

/**
 * Soft Cap: Übersteigt der Handicap Index den Low Handicap Index um mehr als
 * 3,0, wird der darüber hinausgehende Anstieg halbiert.
 *   LHI 10,0 / Wert 13,4 → 10,0 + 3,0 + 0,4 × 0,5 = 13,2
 */
export function calculateSoftCap(
  handicapIndex: number,
  lowHandicapIndex: number,
  cfg: WhsRuleConfig,
): CapStep {
  const increase = normalizeDecimal(handicapIndex - lowHandicapIndex, 1);
  if (increase <= cfg.caps.softThreshold) {
    return { applied: false, before: handicapIndex, after: handicapIndex };
  }
  const after = roundHandicapIndex(
    lowHandicapIndex +
      cfg.caps.softThreshold +
      (increase - cfg.caps.softThreshold) * cfg.caps.softFactor,
    cfg.rounding.mode,
  );
  return { applied: after !== handicapIndex, before: handicapIndex, after };
}

/** Hard Cap: nach dem Soft Cap höchstens 5,0 über dem Low Handicap Index. */
export function calculateHardCap(
  handicapIndex: number,
  lowHandicapIndex: number,
  cfg: WhsRuleConfig,
): CapStep {
  const limit = normalizeDecimal(lowHandicapIndex + cfg.caps.hardLimit, 1);
  if (handicapIndex <= limit) {
    return { applied: false, before: handicapIndex, after: handicapIndex };
  }
  return { applied: true, before: handicapIndex, after: limit };
}

export interface CapResult {
  softCap: CapStep;
  hardCap: CapStep;
  status: CapStatus;
  value: number;
}

/** Wendet Soft Cap und Hard Cap nacheinander an. */
export function applyCaps(
  handicapIndex: number,
  lowHandicapIndex: number,
  cfg: WhsRuleConfig,
): CapResult {
  const softCap = calculateSoftCap(handicapIndex, lowHandicapIndex, cfg);
  const hardCap = calculateHardCap(softCap.after, lowHandicapIndex, cfg);
  const status: CapStatus = hardCap.applied ? "HARD" : softCap.applied ? "SOFT" : "NONE";
  return { softCap, hardCap, status, value: hardCap.after };
}
