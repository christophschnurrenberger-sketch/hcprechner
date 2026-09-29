import type {
  CourseHandicapResult,
  GbeResult,
  HoleAdjustment,
  HoleInfo,
  HoleScore,
  NineSide,
  ScoreDifferentialResult,
} from "@/lib/whs/types";
import { WhsInputError } from "../../errors";
import type { WhsRuleConfig } from "./config";
import { calculateCourseHandicap, calculateNineHoleCourseHandicap } from "./courseHandicap";
import { allocateStrokes, calculateHoleGBE, netDoubleBogey } from "./gbE";
import { calculateNineHoleScoreDifferential } from "./nineHoleCalculation";
import { calculateScoreDifferential } from "./scoreDifferential";

/**
 * Abgebrochene 18-Loch-Runden mit 10–17 gespielten Löchern.
 *
 * Diese Routine ist bewusst getrennt von der normalen 9-Loch-Runde:
 *  - 10–13 Löcher: Hochrechnung. Gewertet werden die vollständig gespielten
 *    neun Löcher (1–9 oder 10–18) mit ihrem offiziellen 9-Loch-Rating; die
 *    nicht gespielten neun Löcher werden über das erwartete Score Differential
 *    (HCPI zu Beginn des Spieltags) ergänzt. Weitere gespielte Löcher bleiben
 *    unberücksichtigt.
 *  - 14–17 Löcher: Die nicht gespielten Löcher werden mit Netto-Par gewertet,
 *    danach wird das Score Differential mit dem 18-Loch-Rating berechnet.
 *
 * Die Methode ist im Regelset als `partialRounds` hinterlegt und dort mit ihrem
 * Verifikationsstatus gekennzeichnet.
 */

export interface PartialRating {
  courseRating: number | null;
  slopeRating: number | null;
  par: number | null;
}

export interface PartialRoundInput {
  holes: readonly HoleInfo[];
  /** null = Loch nicht gespielt, "PICKUP" = gespielt, aber nicht beendet. */
  scores: readonly HoleScore[];
  rating18: PartialRating;
  nineHoleRatings?: Partial<Record<NineSide, PartialRating>>;
  handicapIndexBeforeRound: number;
  pcc: number;
}

export interface PartialRoundResult {
  holesPlayed: number;
  courseHandicap: CourseHandicapResult;
  gbe: GbeResult;
  differential: ScoreDifferentialResult;
}

function requireRating(rating: PartialRating | undefined, code: string, params?: Record<string, string | number>) {
  if (!rating || rating.courseRating === null || rating.slopeRating === null || rating.par === null) {
    throw new WhsInputError(code, params);
  }
  return rating as { courseRating: number; slopeRating: number; par: number };
}

export function countPlayedHoles(scores: readonly HoleScore[]): number {
  return scores.filter((s) => s !== null && s !== undefined).length;
}

export function calculatePartialRound(
  input: PartialRoundInput,
  cfg: WhsRuleConfig,
): PartialRoundResult {
  const { holes, scores } = input;
  if (holes.length !== 18 || scores.length !== 18) {
    throw new WhsInputError("PARTIAL_REQUIRES_18_HOLE_DATA");
  }
  const holesPlayed = countPlayedHoles(scores);
  const { minHoles, maxHolesNineMethod, minHolesNetParMethod } = cfg.partialRounds;
  if (holesPlayed < minHoles) {
    throw new WhsInputError("PARTIAL_TOO_FEW_HOLES", { holesPlayed, minHoles });
  }
  if (holesPlayed >= 18) {
    throw new WhsInputError("PARTIAL_ALL_HOLES_PLAYED");
  }
  if (holesPlayed <= maxHolesNineMethod) {
    return nineHoleExtrapolation(input, holesPlayed, cfg);
  }
  if (holesPlayed >= minHolesNetParMethod) {
    return netParCompletion(input, holesPlayed, cfg);
  }
  throw new WhsInputError("PARTIAL_METHOD_UNDEFINED", { holesPlayed });
}

