import type { Round, RoundResult, ScoringRecordResult } from "./types";

export interface NumericSummary {
  count: number;
  average: number | null;
  median: number | null;
  best: number | null;
  worst: number | null;
}

export function summarize(values: readonly number[]): NumericSummary {
  if (values.length === 0) {
    return { count: 0, average: null, median: null, best: null, worst: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    count: values.length,
    average: values.reduce((a, b) => a + b, 0) / values.length,
    median,
    best: sorted[0],
    worst: sorted[sorted.length - 1],
  };
}

export interface CourseStatistics {
  key: string;
  courseName: string;
  courseId: string | null;
  rounds: number;
  differentials: NumericSummary;
  gross18: NumericSummary;
  gross9: NumericSummary;
  bestRoundId: string | null;
  worstRoundId: string | null;
  bestByTee: { tee: string; roundId: string; scoreDifferential: number }[];
  handicapTrend: { date: string; roundId: string; handicapIndexAfter: number | null; scoreDifferential: number }[];
}

export interface PlayerStatistics {
  totalRounds: number;
  relevantRounds: number;
  nineHoleRounds: number;
  eighteenHoleRounds: number;
  partialRounds: number;
  differentials: NumericSummary;
  last20: NumericSummary;
  countedAverage: number | null;
  nineHoleDifferentials: NumericSummary;
  eighteenHoleDifferentials: NumericSummary;
  gross18: NumericSummary;
  gross9: NumericSummary;
  bestRounds: RoundResult[];
  lastRound: RoundResult | null;
  courses: CourseStatistics[];
  ratingDistribution: { roundId: string; courseRating: number; slopeRating: number; holes: 9 | 18; scoreDifferential: number }[];
}

export function courseKey(round: Round): string {
  return round.course.courseId ?? `name:${round.course.courseName.trim().toLowerCase()}`;
}

/** Kennzahlen auf Basis der bereits berechneten Runden (keine eigene WHS-Logik). */
export function calculateStatistics(
  result: ScoringRecordResult,
  rounds: readonly Round[],
): PlayerStatistics {
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const withSd = result.rounds.filter((r) => r.inRecord && r.scoreDifferential);
  const sdOf = (r: RoundResult) => r.scoreDifferential!.value;
  const roundOf = (r: RoundResult) => byId.get(r.roundId)!;
  const isPartial = (r: RoundResult) => {
    const round = roundOf(r);
    return round.holes === 18 && round.holesPlayed != null && round.holesPlayed < 18;
  };

  const nine = withSd.filter((r) => roundOf(r).holes === 9 && roundOf(r).entry.mode !== "SCORE_DIFFERENTIAL");
  const eighteen = withSd.filter(
    (r) => roundOf(r).holes === 18 && !isPartial(r) && roundOf(r).entry.mode !== "SCORE_DIFFERENTIAL",
  );
  const agsOf = (list: RoundResult[]) =>
    list
      .map((r) => r.scoreDifferential!.adjustedGrossScore)
      .filter((v): v is number => v !== null && v !== undefined);

  const window = result.status.window;
  const counted = window.filter((w) => w.counted);

  const courseMap = new Map<string, RoundResult[]>();
  for (const r of withSd) {
    const round = roundOf(r);
    if (round.entry.mode === "SCORE_DIFFERENTIAL") continue;
    const key = courseKey(round);
    courseMap.set(key, [...(courseMap.get(key) ?? []), r]);
  }

  const courses: CourseStatistics[] = [...courseMap.entries()].map(([key, list]) => {
    const first = roundOf(list[0]);
    const sorted = [...list].sort((a, b) => sdOf(a) - sdOf(b));
    const teeBest = new Map<string, RoundResult>();
    for (const r of list) {
      const round = roundOf(r);
      const tee = [round.course.teeColor, round.course.teeName, round.holes === 9 ? "9 Loch" : "18 Loch"]
        .filter(Boolean)
        .join(" · ");
      const prev = teeBest.get(tee);
      if (!prev || sdOf(r) < sdOf(prev)) teeBest.set(tee, r);
    }
    return {
      key,
      courseName: first.course.courseName,
      courseId: first.course.courseId ?? null,
      rounds: list.length,
      differentials: summarize(list.map(sdOf)),
      gross18: summarize(agsOf(list.filter((r) => roundOf(r).holes === 18 && !isPartial(r)))),
      gross9: summarize(agsOf(list.filter((r) => roundOf(r).holes === 9))),
      bestRoundId: sorted[0]?.roundId ?? null,
      worstRoundId: sorted[sorted.length - 1]?.roundId ?? null,
      bestByTee: [...teeBest.entries()].map(([tee, r]) => ({
        tee,
        roundId: r.roundId,
        scoreDifferential: sdOf(r),
      })),
      handicapTrend: list.map((r) => ({
        date: r.date,
        roundId: r.roundId,
        handicapIndexAfter: r.revision?.currentHandicapIndex ?? null,
        scoreDifferential: sdOf(r),
      })),
    };
  });
  courses.sort((a, b) => b.rounds - a.rounds || a.courseName.localeCompare(b.courseName, "de"));

  return {
    totalRounds: result.rounds.length,
    relevantRounds: withSd.length,
    nineHoleRounds: withSd.filter((r) => roundOf(r).holes === 9).length,
    eighteenHoleRounds: withSd.filter((r) => roundOf(r).holes === 18 && !isPartial(r)).length,
    partialRounds: withSd.filter(isPartial).length,
    differentials: summarize(withSd.map(sdOf)),
    last20: summarize(window.map((w) => w.adjustedSD)),
    countedAverage:
      counted.length > 0 ? counted.reduce((s, w) => s + w.adjustedSD, 0) / counted.length : null,
    nineHoleDifferentials: summarize(nine.map(sdOf)),
    eighteenHoleDifferentials: summarize(eighteen.map(sdOf)),
    gross18: summarize(agsOf(eighteen)),
    gross9: summarize(agsOf(nine)),
    bestRounds: [...withSd].sort((a, b) => sdOf(a) - sdOf(b)).slice(0, 10),
    lastRound: result.rounds[result.rounds.length - 1] ?? null,
    courses,
    ratingDistribution: withSd
      .filter((r) => r.scoreDifferential!.courseRating !== null && r.scoreDifferential!.slopeRating !== null)
      .map((r) => ({
        roundId: r.roundId,
        courseRating: r.scoreDifferential!.courseRating!,
        slopeRating: r.scoreDifferential!.slopeRating!,
        holes: roundOf(r).holes,
        scoreDifferential: sdOf(r),
      })),
  };
}
