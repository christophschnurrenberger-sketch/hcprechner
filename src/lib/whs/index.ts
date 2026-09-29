/**
 * Öffentliche API der WHS-Berechnungsengine.
 *
 * Alle Funktionen delegieren an eine versionierte Regelversion
 * (`src/rules/whs/<land>/<version>`). Ohne Angabe wird das Standard-Regelset
 * Deutschland/DGV 2026 verwendet. Die Engine hat keine Abhängigkeit zur UI.
 */
import { defaultRuleSet, getRuleSet } from "@/rules/whs/registry";
import type { WhsRuleSet } from "@/rules/whs/types";
import type { CourseHandicapInput } from "@/rules/whs/de/2026/courseHandicap";
import type { GbeInput, HoleGbeInput } from "@/rules/whs/de/2026/gbE";
import type { IndexInputEntry } from "@/rules/whs/de/2026/indexCalculation";
import type { NineHoleDifferentialInput } from "@/rules/whs/de/2026/nineHoleCalculation";
import type { ScoreDifferentialInput } from "@/rules/whs/de/2026/scoreDifferential";
import type { BrakeStep, CapStatus, CapStep, HistoryPoint, IsoDate } from "./types";

export * from "./types";
export { calculateScoringRecord, sortRoundsChronologically, handicapIndexInEffectOn } from "./scoringRecord";
export { evaluateRound } from "./roundCalculation";
export { simulateRound, analyzeTarget, maxGrossForDifferential, differentialRound } from "./simulation";
export { calculateStatistics, summarize } from "./statistics";
export { getRuleSet, defaultRuleSet };
export type { WhsRuleSet };

export function calculateCourseHandicap(input: CourseHandicapInput, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateCourseHandicap(input);
}

export function calculateNineHoleCourseHandicap(input: CourseHandicapInput, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateNineHoleCourseHandicap(input);
}

export function calculateHoleGBE(input: HoleGbeInput, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateHoleGBE(input);
}

export function calculateGBE(input: GbeInput, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateGBE(input);
}

export function calculateScoreDifferential(input: ScoreDifferentialInput, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateScoreDifferential(input);
}

export function calculateNineHoleScoreDifferential(
  input: NineHoleDifferentialInput,
  rules: WhsRuleSet = defaultRuleSet,
) {
  return rules.calculateNineHoleScoreDifferential(input);
}

export function calculateExpectedNineHoleDifferential(
  handicapIndexBeforeRound: number,
  rules: WhsRuleSet = defaultRuleSet,
) {
  return rules.calculateExpectedNineHoleDifferential(handicapIndexBeforeRound);
}

/** HCPI aus einer Liste von (adjusted) Score Differentials in chronologischer Reihenfolge. */
export function calculateHandicapIndex(
  differentials: readonly number[] | readonly IndexInputEntry[],
  rules: WhsRuleSet = defaultRuleSet,
) {
  const entries: IndexInputEntry[] = (differentials as readonly (number | IndexInputEntry)[]).map((d, i) =>
    typeof d === "number" ? { roundId: `sd-${i}`, position: i, adjustedSD: d } : d,
  );
  const windowed = entries.slice(-rules.config.handicapIndex.windowSize);
  return rules.calculateHandicapIndex(windowed);
}

export function calculateExceptionalScoreReduction(
  input: { handicapIndexBeforeRound: number; scoreDifferential: number },
  rules: WhsRuleSet = defaultRuleSet,
) {
  return rules.calculateExceptionalScoreReduction(input);
}

export function calculateLowHandicapIndex(
  input: { mostRecentScoreDate: IsoDate; history: readonly HistoryPoint[]; totalScores: number },
  rules: WhsRuleSet = defaultRuleSet,
) {
  return rules.calculateLowHandicapIndex(input);
}

export function calculateSoftCap(handicapIndex: number, lowHandicapIndex: number, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateSoftCap(handicapIndex, lowHandicapIndex);
}

export function calculateHardCap(handicapIndex: number, lowHandicapIndex: number, rules: WhsRuleSet = defaultRuleSet) {
  return rules.calculateHardCap(handicapIndex, lowHandicapIndex);
}

export interface CurrentHandicapIndexResult {
  calculatedHandicapIndex: number;
  softCap: CapStep | null;
  hardCap: CapStep | null;
  capStatus: CapStatus;
  cappedHandicapIndex: number;
  brake265: BrakeStep;
  currentHandicapIndex: number;
}

/**
 * Aktueller HCPI aus kalkuliertem HCPI:
 * (Low HCPI vorhanden → Soft Cap → Hard Cap) → Maximum 54,0 → 26,5-Bremse.
 */
export function calculateCurrentHandicapIndex(
  input: {
    calculatedHandicapIndex: number;
    previousCurrentHandicapIndex: number;
    lowHandicapIndex?: number | null;
    brake265Active: boolean;
  },
  rules: WhsRuleSet = defaultRuleSet,
): CurrentHandicapIndexResult {
  const max = rules.config.handicapIndex.maximum;
  const calculated = Math.min(input.calculatedHandicapIndex, max);
  let value = calculated;
  let softCap: CapStep | null = null;
  let hardCap: CapStep | null = null;
  let capStatus: CapStatus = "NONE";
  if (input.lowHandicapIndex !== null && input.lowHandicapIndex !== undefined) {
    const caps = rules.applyCaps(value, input.lowHandicapIndex);
    softCap = caps.softCap;
    hardCap = caps.hardCap;
    capStatus = caps.status;
    value = caps.value;
  }
  const capped = Math.min(value, max);
  const brake265 = rules.applyBrake265({
    candidate: capped,
    previousCurrent: input.previousCurrentHandicapIndex,
    active: input.brake265Active,
  });
  return {
    calculatedHandicapIndex: calculated,
    softCap,
    hardCap,
    capStatus,
    cappedHandicapIndex: capped,
    brake265,
    currentHandicapIndex: brake265.after,
  };
}

export function ruleSetFor(ref?: { country: string; version: string }): WhsRuleSet {
  return ref ? getRuleSet(ref) : defaultRuleSet;
}