function nineHoleExtrapolation(
  input: PartialRoundInput,
  holesPlayed: number,
  cfg: WhsRuleConfig,
): PartialRoundResult {
  const { holes, scores } = input;
  const frontComplete = scores.slice(0, 9).every((s) => s !== null && s !== undefined);
  const backComplete = scores.slice(9, 18).every((s) => s !== null && s !== undefined);
  const nine: NineSide | null = frontComplete ? "FRONT" : backComplete ? "BACK" : null;
  if (!nine) {
    throw new WhsInputError("PARTIAL_NO_COMPLETE_NINE", { holesPlayed });
  }
  const rating = requireRating(input.nineHoleRatings?.[nine], "PARTIAL_NINE_RATING_REQUIRED", {
    nine,
  });
  const offset = nine === "FRONT" ? 0 : 9;
  const nineHoles = holes.slice(offset, offset + 9);
  const courseHandicap = calculateNineHoleCourseHandicap(
    {
      handicapIndex: input.handicapIndexBeforeRound,
      slopeRating: rating.slopeRating,
      courseRating: rating.courseRating,
      par: rating.par,
    },
    cfg,
  );
  const strokes = allocateStrokes(courseHandicap.rounded, nineHoles);
  const adjustments: HoleAdjustment[] = holes.map((hole, i) => {
    const inNine = i >= offset && i < offset + 9;
    if (inNine) {
      return calculateHoleGBE({ hole, strokesReceived: strokes[i - offset], raw: scores[i] }, cfg);
    }
    return {
      number: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      strokesReceived: 0,
      netDoubleBogey: netDoubleBogey(hole.par, 0, cfg),
      netPar: hole.par,
      raw: scores[i],
      adjusted: null,
      reason: "NOT_COUNTED",
    };
  });
  const total = adjustments.reduce((sum, h) => sum + (h.adjusted ?? 0), 0);
  const nineDiff = calculateNineHoleScoreDifferential(
    {
      adjustedGrossScore: total,
      courseRating: rating.courseRating,
      slopeRating: rating.slopeRating,
      pcc: input.pcc,
      handicapIndexBeforeRound: input.handicapIndexBeforeRound,
    },
    cfg,
  );
  return {
    holesPlayed,
    courseHandicap,
    gbe: { holes: adjustments, total, rawTotal: null, courseHandicap },
    differential: {
      method: "PARTIAL_NINE_EXPECTED",
      adjustedGrossScore: total,
      courseRating: rating.courseRating,
      slopeRating: rating.slopeRating,
      par: rating.par,
      pcc: input.pcc,
      pccApplied: nineDiff.pccApplied,
      playedDifferentialUnrounded: nineDiff.played.unrounded,
      playedDifferential: nineDiff.played.value,
      expectedDifferentialUnrounded: nineDiff.expected.unrounded,
      expectedDifferential: nineDiff.expected.value,
      handicapIndexForExpected: input.handicapIndexBeforeRound,
      nineUsed: nine,
      unrounded: nineDiff.unrounded,
      value: nineDiff.value,
    },
  };
}

function netParCompletion(
  input: PartialRoundInput,
  holesPlayed: number,
  cfg: WhsRuleConfig,
): PartialRoundResult {
  const { holes, scores } = input;
  const rating = requireRating(input.rating18, "RATING_18_REQUIRED");
  const courseHandicap = calculateCourseHandicap(
    {
      handicapIndex: input.handicapIndexBeforeRound,
      slopeRating: rating.slopeRating,
      courseRating: rating.courseRating,
      par: rating.par,
    },
    cfg,
  );
  const strokes = allocateStrokes(courseHandicap.rounded, holes);
  const adjustments: HoleAdjustment[] = holes.map((hole, i) => {
    if (scores[i] === null || scores[i] === undefined) {
      return {
        number: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        strokesReceived: strokes[i],
        netDoubleBogey: netDoubleBogey(hole.par, strokes[i], cfg),
        netPar: hole.par + strokes[i],
        raw: null,
        adjusted: hole.par + strokes[i],
        reason: "NOT_PLAYED_NET_PAR",
      };
    }
    return calculateHoleGBE({ hole, strokesReceived: strokes[i], raw: scores[i] }, cfg);
  });
  const total = adjustments.reduce((sum, h) => sum + (h.adjusted ?? 0), 0);
  const sd = calculateScoreDifferential(
    {
      adjustedGrossScore: total,
      courseRating: rating.courseRating,
      slopeRating: rating.slopeRating,
      pcc: input.pcc,
    },
    cfg,
  );
  return {
    holesPlayed,
    courseHandicap,
    gbe: { holes: adjustments, total, rawTotal: null, courseHandicap },
    differential: {
      method: "PARTIAL_NET_PAR",
      adjustedGrossScore: total,
      courseRating: rating.courseRating,
      slopeRating: rating.slopeRating,
      par: rating.par,
      pcc: input.pcc,
      pccApplied: input.pcc,
      unrounded: sd.unrounded,
      value: sd.value,
    },
  };
}
