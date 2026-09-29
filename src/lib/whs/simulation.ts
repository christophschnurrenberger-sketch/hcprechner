import { getRuleSet } from "@/rules/whs/registry";
import type { WhsRuleSet } from "@/rules/whs/types";
import { addDays, todayIso } from "./dates";
import { calculateScoringRecord } from "./scoringRecord";
import type {
  HandicapStatus,
  IsoDate,
  PlayerProfile,
  Round,
  RoundResult,
  WindowEntry,
} from "./types";

export const WHAT_IF_ROUND_ID = "__what_if__";

export interface SimulationOptions {
  rules?: WhsRuleSet;
  today?: IsoDate;
}

export interface WhatIfResult {
  before: HandicapStatus;
  after: HandicapStatus;
  round: RoundResult;
  change: number;
  calculatedBefore: number | null;
  calculatedAfter: number | null;
  /** Rang des neuen Ergebnisses unter den (max. 20) Ergebnissen, 1 = bestes. */
  rankInWindow: number | null;
  windowSize: number;
  counted: boolean;
  usedCount: number | null;
  /** Ergebnis, das durch die neue Runde aus den letzten 20 herausfällt (das älteste). */
  dropped: (WindowEntry & { wasCounted: boolean }) | null;
}

/**
 * Was-wäre-wenn: Berechnet den Scoring Record einmal ohne und einmal mit einer
 * hypothetischen Runde. Es werden keine Wahrscheinlichkeiten berechnet.
 */
export function simulateRound(
  profile: PlayerProfile,
  rounds: readonly Round[],
  hypothetical: Round,
  options: SimulationOptions = {},
): WhatIfResult {
  const rules = options.rules ?? getRuleSet(profile.ruleSet);
  const today = options.today ?? todayIso();
  const base = calculateScoringRecord(profile, rounds, { rules, today });
  const withRound = calculateScoringRecord(profile, [...rounds, hypothetical], { rules, today: maxDate(today, hypothetical.date) });
  const round = withRound.rounds.find((r) => r.roundId === hypothetical.id);
  if (!round) throw new Error("Hypothetische Runde wurde nicht bewertet");
  const afterWindow = withRound.status.window;
  const entry = afterWindow.find((w) => w.roundId === hypothetical.id);
  const afterIds = new Set(afterWindow.map((w) => w.roundId));
  const droppedEntry = base.status.window.find((w) => !afterIds.has(w.roundId)) ?? null;
  return {
    before: base.status,
    after: withRound.status,
    round,
    change: rules.rounding.normalizeDecimal(
      withRound.status.currentHandicapIndex - base.status.currentHandicapIndex,
      1,
    ),
    calculatedBefore: base.status.calculatedHandicapIndex,
    calculatedAfter: withRound.status.calculatedHandicapIndex,
    rankInWindow: entry?.rank ?? null,
    windowSize: afterWindow.length,
    counted: Boolean(entry?.counted),
    usedCount: withRound.status.usedCount,
    dropped: droppedEntry ? { ...droppedEntry, wasCounted: droppedEntry.counted } : null,
  };
}

function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}

/** Hypothetische Runde, die nur aus einem Score Differential besteht. */
export function differentialRound(id: string, date: IsoDate, scoreDifferential: number, sequence = 99): Round {
  const now = new Date(0).toISOString();
  return {
    id,
    date,
    sequence,
    title: "Simulation",
    category: "TOURNAMENT",
    format: "STROKE",
    resultStatus: "NORMAL",
    holes: 18,
    course: { courseName: "Simulation", country: "DE" },
    rating: { holes: 18, par: null, courseRating: null, slopeRating: null },
    pcc: 0,
    entry: { mode: "SCORE_DIFFERENTIAL", scoreDifferential },
    createdAt: now,
    updatedAt: now,
  };
}

export interface TargetScenario {
  scoreDifferential: number;
  roundsNeeded: number | null;
  resultingHandicapIndex: number | null;
}

export interface TargetAnalysis {
  target: number;
  currentHandicapIndex: number;
  alreadyReached: boolean;
  date: IsoDate;
  /** Höchstes Score Differential (0,1-Schritte), mit dem EINE Runde das Ziel erreicht. */
  singleRound: {
    achievable: boolean;
    maxDifferential: number | null;
    resultingHandicapIndex: number | null;
    /** Das Ziel wird mit jedem denkbaren Ergebnis erreicht (z. B. durch die Tabellenanpassung). */
    anyResult: boolean;
  };
  /** Älteste Ergebnisse, die durch weitere Runden der Reihe nach herausfallen würden. */
  nextToDrop: (WindowEntry & { order: number })[];
  scenarios: TargetScenario[];
}

