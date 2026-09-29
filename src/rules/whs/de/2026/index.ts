/**
 * Regelset Deutschland / DGV – WHS 2026.
 * Bündelt Konfiguration und Rechenfunktionen dieser Regelversion.
 */
import type { WhsRuleSet } from "../../types";
import { applyBrake265 } from "./brake265";
import { applyCaps, calculateHardCap, calculateSoftCap } from "./cap";
import { DE_2026 } from "./config";
import {
  calculateCourseHandicap,
  calculateNineHoleCourseHandicap,
  calculatePlayingHandicap,
} from "./courseHandicap";
import { calculateExceptionalScoreReduction, combineSameDayReductions } from "./exceptionalScore";
import { allocateStrokes, calculateGBE, calculateHoleGBE, validateHoleData } from "./gbE";
import { calculateHandicapIndex, lookupIndexTable } from "./indexCalculation";
import { calculateLowHandicapIndex } from "./lowHandicapIndex";
import {
  calculateExpectedNineHoleDifferential,
  calculateNineHoleScoreDifferential,
} from "./nineHoleCalculation";
import { calculatePartialRound } from "./partialRound";
import { determineHandicapRelevance } from "./relevance";
import {
  normalizeDecimal,
  roundCourseHandicap,
  roundHandicapIndex,
  roundPlayingHandicap,
  roundScoreDifferential,
  roundWHS,
} from "./rounding";
import { calculateScoreDifferential, isAllowedPcc, nineHolePcc } from "./scoreDifferential";
import {
  calculateGbeFromStablefordHoles,
  calculateGbeFromStablefordTotal,
  stablefordPointsForHole,
} from "./stableford";

const cfg = DE_2026;

export const DE_2026_RULESET: WhsRuleSet = {
  id: cfg.id,
  country: cfg.country,
  version: cfg.version,
  label: cfg.label,
  config: cfg,
  rounding: {
    roundWHS: (v, d = 1) => roundWHS(v, d, cfg.rounding.mode),
    roundScoreDifferential: (v) => roundScoreDifferential(v, cfg.rounding.mode),
    roundHandicapIndex: (v) => roundHandicapIndex(v, cfg.rounding.mode),
    roundCourseHandicap: (v) => roundCourseHandicap(v, cfg.rounding.mode),
    roundPlayingHandicap: (v) => roundPlayingHandicap(v, cfg.rounding.mode),
    normalizeDecimal,
  },
  calculateCourseHandicap: (i) => calculateCourseHandicap(i, cfg),
  calculateNineHoleCourseHandicap: (i) => calculateNineHoleCourseHandicap(i, cfg),
  calculatePlayingHandicap: (ch, allowance) => calculatePlayingHandicap(ch, allowance, cfg),
  allocateStrokes,
  validateHoleData,
  calculateHoleGBE: (i) => calculateHoleGBE(i, cfg),
  calculateGBE: (i) => calculateGBE(i, cfg),
  calculateGbeFromStablefordHoles: (i) => calculateGbeFromStablefordHoles(i, cfg),
  calculateGbeFromStablefordTotal: (i) => calculateGbeFromStablefordTotal(i, cfg),
  stablefordPointsForHole,
  isAllowedPcc: (p) => isAllowedPcc(p, cfg),
  nineHolePcc: (p) => nineHolePcc(p, cfg),
  calculateScoreDifferential: (i) => calculateScoreDifferential(i, cfg),
  calculateExpectedNineHoleDifferential: (hi) => calculateExpectedNineHoleDifferential(hi, cfg),
  calculateNineHoleScoreDifferential: (i) => calculateNineHoleScoreDifferential(i, cfg),
  calculatePartialRound: (i) => calculatePartialRound(i, cfg),
  calculateExceptionalScoreReduction: (i) => calculateExceptionalScoreReduction(i, cfg),
  combineSameDayReductions: (r) => combineSameDayReductions(r, cfg),
  lookupIndexTable: (n) => lookupIndexTable(n, cfg),
  calculateHandicapIndex: (w) => calculateHandicapIndex(w, cfg),
  calculateLowHandicapIndex: (i) => calculateLowHandicapIndex(i, cfg),
  calculateSoftCap: (hi, low) => calculateSoftCap(hi, low, cfg),
  calculateHardCap: (hi, low) => calculateHardCap(hi, low, cfg),
  applyCaps: (hi, low) => applyCaps(hi, low, cfg),
  applyBrake265: (i) => applyBrake265(i, cfg),
  determineHandicapRelevance: (r) => determineHandicapRelevance(r, cfg),
};

export { DE_2026 };
