import { WhsInputError, isWhsInputError } from "@/rules/whs/errors";
import type { WhsRuleSet } from "@/rules/whs/types";
import type {
  CalcIssue,
  CourseHandicapResult,
  GbeResult,
  RatingSnapshot,
  Round,
  RoundEvaluation,
  ScoreDifferentialResult,
} from "./types";

interface RatingValues {
  courseRating: number;
  slopeRating: number;
  par: number;
}

/** Prüft, dass ein vollständiges, zur Lochzahl passendes Rating vorliegt. Keine Ableitung. */
export function requireRatingValues(
  rating: RatingSnapshot,
  holes: 9 | 18,
  rules: WhsRuleSet,
): RatingValues {
  const cfg = rules.config;
  if (rating.courseRating === null || rating.courseRating === undefined) {
    throw new WhsInputError("COURSE_RATING_MISSING");
  }
  if (rating.slopeRating === null || rating.slopeRating === undefined) {
    throw new WhsInputError("SLOPE_RATING_MISSING");
  }
  if (rating.par === null || rating.par === undefined) {
    throw new WhsInputError("PAR_MISSING");
  }
  if (rating.holes !== holes) {
    throw new WhsInputError(holes === 9 ? "NINE_HOLE_RATING_REQUIRED" : "EIGHTEEN_HOLE_RATING_REQUIRED");
  }
  if (
    !Number.isInteger(rating.slopeRating) ||
    rating.slopeRating < cfg.slope.min ||
    rating.slopeRating > cfg.slope.max
  ) {
    throw new WhsInputError("SLOPE_RATING_INVALID", {
      value: rating.slopeRating,
      min: cfg.slope.min,
      max: cfg.slope.max,
    });
  }
  const perHole = rating.courseRating / holes;
  if (
    perHole < cfg.plausibility.courseRatingPerHole.min ||
    perHole > cfg.plausibility.courseRatingPerHole.max
  ) {
    throw new WhsInputError("COURSE_RATING_IMPLAUSIBLE", { value: rating.courseRating, holes });
  }
  if (!Number.isInteger(rating.par) || rating.par < holes * 3 || rating.par > holes * 6) {
    throw new WhsInputError("PAR_IMPLAUSIBLE", { value: rating.par, holes });
  }
  return { courseRating: rating.courseRating, slopeRating: rating.slopeRating, par: rating.par };
}

interface AgsResult {
  ags: number;
  gbe?: GbeResult;
}

function determineAdjustedGrossScore(
  round: Round,
  holes: 9 | 18,
  courseHandicap: CourseHandicapResult,
  rules: WhsRuleSet,
  issues: CalcIssue[],
): AgsResult {
  const entry = round.entry;
  const par = courseHandicap.par;
  switch (entry.mode) {
    case "AGS": {
      const ags = entry.adjustedGrossScore;
      if (ags === null || ags === undefined || !Number.isInteger(ags)) {
        throw new WhsInputError("AGS_MISSING");
      }
      if (ags < holes * rules.config.plausibility.minAgsPerHole) {
        throw new WhsInputError("AGS_IMPLAUSIBLE", { value: ags });
      }
      const maximum = par + rules.config.netDoubleBogey.strokesOverPar * holes + courseHandicap.rounded;
      if (ags > maximum) {
        issues.push({
          code: "AGS_ABOVE_NET_DOUBLE_BOGEY_MAXIMUM",
          severity: "warning",
          params: { value: ags, maximum },
        });
      }
      return { ags };
    }
    case "HOLE_BY_HOLE": {
      const holeData = rules.validateHoleData(round.holeData, holes);
      const gbe = rules.calculateGBE({
        holes: holeData,
        scores: entry.holeScores ?? [],
        courseHandicap,
      });
      return { ags: gbe.total, gbe };
    }
    case "STABLEFORD_HOLES": {
      const holeData = rules.validateHoleData(round.holeData, holes);
      const gbe = rules.calculateGbeFromStablefordHoles({
        holes: holeData,
        points: entry.stablefordPoints ?? [],
        grossOverrides: entry.holeScores,
        courseHandicap,
        playingHandicap: entry.stablefordPlayingHandicap ?? null,
      });
      return { ags: gbe.total, gbe };
    }
    case "STABLEFORD_TOTAL": {
      if (entry.stablefordTotal === null || entry.stablefordTotal === undefined) {
        throw new WhsInputError("STABLEFORD_TOTAL_MISSING");
      }
      const result = rules.calculateGbeFromStablefordTotal({
        total: entry.stablefordTotal,
        par,
        holes,
        courseHandicap: courseHandicap.rounded,
        fullAllowanceConfirmed: Boolean(entry.stablefordFullAllowanceConfirmed),
        playingHandicap: entry.stablefordPlayingHandicap ?? null,
      });
      if (!result.possible || result.adjustedGrossScore === null) {
        throw new WhsInputError(result.reasonCode ?? "STABLEFORD_TOTAL_AMBIGUOUS");
      }
      return { ags: result.adjustedGrossScore };
    }
    default:
      throw new WhsInputError("ENTRY_MODE_UNSUPPORTED", { mode: entry.mode });
  }
}

