import type { EsrResult } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";
import { normalizeDecimal } from "./rounding";

/**
 * Außergewöhnliches Ergebnis (Exceptional Score Reduction):
 * Differenz = HCPI vor der Runde − Score Differential der Runde.
 *   ≥ 10,0 → −2
 *   ≥  7,0 → −1
 * Der Abzug wird vom Scoring-Record-Algorithmus auf die letzten 20 Score
 * Differentials (einschließlich des außergewöhnlichen) angewendet.
 */
export function calculateExceptionalScoreReduction(
  input: { handicapIndexBeforeRound: number; scoreDifferential: number },
  cfg: WhsRuleConfig,
): EsrResult {
  const difference = normalizeDecimal(
    input.handicapIndexBeforeRound - input.scoreDifferential,
    cfg.rounding.scoreDifferentialDecimals,
  );
  for (const threshold of cfg.esr.thresholds) {
    if (difference >= threshold.minDifference) {
      return { difference, reduction: threshold.reduction };
    }
  }
  return { difference, reduction: 0 };
}

/** Summe der ESR-Abzüge eines Tages (DGV-Tageslogik: alle Runden eines Tages gemeinsam). */
export function combineSameDayReductions(reductions: readonly number[], cfg: WhsRuleConfig): number {
  if (cfg.esr.sameDay === "CUMULATIVE") {
    return reductions.reduce((sum, r) => sum + r, 0);
  }
  return 0;
}
