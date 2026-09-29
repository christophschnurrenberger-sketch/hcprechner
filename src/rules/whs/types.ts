import type {
  CapStatus,
  CapStep,
  BrakeStep,
  CourseHandicapResult,
  EsrResult,
  GbeResult,
  HandicapIndexCalculation,
  HistoryPoint,
  HoleAdjustment,
  HoleInfo,
  HoleScore,
  IndexTableRow,
  IsoDate,
  LowHandicapIndexResult,
  RelevanceResult,
  Round,
} from "@/lib/whs/types";
import type { WhsRuleConfig } from "./de/2026/config";
import type { CourseHandicapInput } from "./de/2026/courseHandicap";
import type { GbeInput, HoleGbeInput } from "./de/2026/gbE";
import type { IndexInputEntry } from "./de/2026/indexCalculation";
import type {
  ExpectedNineHoleDifferential,
  NineHoleDifferential,
  NineHoleDifferentialInput,
} from "./de/2026/nineHoleCalculation";
import type { PartialRoundInput, PartialRoundResult } from "./de/2026/partialRound";
import type { ScoreDifferentialInput, ScoreDifferentialValue } from "./de/2026/scoreDifferential";
import type { StablefordHolesInput, StablefordTotalResult } from "./de/2026/stableford";

export type { WhsRuleConfig };

/**
 * Vertrag einer Regelversion. Der Scoring-Record-Algorithmus kennt nur diese
 * Schnittstelle – eine neue Regelversion implementiert sie (meist durch
 * Wiederverwendung der 2026-Funktionen mit geänderter Konfiguration).
 */
export interface WhsRuleSet {
  id: string;
  country: string;
  version: string;
  label: string;
  config: WhsRuleConfig;
  rounding: {
    roundWHS(value: number, decimals?: number): number;
    roundScoreDifferential(value: number): number;
    roundHandicapIndex(value: number): number;
    roundCourseHandicap(value: number): number;
    roundPlayingHandicap(value: number): number;
    normalizeDecimal(value: number, decimals?: number): number;
  };
  calculateCourseHandicap(input: CourseHandicapInput): CourseHandicapResult;
  calculateNineHoleCourseHandicap(input: CourseHandicapInput): CourseHandicapResult;
  calculatePlayingHandicap(courseHandicap: number, allowance: number): number;
  allocateStrokes(courseHandicap: number, holes: readonly HoleInfo[]): number[];
  validateHoleData(holes: readonly HoleInfo[] | undefined, expected: number): HoleInfo[];
  calculateHoleGBE(input: HoleGbeInput): HoleAdjustment;
  calculateGBE(input: GbeInput): GbeResult;
  calculateGbeFromStablefordHoles(input: StablefordHolesInput): GbeResult;
  calculateGbeFromStablefordTotal(input: {
    total: number;
    par: number;
    holes: number;
    courseHandicap: number;
    fullAllowanceConfirmed: boolean;
    playingHandicap?: number | null;
  }): StablefordTotalResult;
  stablefordPointsForHole(gross: HoleScore, par: number, strokesReceived: number): number;
  isAllowedPcc(pcc: number): boolean;
  nineHolePcc(pcc18: number): number;
  calculateScoreDifferential(input: ScoreDifferentialInput): ScoreDifferentialValue;
  calculateExpectedNineHoleDifferential(handicapIndexBeforeRound: number): ExpectedNineHoleDifferential;
  calculateNineHoleScoreDifferential(input: NineHoleDifferentialInput): NineHoleDifferential;
  calculatePartialRound(input: PartialRoundInput): PartialRoundResult;
  calculateExceptionalScoreReduction(input: {
    handicapIndexBeforeRound: number;
    scoreDifferential: number;
  }): EsrResult;
  combineSameDayReductions(reductions: readonly number[]): number;
  lookupIndexTable(recordSize: number): IndexTableRow | null;
  calculateHandicapIndex(window: readonly IndexInputEntry[]): HandicapIndexCalculation | null;
  calculateLowHandicapIndex(input: {
    mostRecentScoreDate: IsoDate;
    history: readonly HistoryPoint[];
    totalScores: number;
  }): LowHandicapIndexResult | null;
  calculateSoftCap(handicapIndex: number, lowHandicapIndex: number): CapStep;
  calculateHardCap(handicapIndex: number, lowHandicapIndex: number): CapStep;
  applyCaps(
    handicapIndex: number,
    lowHandicapIndex: number,
  ): { softCap: CapStep; hardCap: CapStep; status: CapStatus; value: number };
  applyBrake265(input: { candidate: number; previousCurrent: number; active: boolean }): BrakeStep;
  determineHandicapRelevance(round: Round): RelevanceResult;
}
