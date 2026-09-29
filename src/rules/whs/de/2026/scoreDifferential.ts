import type { WhsRuleConfig } from "./config";
import { roundScoreDifferential } from "./rounding";

export interface ScoreDifferentialInput {
  adjustedGrossScore: number;
  courseRating: number;
  slopeRating: number;
  /** PCC, der in die Formel eingeht (bei 9 Loch bereits umgerechnet). */
  pcc: number;
}

export interface ScoreDifferentialValue {
  unrounded: number;
  value: number;
}

export function assertValidSlope(slope: number, cfg: WhsRuleConfig): void {
  if (!Number.isFinite(slope) || slope < cfg.slope.min || slope > cfg.slope.max) {
    throw new RangeError(
      `Slope Rating ${slope} liegt außerhalb ${cfg.slope.min}–${cfg.slope.max}`,
    );
  }
}

export function isAllowedPcc(pcc: number, cfg: WhsRuleConfig): boolean {
  return cfg.pcc.allowed.includes(pcc);
}

/**
 * Score Differential = (113 / Slope) × (GBE − CR − PCC), auf 0,1 gerundet.
 * Einzige Rundung dieser Funktion ist die des Endergebnisses.
 */
export function calculateScoreDifferential(
  input: ScoreDifferentialInput,
  cfg: WhsRuleConfig,
): ScoreDifferentialValue {
  const { adjustedGrossScore, courseRating, slopeRating, pcc } = input;
  assertValidSlope(slopeRating, cfg);
  if (!Number.isFinite(adjustedGrossScore) || !Number.isFinite(courseRating)) {
    throw new RangeError("GBE und Course Rating müssen Zahlen sein");
  }
  const unrounded =
    (cfg.slope.standard * (adjustedGrossScore - courseRating - pcc)) / slopeRating;
  return {
    unrounded,
    value: roundScoreDifferential(unrounded, cfg.rounding.mode),
  };
}

/**
 * DGV: PCC für 9-Loch-Runden. Der für den Tag veröffentlichte (18-Loch-)Wert
 * wird über die explizit hinterlegte Tabelle umgesetzt – niemals 1:1 übernommen.
 */
export function nineHolePcc(pcc18: number, cfg: WhsRuleConfig): number {
  const mapped = cfg.pcc.nineHole[String(pcc18)];
  if (mapped === undefined) {
    throw new RangeError(`PCC ${pcc18} ist nicht zulässig`);
  }
  return mapped;
}
