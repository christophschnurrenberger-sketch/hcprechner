import type {
  GameFormat,
  IndexTableRow,
  RoundCategory,
  ResultStatus,
} from "@/lib/whs/types";
import type { RoundingMode } from "./rounding";

/**
 * Regelparameter Deutschland / DGV – WHS, Regelversion 2026.
 *
 * Jeder Zahlenwert, den die Berechnung verwendet, ist hier genau einmal
 * hinterlegt. Die Rechenfunktionen in diesem Ordner lesen ausschließlich aus
 * dieser Konfiguration – eine neue Regelversion (z. B. 2027) kopiert die
 * Konfiguration und ändert nur die abweichenden Werte.
 */
export interface WhsRuleConfig {
  id: string;
  country: string;
  version: string;
  label: string;
  rounding: {
    mode: RoundingMode;
    scoreDifferentialDecimals: number;
    handicapIndexDecimals: number;
    halvedHandicapIndexDecimals: number;
  };
  slope: { standard: number; min: number; max: number };
  pcc: {
    allowed: readonly number[];
    /** DGV: PCC-Werte für 9-Loch-Runden (halbierter 18-Loch-Wert, explizit hinterlegt). */
    nineHole: Readonly<Record<string, number>>;
  };
  handicapIndex: {
    maximum: number;
    windowSize: number;
    minimumScores: number;
    table: readonly IndexTableRow[];
  };
  netDoubleBogey: { strokesOverPar: number };
  nineHole: {
    expectedFactor: number;
    expectedConstant: number;
    divisor: number;
    /** Gespieltes und erwartetes 9-Loch-Differential werden jeweils auf 0,1 gerundet, dann addiert. */
    roundComponents: boolean;
  };
  partialRounds: {
    minHoles: number;
    /** 10 … maxHolesNineMethod: Hochrechnung über die vollständig gespielten neun Löcher. */
    maxHolesNineMethod: number;
    /** minHolesNetParMethod … 17: nicht gespielte Löcher mit Netto-Par. */
    minHolesNetParMethod: number;
    verificationStatus: "VERIFIED" | "UNVERIFIED";
  };
  esr: {
    thresholds: readonly { minDifference: number; reduction: -1 | -2 }[];
    /** Mehrere außergewöhnliche Ergebnisse am selben Tag: Abzüge werden addiert. */
    sameDay: "CUMULATIVE";
    appliesToMostRecent: number;
  };
  lowHandicapIndex: { windowDays: number; minimumScores: number };
  caps: { softThreshold: number; softFactor: number; hardLimit: number };
  brake265: {
    threshold: number;
    /** Liegt der HCPI unter 26,5, erfolgt eine Heraufsetzung höchstens bis 26,5. */
    limitIncreaseFromBelowToThreshold: boolean;
  };
  acceptableCategories: readonly RoundCategory[];
  acceptableFormats: readonly GameFormat[];
  resultStatus: Readonly<
    Record<ResultStatus, { acceptable: boolean; hasScore: boolean }>
  >;
  plausibility: {
    minAgsPerHole: number;
    maxAgsOverParPerHole: number;
    courseRatingPerHole: { min: number; max: number };
    minHandicapIndex: number;
  };
}

export const DE_2026: WhsRuleConfig = {
  id: "DE-2026",
  country: "DE",
  version: "2026",
  label: "Deutschland / DGV – World Handicap System, Regelversion 2026",
  rounding: {
    mode: "HALF_AWAY_FROM_ZERO",
    scoreDifferentialDecimals: 1,
    handicapIndexDecimals: 1,
    halvedHandicapIndexDecimals: 1,
  },
  slope: { standard: 113, min: 55, max: 155 },
  pcc: {
    allowed: [-1, 0, 1, 2, 3],
    nineHole: { "-1": -0.5, "0": 0, "1": 0.5, "2": 1.0, "3": 1.5 },
  },
  handicapIndex: {
    maximum: 54.0,
    windowSize: 20,
    minimumScores: 3,
    // WHS-Tabelle: Anzahl Ergebnisse -> Anzahl der besten Score Differentials, Anpassung
    table: [
      { minScores: 3, maxScores: 3, count: 1, adjustment: -2.0 },
      { minScores: 4, maxScores: 4, count: 1, adjustment: -1.0 },
      { minScores: 5, maxScores: 5, count: 1, adjustment: 0 },
      { minScores: 6, maxScores: 6, count: 2, adjustment: -1.0 },
      { minScores: 7, maxScores: 8, count: 2, adjustment: 0 },
      { minScores: 9, maxScores: 11, count: 3, adjustment: 0 },
      { minScores: 12, maxScores: 14, count: 4, adjustment: 0 },
      { minScores: 15, maxScores: 16, count: 5, adjustment: 0 },
      { minScores: 17, maxScores: 18, count: 6, adjustment: 0 },
      { minScores: 19, maxScores: 19, count: 7, adjustment: 0 },
      { minScores: 20, maxScores: 20, count: 8, adjustment: 0 },
    ],
  },
  netDoubleBogey: { strokesOverPar: 2 },
  nineHole: {
    expectedFactor: 1.04,
    expectedConstant: 2.4,
    divisor: 2,
    roundComponents: true,
  },
  partialRounds: {
    minHoles: 10,
    maxHolesNineMethod: 13,
    minHolesNetParMethod: 14,
    verificationStatus: "UNVERIFIED",
  },
  esr: {
    thresholds: [
      { minDifference: 10.0, reduction: -2 },
      { minDifference: 7.0, reduction: -1 },
    ],
    sameDay: "CUMULATIVE",
    appliesToMostRecent: 20,
  },
  lowHandicapIndex: { windowDays: 365, minimumScores: 20 },
  caps: { softThreshold: 3.0, softFactor: 0.5, hardLimit: 5.0 },
  brake265: { threshold: 26.5, limitIncreaseFromBelowToThreshold: true },
  acceptableCategories: ["TOURNAMENT", "RPR"],
  acceptableFormats: ["STROKE", "STABLEFORD", "MAX_SCORE", "PAR_BOGEY"],
  resultStatus: {
    NORMAL: { acceptable: true, hasScore: true },
    NA: { acceptable: false, hasScore: false },
    TA: { acceptable: false, hasScore: false },
    NR_A: { acceptable: true, hasScore: true },
    NR_O: { acceptable: false, hasScore: false },
    DQ_A: { acceptable: true, hasScore: true },
    DQ_O: { acceptable: false, hasScore: false },
    PENALTY: { acceptable: true, hasScore: true },
  },
  plausibility: {
    minAgsPerHole: 1,
    maxAgsOverParPerHole: 10,
    courseRatingPerHole: { min: 2.5, max: 6.5 },
    minHandicapIndex: -10,
  },
};
