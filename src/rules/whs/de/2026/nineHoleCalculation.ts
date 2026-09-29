import type { WhsRuleConfig } from "./config";
import { calculateScoreDifferential, nineHolePcc } from "./scoreDifferential";
import { normalizeDecimal, roundScoreDifferential } from "./rounding";

export interface ExpectedNineHoleDifferential {
  handicapIndex: number;
  unrounded: number;
  value: number;
}

/**
 * Erwartetes Score Differential für die nicht gespielten neun Löcher (DGV):
 *   ((HCPI × 1,04) + 2,4) / 2
 *
 * WICHTIG: `handicapIndexBeforeRound` ist der Handicap Index, der zu Beginn des
 * Spieltags galt – nie der heutige oder der nach der Runde.
 */
export function calculateExpectedNineHoleDifferential(
  handicapIndexBeforeRound: number,
  cfg: WhsRuleConfig,
): ExpectedNineHoleDifferential {
  if (!Number.isFinite(handicapIndexBeforeRound)) {
    throw new RangeError("Für das erwartete 9-Loch-Differential wird ein Handicap Index benötigt");
  }
  const { expectedFactor, expectedConstant, divisor, roundComponents } = cfg.nineHole;
  const unrounded = (handicapIndexBeforeRound * expectedFactor + expectedConstant) / divisor;
  return {
    handicapIndex: handicapIndexBeforeRound,
    unrounded,
    value: roundComponents ? roundScoreDifferential(unrounded, cfg.rounding.mode) : unrounded,
  };
}

export interface NineHoleDifferentialInput {
  adjustedGrossScore: number;
  courseRating: number;
  slopeRating: number;
  /** PCC des Tages (18-Loch-Wert, wird hier nach DGV-Tabelle umgesetzt). */
  pcc: number;
  handicapIndexBeforeRound: number;
}

export interface NineHoleDifferential {
  pccApplied: number;
  played: { unrounded: number; value: number };
  expected: ExpectedNineHoleDifferential;
  unrounded: number;
  value: number;
}

/**
 * 18-Loch-Score-Differential aus einer 9-Loch-Runde:
 *   SD₉ gespielt   = (GBE₉ − CR₉ − PCC₉) × 113 / Slope₉
 *   SD₉ erwartet   = ((HCPI × 1,04) + 2,4) / 2
 *   SD₁₈           = SD₉ gespielt + SD₉ erwartet
 *
 * Es werden niemals zwei 9-Loch-Runden miteinander kombiniert.
 */
export function calculateNineHoleScoreDifferential(
  input: NineHoleDifferentialInput,
  cfg: WhsRuleConfig,
): NineHoleDifferential {
  const pccApplied = nineHolePcc(input.pcc, cfg);
  const playedRaw = calculateScoreDifferential(
    {
      adjustedGrossScore: input.adjustedGrossScore,
      courseRating: input.courseRating,
      slopeRating: input.slopeRating,
      pcc: pccApplied,
    },
    cfg,
  );
  const played = cfg.nineHole.roundComponents
    ? playedRaw
    : { unrounded: playedRaw.unrounded, value: playedRaw.unrounded };
  const expected = calculateExpectedNineHoleDifferential(input.handicapIndexBeforeRound, cfg);
  const unrounded = played.value + expected.value;
  const value = cfg.nineHole.roundComponents
    ? normalizeDecimal(unrounded, cfg.rounding.scoreDifferentialDecimals)
    : roundScoreDifferential(unrounded, cfg.rounding.mode);
  return { pccApplied, played, expected, unrounded, value };
}