/**
 * Ziel-HCPI: rein rechnerische Szenarien auf Basis des vorhandenen Scoring Records.
 * Keine Erfolgswahrscheinlichkeiten.
 */
export function analyzeTarget(
  profile: PlayerProfile,
  rounds: readonly Round[],
  target: number,
  options: SimulationOptions & { date?: IsoDate; scenarioDifferentials?: number[] } = {},
): TargetAnalysis {
  const rules = options.rules ?? getRuleSet(profile.ruleSet);
  const today = options.today ?? todayIso();
  const base = calculateScoringRecord(profile, rounds, { rules, today });
  const lastDate = rounds.reduce<IsoDate | null>((max, r) => (max === null || r.date > max ? r.date : max), null);
  const date = options.date ?? (lastDate && lastDate >= today ? addDays(lastDate, 1) : today);
  const current = base.status.currentHandicapIndex;

  const resultFor = (sds: number[]): number => {
    const extra = sds.map((sd, i) => differentialRound(`${WHAT_IF_ROUND_ID}_${i}`, addDays(date, i), sd));
    return calculateScoringRecord(profile, [...rounds, ...extra], { rules, today: addDays(date, sds.length) })
      .status.currentHandicapIndex;
  };

  // Binäre Suche über Zehntel: f(sd) ist monoton nicht fallend.
  let lo = -100;
  let hi = 700;
  let best: number | null = null;
  if (resultFor([lo / 10]) <= target) {
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (resultFor([mid / 10]) <= target) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
  }
  const maxDifferential = best === null ? null : best / 10;

  const scenarioSds = options.scenarioDifferentials ?? defaultScenarioDifferentials(target);
  const windowSize = rules.config.handicapIndex.windowSize;
  const scenarios: TargetScenario[] = scenarioSds.map((sd) => {
    const series: number[] = [];
    for (let k = 1; k <= windowSize; k++) {
      series.push(sd);
      const value = resultFor(series);
      if (value <= target) {
        return { scoreDifferential: sd, roundsNeeded: k, resultingHandicapIndex: value };
      }
    }
    return { scoreDifferential: sd, roundsNeeded: null, resultingHandicapIndex: resultFor(series) };
  });

  const window = base.status.window;
  const nextToDrop =
    window.length >= windowSize ? window.slice(0, 8).map((w, i) => ({ ...w, order: i + 1 })) : [];

  return {
    target,
    currentHandicapIndex: current,
    alreadyReached: current <= target,
    date,
    singleRound: {
      achievable: maxDifferential !== null,
      maxDifferential,
      resultingHandicapIndex: maxDifferential !== null ? resultFor([maxDifferential]) : null,
      anyResult: best === 700,
    },
    nextToDrop,
    scenarios,
  };
}

function defaultScenarioDifferentials(target: number): number[] {
  const base = Math.round(target);
  return [base - 4, base - 2, base, base + 2].map((v) => Math.max(-5, v));
}

/**
 * Höchstes GBE, mit dem auf einem Rating ein Score Differential ≤ Ziel erreicht wird.
 * 9 Loch: inklusive erwartetem Differential (HCPI vor der Runde).
 */
export function maxGrossForDifferential(
  input: {
    targetDifferential: number;
    holes: 9 | 18;
    courseRating: number;
    slopeRating: number;
    pcc: number;
    handicapIndexBeforeRound: number;
  },
  rules: WhsRuleSet = getRuleSet(),
): number | null {
  const sdFor = (gross: number): number =>
    input.holes === 9
      ? rules.calculateNineHoleScoreDifferential({
          adjustedGrossScore: gross,
          courseRating: input.courseRating,
          slopeRating: input.slopeRating,
          pcc: input.pcc,
          handicapIndexBeforeRound: input.handicapIndexBeforeRound,
        }).value
      : rules.calculateScoreDifferential({
          adjustedGrossScore: gross,
          courseRating: input.courseRating,
          slopeRating: input.slopeRating,
          pcc: input.pcc,
        }).value;
  const minGross = input.holes;
  const maxGross = input.holes * 12;
  let best: number | null = null;
  for (let g = minGross; g <= maxGross; g++) {
    if (sdFor(g) <= input.targetDifferential) best = g;
    else break;
  }
  return best;
}
