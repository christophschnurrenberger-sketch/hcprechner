/**
 * Auswertung über mehrere Runden. Quoten entstehen immer aus den Summen der Zähler
 * (z. B. alle GIR ÷ alle erfassten Grüns) – nie als Durchschnitt von Prozentwerten einzelner Runden.
 */
import type { IsoDate } from "@/lib/whs/types";
import { hasStatistics, percent, ratio } from "./roundStatistics";
import type { PerformanceFilter, PerformancePeriod, PerformancePoint, PerformanceReport, PerformanceSummary, RoundStatistics } from "./types";

export interface StatRound {
  id: string;
  date: IsoDate;
  sequence?: number;
  courseName: string;
  courseId: string | null;
  teeColor: string | null;
  holes: 9 | 18;
  stats: RoundStatistics | null;
}

export const LAST_OPTIONS = [5, 10, 20] as const;

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function summarize(rounds: readonly StatRound[]): PerformanceSummary {
  const withStats = rounds.filter((r) => hasStatistics(r.stats));
  const s = (key: keyof RoundStatistics) => withStats.reduce((sum, r) => sum + (Number(r.stats![key]) || 0), 0);
  const puttRounds = withStats.filter((r) => r.stats!.puttHoles > 0).length;
  const penaltyRounds = withStats.filter((r) => r.stats!.penaltyStrokes !== null).length;
  const totalPutts = s("totalPutts");
  const puttHoles = s("puttHoles");
  const girs = s("girs");
  const girHoles = s("girHoles");
  const firs = s("firs");
  const fairwayOpportunities = s("fairwayOpportunities");
  const sandAttempts = s("sandAttempts");
  const sandSaves = s("sandSaves");
  const upAndDownAttempts = s("upAndDownAttempts");
  const upAndDowns = s("upAndDowns");
  const penaltyStrokes = s("penaltyStrokes");
  const threePutts = s("threePutts");
  const girPuttHoles = s("girPuttHoles");
  const scores = (holes: 9 | 18) => withStats.filter((r) => r.holes === holes && r.stats!.grossScore !== null).map((r) => r.stats!.grossScore!);
  return {
    rounds: rounds.length,
    roundsWithStats: withStats.length,
    holesScored: s("holesScored"),
    averageScore18: mean(scores(18)),
    averageScore9: mean(scores(9)),
    totalPutts,
    puttHoles,
    puttsPerHole: ratio(totalPutts, puttHoles),
    puttsPerGir: ratio(s("puttsOnGir"), girPuttHoles),
    girs,
    girHoles,
    girPercentage: percent(girs, girHoles),
    firs,
    fairwayOpportunities,
    firPercentage: percent(firs, fairwayOpportunities),
    sandAttempts,
    sandSaves,
    sandSavePercentage: percent(sandSaves, sandAttempts),
    upAndDownAttempts,
    upAndDowns,
    upAndDownPercentage: percent(upAndDowns, upAndDownAttempts),
    penaltyStrokes,
    penaltiesPerRound: ratio(penaltyStrokes, penaltyRounds),
    threePutts,
    threePuttsPerRound: ratio(threePutts, puttRounds),
    distribution: {
      eagles: s("eagles"),
      birdies: s("birdies"),
      pars: s("pars"),
      bogeys: s("bogeys"),
      doubleBogeys: s("doubleBogeys"),
      triplePlus: s("triplePlus"),
    },
  };
}

function periodStart(period: PerformancePeriod, today: IsoDate): IsoDate | null {
  if (period === "ALL") return null;
  if (period === "YEAR") return `${today.slice(0, 4)}-01-01`;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (period === "DAYS_30" ? 30 : 90));
  return d.toISOString().slice(0, 10);
}

export function normalizeFilter(filter: PerformanceFilter = {}): Required<PerformanceFilter> {
  const last = filter.last && Number.isInteger(filter.last) && filter.last > 0 ? Math.min(filter.last, 500) : null;
  return {
    last,
    holes: filter.holes === 9 || filter.holes === 18 ? filter.holes : null,
    courseId: filter.courseId || null,
    teeColor: filter.teeColor || null,
    period: filter.period && ["ALL", "DAYS_30", "DAYS_90", "YEAR"].includes(filter.period) ? filter.period : "ALL",
  };
}

const newestFirst = (a: StatRound, b: StatRound) => b.date.localeCompare(a.date) || (b.sequence ?? 0) - (a.sequence ?? 0);

/** Runden gemäß Filter (neueste zuerst); `last` bezieht sich auf Runden mit Statistik. */
export function filterRounds(rounds: readonly StatRound[], filter: Required<PerformanceFilter>, today: IsoDate): StatRound[] {
  const from = periodStart(filter.period, today);
  const matching = rounds
    .filter((r) => (!from || r.date >= from) && (!filter.holes || r.holes === filter.holes) && (!filter.courseId || r.courseId === filter.courseId) && (!filter.teeColor || r.teeColor === filter.teeColor))
    .filter((r) => hasStatistics(r.stats))
    .sort(newestFirst);
  return filter.last ? matching.slice(0, filter.last) : matching;
}