function plausibilityWarnings(
  ags: number,
  par: number,
  holes: number,
  issues: CalcIssue[],
): void {
  const margin = holes === 9 ? 4 : 8;
  if (ags < par - margin) {
    issues.push({ code: "SCORE_IMPLAUSIBLY_LOW", severity: "warning", params: { value: ags, par } });
  }
}

/**
 * Bewertet eine einzelne Runde mit dem Handicap Index zu Beginn ihres Spieltags.
 * Liefert Course Handicap, GBE-Rechenweg, Score Differential und ESR.
 */
export function evaluateRound(
  round: Round,
  startHandicapIndex: number,
  rules: WhsRuleSet,
): RoundEvaluation {
  const issues: CalcIssue[] = [];
  const relevance = rules.determineHandicapRelevance(round);
  let courseHandicap: CourseHandicapResult | undefined;
  let gbe: GbeResult | undefined;
  let scoreDifferential: ScoreDifferentialResult | undefined;

  try {
    if (!rules.isAllowedPcc(round.pcc)) {
      throw new WhsInputError("PCC_INVALID", { value: round.pcc });
    }
    const status = rules.config.resultStatus[round.resultStatus];
    if (!status?.hasScore) {
      issues.push({ code: "NO_SCORE_FOR_STATUS", severity: "info", params: { status: round.resultStatus } });
    } else if (round.entry.mode === "SCORE_DIFFERENTIAL") {
      const sd = round.entry.scoreDifferential;
      if (sd === null || sd === undefined || !Number.isFinite(sd)) {
        throw new WhsInputError("SCORE_DIFFERENTIAL_MISSING");
      }
      if (sd < -20 || sd > 80) {
        throw new WhsInputError("SCORE_DIFFERENTIAL_IMPLAUSIBLE", { value: sd });
      }
      const value = rules.rounding.roundScoreDifferential(sd);
      if (value !== sd) {
        issues.push({ code: "SCORE_DIFFERENTIAL_ROUNDED", severity: "info", params: { value: sd, rounded: value } });
      }
      scoreDifferential = {
        method: "DIRECT",
        adjustedGrossScore: null,
        courseRating: round.rating.courseRating ?? null,
        slopeRating: round.rating.slopeRating ?? null,
        par: round.rating.par ?? null,
        pcc: round.pcc,
        pccApplied: round.pcc,
        unrounded: sd,
        value,
      };
    } else if (
      round.holes === 18 &&
      round.holesPlayed !== null &&
      round.holesPlayed !== undefined &&
      round.holesPlayed < 18
    ) {
      // Abgebrochene 18-Loch-Runde – eigene Routine, nie die 9-Loch-Routine.
      if (round.entry.mode !== "HOLE_BY_HOLE") {
        throw new WhsInputError("PARTIAL_REQUIRES_HOLE_SCORES");
      }
      const holeData = rules.validateHoleData(round.holeData, 18);
      const scores = round.entry.holeScores ?? [];
      const nineRatings = round.nineHoleRatings ?? {};
      const result = rules.calculatePartialRound({
        holes: holeData,
        scores,
        rating18: {
          courseRating: round.rating.courseRating,
          slopeRating: round.rating.slopeRating,
          par: round.rating.par,
        },
        nineHoleRatings: {
          FRONT: nineRatings.FRONT
            ? { courseRating: nineRatings.FRONT.courseRating, slopeRating: nineRatings.FRONT.slopeRating, par: nineRatings.FRONT.par }
            : undefined,
          BACK: nineRatings.BACK
            ? { courseRating: nineRatings.BACK.courseRating, slopeRating: nineRatings.BACK.slopeRating, par: nineRatings.BACK.par }
            : undefined,
        },
        handicapIndexBeforeRound: startHandicapIndex,
        pcc: round.pcc,
      });
      if (result.holesPlayed !== round.holesPlayed) {
        issues.push({
          code: "HOLES_PLAYED_MISMATCH",
          severity: "warning",
          params: { declared: round.holesPlayed, counted: result.holesPlayed },
        });
      }
      if (rules.config.partialRounds.verificationStatus === "UNVERIFIED") {
        issues.push({ code: "PARTIAL_METHOD_UNVERIFIED", severity: "info" });
      }
      courseHandicap = result.courseHandicap;
      gbe = result.gbe;
      scoreDifferential = result.differential;
    } else if (round.holes === 9) {
      const rating = requireRatingValues(round.rating, 9, rules);
      courseHandicap = rules.calculateNineHoleCourseHandicap({
        handicapIndex: startHandicapIndex,
        ...rating,
      });
      const ags = determineAdjustedGrossScore(round, 9, courseHandicap, rules, issues);
      gbe = ags.gbe;
      plausibilityWarnings(ags.ags, rating.par, 9, issues);
      const nine = rules.calculateNineHoleScoreDifferential({
        adjustedGrossScore: ags.ags,
        courseRating: rating.courseRating,
        slopeRating: rating.slopeRating,
        pcc: round.pcc,
        handicapIndexBeforeRound: startHandicapIndex,
      });
      scoreDifferential = {
        method: "NINE_EXPECTED",
        adjustedGrossScore: ags.ags,
        courseRating: rating.courseRating,
        slopeRating: rating.slopeRating,
        par: rating.par,
        pcc: round.pcc,
        pccApplied: nine.pccApplied,
        playedDifferentialUnrounded: nine.played.unrounded,
        playedDifferential: nine.played.value,
        expectedDifferentialUnrounded: nine.expected.unrounded,
        expectedDifferential: nine.expected.value,
        handicapIndexForExpected: startHandicapIndex,
        unrounded: nine.unrounded,
        value: nine.value,
      };
    } else {
      const rating = requireRatingValues(round.rating, 18, rules);
      courseHandicap = rules.calculateCourseHandicap({
        handicapIndex: startHandicapIndex,
        ...rating,
      });
      const ags = determineAdjustedGrossScore(round, 18, courseHandicap, rules, issues);
      gbe = ags.gbe;
      plausibilityWarnings(ags.ags, rating.par, 18, issues);
      const sd = rules.calculateScoreDifferential({
        adjustedGrossScore: ags.ags,
        courseRating: rating.courseRating,
        slopeRating: rating.slopeRating,
        pcc: round.pcc,
      });
      scoreDifferential = {
        method: "EIGHTEEN",
        adjustedGrossScore: ags.ags,
        courseRating: rating.courseRating,
        slopeRating: rating.slopeRating,
        par: rating.par,
        pcc: round.pcc,
        pccApplied: round.pcc,
        unrounded: sd.unrounded,
        value: sd.value,
      };
    }
  } catch (error) {
    if (isWhsInputError(error)) {
      issues.push({ code: error.code, severity: "error", params: error.params });
    } else if (error instanceof RangeError) {
      issues.push({ code: "CALCULATION_ERROR", severity: "error", params: { message: error.message } });
    } else {
      throw error;
    }
    scoreDifferential = undefined;
  }

  let esr: RoundEvaluation["esr"] = null;
  if (scoreDifferential && !(round.entry.mode === "SCORE_DIFFERENTIAL" && round.entry.suppressEsr)) {
    esr = rules.calculateExceptionalScoreReduction({
      handicapIndexBeforeRound: startHandicapIndex,
      scoreDifferential: scoreDifferential.value,
    });
  }

  return {
    roundId: round.id,
    relevance,
    issues,
    startHandicapIndex,
    courseHandicap,
    gbe,
    scoreDifferential,
    esr,
  };
}

export function hasBlockingIssue(evaluation: Pick<RoundEvaluation, "issues">): boolean {
  return evaluation.issues.some((i) => i.severity === "error");
}
