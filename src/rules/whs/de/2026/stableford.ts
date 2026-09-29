import type {
  CourseHandicapResult,
  GbeResult,
  HoleAdjustment,
  HoleInfo,
  HoleScore,
} from "@/lib/whs/types";
import { WhsInputError } from "../../errors";
import type { WhsRuleConfig } from "./config";
import { allocateStrokes, calculateHoleGBE, netDoubleBogey } from "./gbE";

/**
 * Stableford ist nur eine Spielform. In den Handicap Index geht nie die
 * Punktzahl ein, sondern immer das gewertete Bruttoergebnis (GBE).
 */
export function stablefordPointsForHole(
  gross: HoleScore,
  par: number,
  strokesReceived: number,
): number {
  if (gross === "PICKUP" || gross === null) return 0;
  return Math.max(0, par + strokesReceived + 2 - gross);
}

export interface StablefordHolesInput {
  holes: readonly HoleInfo[];
  points: readonly (number | null)[];
  /** Optional: Rohschläge je Loch – nötig, wenn 0 Punkte nicht eindeutig sind. */
  grossOverrides?: readonly HoleScore[];
  courseHandicap: CourseHandicapResult;
  /** Playing Handicap der Stablefordwertung (null = Course Handicap, 100 %). */
  playingHandicap?: number | null;
}

/**
 * GBE aus lochweisen Stablefordpunkten.
 *  Punkte > 0: Schläge = Par + Schläge(PH) + 2 − Punkte → danach Netto-Doppelbogey-Limit (CH).
 *  Punkte = 0: Schläge ≥ Par + Schläge(PH) + 2. Liegt das auf oder über dem
 *              Netto-Doppelbogey (CH), ist der gewertete Score = NDB; sonst ist
 *              das Loch ohne Rohschläge nicht eindeutig.
 */
export function calculateGbeFromStablefordHoles(
  input: StablefordHolesInput,
  cfg: WhsRuleConfig,
): GbeResult {
  const { holes, points, courseHandicap } = input;
  if (points.length !== holes.length) {
    throw new WhsInputError("STABLEFORD_POINTS_INCOMPLETE", {
      expected: holes.length,
      actual: points.length,
    });
  }
  const chStrokes = allocateStrokes(courseHandicap.rounded, holes);
  const phValue = input.playingHandicap ?? courseHandicap.rounded;
  const phStrokes =
    phValue === courseHandicap.rounded ? chStrokes : allocateStrokes(phValue, holes);

  const adjustments: HoleAdjustment[] = holes.map((hole, i) => {
    const override = input.grossOverrides?.[i] ?? null;
    if (override !== null) {
      return {
        ...calculateHoleGBE({ hole, strokesReceived: chStrokes[i], raw: override }, cfg),
        stablefordPoints: points[i],
      };
    }
    const p = points[i];
    if (p === null || p === undefined) {
      throw new WhsInputError("STABLEFORD_POINTS_MISSING", { hole: hole.number });
    }
    if (!Number.isInteger(p) || p < 0 || p > 10) {
      throw new WhsInputError("STABLEFORD_POINTS_INVALID", { hole: hole.number, value: p });
    }
    const ndb = netDoubleBogey(hole.par, chStrokes[i], cfg);
    const base = {
      number: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      strokesReceived: chStrokes[i],
      netDoubleBogey: ndb,
      netPar: hole.par + chStrokes[i],
      raw: null as HoleScore,
      stablefordPoints: p,
    };
    if (p > 0) {
      const gross = hole.par + phStrokes[i] + 2 - p;
      if (gross < 1) {
        throw new WhsInputError("STABLEFORD_POINTS_INVALID", { hole: hole.number, value: p });
      }
      return {
        ...base,
        raw: gross,
        adjusted: Math.min(gross, ndb),
        reason: gross > ndb ? "NET_DOUBLE_BOGEY_LIMIT" : "FROM_STABLEFORD",
      };
    }
    const minimumGross = hole.par + phStrokes[i] + 2;
    if (minimumGross >= ndb) {
      return { ...base, adjusted: ndb, reason: "FROM_STABLEFORD_ZERO_POINTS" };
    }
    throw new WhsInputError("STABLEFORD_ZERO_POINTS_AMBIGUOUS", { hole: hole.number });
  });
  const total = adjustments.reduce((sum, h) => sum + (h.adjusted ?? 0), 0);
  return { holes: adjustments, total, rawTotal: null, courseHandicap };
}

export interface StablefordTotalResult {
  possible: boolean;
  adjustedGrossScore: number | null;
  reasonCode: string | null;
}

/**
 * GBE aus der Gesamt-Stablefordpunktzahl.
 *
 * Nur eindeutig, wenn die Punkte mit genau dem Course Handicap (100 %) ermittelt
 * wurden, das auch für das Netto-Doppelbogey-Limit gilt. Dann gilt je Loch
 * gewerteter Score = NDB − Punkte, also:
 *    GBE = Par + Course Handicap + 2 × Löcher − Punkte
 * In allen anderen Fällen ist keine exakte Rekonstruktion möglich.
 */
export function calculateGbeFromStablefordTotal(
  input: {
    total: number;
    par: number;
    holes: number;
    courseHandicap: number;
    fullAllowanceConfirmed: boolean;
    playingHandicap?: number | null;
  },
  cfg: WhsRuleConfig,
): StablefordTotalResult {
  const ph = input.playingHandicap ?? null;
  const fullAllowance =
    input.fullAllowanceConfirmed && (ph === null || ph === input.courseHandicap);
  if (!fullAllowance) {
    return { possible: false, adjustedGrossScore: null, reasonCode: "STABLEFORD_TOTAL_AMBIGUOUS" };
  }
  if (!Number.isInteger(input.total) || input.total < 0) {
    throw new WhsInputError("STABLEFORD_TOTAL_INVALID", { value: input.total });
  }
  const ags =
    input.par + input.courseHandicap + cfg.netDoubleBogey.strokesOverPar * input.holes - input.total;
  if (ags < input.holes) {
    throw new WhsInputError("STABLEFORD_TOTAL_IMPLAUSIBLE", { value: input.total });
  }
  return { possible: true, adjustedGrossScore: ags, reasonCode: null };
}