export function toPoint(r: StatRound): PerformancePoint {
  const st = r.stats!;
  return {
    roundId: r.id,
    date: r.date,
    courseName: r.courseName,
    holes: r.holes,
    grossScore: st.grossScore,
    girPercentage: st.girPercentage,
    firPercentage: st.firPercentage,
    puttsPerHole: st.puttsPerHole,
    threePutts: st.threePutts,
    upAndDownPercentage: st.upAndDownPercentage,
    sandSavePercentage: st.sandSavePercentage,
  };
}

export function performanceReport(rounds: readonly StatRound[], rawFilter: PerformanceFilter, today: IsoDate): PerformanceReport {
  const filter = normalizeFilter(rawFilter);
  const selected = filterRounds(rounds, filter, today);
  const withStats = rounds.filter((r) => hasStatistics(r.stats));
  const courses = new Map<string, { id: string; name: string; rounds: number }>();
  const tees = new Map<string, number>();
  for (const r of withStats) {
    if (r.courseId) {
      const c = courses.get(r.courseId) ?? { id: r.courseId, name: r.courseName, rounds: 0 };
      c.rounds++;
      courses.set(r.courseId, c);
    }
    if (r.teeColor) tees.set(r.teeColor, (tees.get(r.teeColor) ?? 0) + 1);
  }
  return {
    filter,
    summary: summarize(selected),
    history: [...selected].reverse().map(toPoint),
    options: {
      courses: [...courses.values()].sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name, "de")),
      tees: [...tees.entries()].map(([teeColor, n]) => ({ teeColor, rounds: n })).sort((a, b) => b.rounds - a.rounds),
    },
    roundsWithoutStats: rounds.length - withStats.length,
  };
}

// ---------------------------------------------------------------------------
// Aggregierte Werte für den Admin-Bereich (beide Backends liefern nur Summen)
// ---------------------------------------------------------------------------

export interface StatSums {
  rounds: number;
  detailedRounds: number;
  completeRounds: number;
  totalPutts: number;
  puttHoles: number;
  puttRounds: number;
  girs: number;
  girHoles: number;
  firs: number;
  fairwayOpportunities: number;
  upAndDowns: number;
  upAndDownAttempts: number;
  sandSaves: number;
  sandAttempts: number;
  threePutts: number;
  penaltyStrokes: number;
  penaltyRounds: number;
}

export interface AggregatePerformance extends StatSums {
  quickRounds: number;
  puttsPerHole: number | null;
  girPercentage: number | null;
  firPercentage: number | null;
  upAndDownPercentage: number | null;
  sandSavePercentage: number | null;
  threePuttsPerRound: number | null;
  penaltiesPerRound: number | null;
}

export const EMPTY_SUMS: StatSums = {
  rounds: 0,
  detailedRounds: 0,
  completeRounds: 0,
  totalPutts: 0,
  puttHoles: 0,
  puttRounds: 0,
  girs: 0,
  girHoles: 0,
  firs: 0,
  fairwayOpportunities: 0,
  upAndDowns: 0,
  upAndDownAttempts: 0,
  sandSaves: 0,
  sandAttempts: 0,
  threePutts: 0,
  penaltyStrokes: 0,
  penaltyRounds: 0,
};

/** Summen über Runden (Runden ohne Statistik zählen nur als Runde). */
export function sumsOf(stats: readonly (RoundStatistics | null | undefined)[]): StatSums {
  const s = { ...EMPTY_SUMS };
  for (const st of stats) {
    s.rounds++;
    if (!hasStatistics(st)) continue;
    s.detailedRounds++;
    if (st.holesTracked === st.holes) s.completeRounds++;
    s.totalPutts += st.totalPutts ?? 0;
    s.puttHoles += st.puttHoles;
    if (st.puttHoles > 0) s.puttRounds++;
    s.girs += st.girs;
    s.girHoles += st.girHoles;
    s.firs += st.firs;
    s.fairwayOpportunities += st.fairwayOpportunities;
    s.upAndDowns += st.upAndDowns;
    s.upAndDownAttempts += st.upAndDownAttempts;
    s.sandSaves += st.sandSaves;
    s.sandAttempts += st.sandAttempts;
    s.threePutts += st.threePutts;
    if (st.penaltyStrokes !== null) {
      s.penaltyStrokes += st.penaltyStrokes;
      s.penaltyRounds++;
    }
  }
  return s;
}

export function ratesFromSums(s: StatSums): AggregatePerformance {
  return {
    ...s,
    quickRounds: s.rounds - s.detailedRounds,
    puttsPerHole: ratio(s.totalPutts, s.puttHoles),
    girPercentage: percent(s.girs, s.girHoles),
    firPercentage: percent(s.firs, s.fairwayOpportunities),
    upAndDownPercentage: percent(s.upAndDowns, s.upAndDownAttempts),
    sandSavePercentage: percent(s.sandSaves, s.sandAttempts),
    threePuttsPerRound: ratio(s.threePutts, s.puttRounds),
    penaltiesPerRound: ratio(s.penaltyStrokes, s.penaltyRounds),
  };
}
