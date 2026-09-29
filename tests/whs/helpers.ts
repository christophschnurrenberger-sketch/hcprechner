import { addDays } from "@/lib/whs/dates";
import type { HoleInfo, HoleScore, PlayerProfile, RatingSnapshot, Round } from "@/lib/whs/types";

let counter = 0;

export function resetIds() {
  counter = 0;
}

export function nextId(prefix = "r") {
  counter += 1;
  return `${prefix}${String(counter).padStart(3, "0")}`;
}

export function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "p1",
    gender: "M",
    startHandicapIndex: 54,
    startDate: null,
    brake265LiftedAt: null,
    ruleSet: { country: "DE", version: "2026" },
    ...overrides,
  };
}

/** Beispiel-Layout Par 72 mit Stroke Index 1–18. */
export const PARS_18 = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
export const SI_18 = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 4, 16, 2, 12, 6, 18, 10, 14];

export function holes18(): HoleInfo[] {
  return PARS_18.map((par, i) => ({ number: i + 1, par, strokeIndex: SI_18[i] }));
}

export function holesFront9(): HoleInfo[] {
  return holes18().slice(0, 9);
}

export function rating18(overrides: Partial<RatingSnapshot> = {}): RatingSnapshot {
  return { holes: 18, par: 72, courseRating: 72.0, slopeRating: 113, ...overrides };
}

export function rating9(overrides: Partial<RatingSnapshot> = {}): RatingSnapshot {
  return { holes: 9, par: 36, courseRating: 36.0, slopeRating: 113, nine: "FRONT", ...overrides };
}

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

export function baseRound(overrides: Partial<Round> = {}): Round {
  const id = overrides.id ?? nextId();
  return {
    id,
    date: "2026-05-01",
    sequence: 0,
    title: "Testrunde",
    category: "TOURNAMENT",
    format: "STROKE",
    resultStatus: "NORMAL",
    holes: 18,
    course: { courseName: "Testplatz", country: "DE", teeColor: "Gelb", gender: "M" },
    rating: rating18(),
    pcc: 0,
    entry: { mode: "AGS", adjustedGrossScore: 90 },
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

export function agsRound(date: string, ags: number, overrides: Partial<Round> = {}): Round {
  return baseRound({ date, entry: { mode: "AGS", adjustedGrossScore: ags }, ...overrides });
}

export function sdRound(date: string, scoreDifferential: number, overrides: Partial<Round> = {}): Round {
  return baseRound({
    date,
    entry: { mode: "SCORE_DIFFERENTIAL", scoreDifferential },
    rating: { holes: 18, par: null, courseRating: null, slopeRating: null },
    ...overrides,
  });
}

export function nineRound(date: string, ags: number, overrides: Partial<Round> = {}): Round {
  return baseRound({
    date,
    holes: 9,
    rating: rating9(),
    entry: { mode: "AGS", adjustedGrossScore: ags },
    ...overrides,
  });
}

export function holeByHoleRound(date: string, scores: HoleScore[], overrides: Partial<Round> = {}): Round {
  return baseRound({
    date,
    holeData: scores.length === 9 ? holesFront9() : holes18(),
    holes: scores.length === 9 ? 9 : 18,
    rating: scores.length === 9 ? rating9() : rating18(),
    entry: { mode: "HOLE_BY_HOLE", holeScores: scores },
    ...overrides,
  });
}

/** Folge von SD-Runden an aufeinanderfolgenden Tagen. */
export function sdSeries(start: string, values: number[]): Round[] {
  return values.map((v, i) => sdRound(addDays(start, i), v));
}
