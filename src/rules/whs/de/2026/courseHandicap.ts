import type { CourseHandicapResult } from "@/lib/whs/types";
import type { WhsRuleConfig } from "./config";
import { assertValidSlope } from "./scoreDifferential";
import { roundCourseHandicap, roundPlayingHandicap, roundWHS } from "./rounding";

export interface CourseHandicapInput {
  handicapIndex: number;
  slopeRating: number;
  courseRating: number;
  par: number;
}

/**
 * 18 Löcher: Course Handicap = HCPI × (Slope / 113) + (CR − Par).
 * Keine Zwischenrundung; gerundet wird nur das Endergebnis auf eine ganze Zahl.
 */
export function calculateCourseHandicap(
  input: CourseHandicapInput,
  cfg: WhsRuleConfig,
): CourseHandicapResult {
  const { handicapIndex, slopeRating, courseRating, par } = input;
  assertValidSlope(slopeRating, cfg);
  const unrounded =
    (handicapIndex * slopeRating) / cfg.slope.standard + (courseRating - par);
  return {
    kind: 18,
    handicapIndex,
    slopeRating,
    courseRating,
    par,
    unrounded,
    rounded: roundCourseHandicap(unrounded, cfg.rounding.mode),
  };
}

/**
 * 9 Löcher: Course Handicap = (HCPI / 2) × (Slope₉ / 113) + (CR₉ − Par₉).
 * HCPI / 2 wird zuerst auf eine Nachkommastelle gerundet, danach wird nur das
 * Endergebnis auf eine ganze Zahl gerundet.
 */
export function calculateNineHoleCourseHandicap(
  input: CourseHandicapInput,
  cfg: WhsRuleConfig,
): CourseHandicapResult {
  const { handicapIndex, slopeRating, courseRating, par } = input;
  assertValidSlope(slopeRating, cfg);
  const halvedHandicapIndex = roundWHS(
    handicapIndex / 2,
    cfg.rounding.halvedHandicapIndexDecimals,
    cfg.rounding.mode,
  );
  const unrounded =
    (halvedHandicapIndex * slopeRating) / cfg.slope.standard + (courseRating - par);
  return {
    kind: 9,
    handicapIndex,
    halvedHandicapIndex,
    slopeRating,
    courseRating,
    par,
    unrounded,
    rounded: roundCourseHandicap(unrounded, cfg.rounding.mode),
  };
}

/** Playing Handicap = Course Handicap × Handicap-Verrechnung (z. B. 0,95), gerundet. */
export function calculatePlayingHandicap(
  courseHandicap: number,
  allowance: number,
  cfg: WhsRuleConfig,
): number {
  if (!Number.isInteger(courseHandicap)) {
    throw new RangeError("Das Playing Handicap wird aus dem gerundeten Course Handicap berechnet");
  }
  if (!(allowance > 0 && allowance <= 1.5)) {
    throw new RangeError(`Ungültige Handicap-Verrechnung ${allowance}`);
  }
  return roundPlayingHandicap(courseHandicap * allowance, cfg.rounding.mode);
}
