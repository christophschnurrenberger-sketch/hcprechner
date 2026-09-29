import type {
  CourseHandicapResult,
  GbeResult,
  HoleAdjustment,
  HoleInfo,
  HoleScore,
} from "@/lib/whs/types";
import { WhsInputError } from "../../errors";
import type { WhsRuleConfig } from "./config";

/**
 * Rangfolge der Löcher nach Stroke Index (1 = schwerstes Loch).
 * Bei 9-Loch-Runden mit 18er-Stroke-Index (z. B. 1,3,5 … 17) ergibt die
 * Rangfolge die Reihenfolge der Vorgabenschläge innerhalb der neun Löcher.
 */
export function strokeIndexRanks(holes: readonly HoleInfo[]): number[] {
  holes.forEach((hole) => {
    if (hole.strokeIndex === null || !Number.isInteger(hole.strokeIndex) || hole.strokeIndex < 1) {
      throw new WhsInputError("STROKE_INDEX_MISSING", { hole: hole.number });
    }
  });
  const seen = new Set<number>();
  holes.forEach((hole) => {
    if (seen.has(hole.strokeIndex!)) {
      throw new WhsInputError("STROKE_INDEX_DUPLICATE", {
        hole: hole.number,
        strokeIndex: hole.strokeIndex!,
      });
    }
    seen.add(hole.strokeIndex!);
  });
  const order = holes
    .map((hole, position) => ({ position, si: hole.strokeIndex! }))
    .sort((a, b) => a.si - b.si);
  const ranks = new Array<number>(holes.length);
  order.forEach((entry, i) => {
    ranks[entry.position] = i + 1;
  });
  return ranks;
}

/**
 * Verteilt ein (gerundetes) Course Handicap auf die Löcher.
 * Positives CH: Schläge ab Rang 1 aufwärts, mehrfach umlaufend (CH > Lochzahl).
 * Plus-Handicap (negativ): Schläge werden ab dem leichtesten Loch zurückgegeben.
 */
export function allocateStrokes(courseHandicap: number, holes: readonly HoleInfo[]): number[] {
  if (!Number.isInteger(courseHandicap)) {
    throw new RangeError("Vorgabenschläge werden mit dem gerundeten Course Handicap verteilt");
  }
  const n = holes.length;
  if (n === 0) return [];
  const ranks = strokeIndexRanks(holes);
  const magnitude = Math.abs(courseHandicap);
  const base = Math.floor(magnitude / n);
  const extra = magnitude % n;
  return ranks.map((rank) => {
    if (courseHandicap >= 0) {
      return base + (rank <= extra ? 1 : 0);
    }
    const received = -(base + (rank > n - extra ? 1 : 0));
    return received === 0 ? 0 : received;
  });
}

export function netDoubleBogey(par: number, strokesReceived: number, cfg: WhsRuleConfig): number {
  return par + cfg.netDoubleBogey.strokesOverPar + strokesReceived;
}

export interface HoleGbeInput {
  hole: HoleInfo;
  strokesReceived: number;
  raw: HoleScore;
}

/**
 * Gewerteter Lochscore: Rohscore, höchstens Netto-Doppelbogey.
 * Nicht beendetes Loch („PICKUP“) = Netto-Doppelbogey.
 * Der Rohscore wird nie verändert – er wird unverändert mit ausgegeben.
 */
export function calculateHoleGBE(input: HoleGbeInput, cfg: WhsRuleConfig): HoleAdjustment {
  const { hole, strokesReceived, raw } = input;
  const ndb = netDoubleBogey(hole.par, strokesReceived, cfg);
  const base = {
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    strokesReceived,
    netDoubleBogey: ndb,
    netPar: hole.par + strokesReceived,
    raw,
  };
  if (raw === "PICKUP") {
    return { ...base, adjusted: ndb, reason: "NOT_COMPLETED" };
  }
  if (raw === null || raw === undefined) {
    throw new WhsInputError("HOLE_SCORE_MISSING", { hole: hole.number });
  }
  if (!Number.isInteger(raw) || raw < 1 || raw > 30) {
    throw new WhsInputError("HOLE_SCORE_INVALID", { hole: hole.number, value: raw });
  }
  if (raw > ndb) {
    return { ...base, adjusted: ndb, reason: "NET_DOUBLE_BOGEY_LIMIT" };
  }
  return { ...base, adjusted: raw, reason: "UNCHANGED" };
}

export function validateHoleData(holes: readonly HoleInfo[] | undefined, expected: number): HoleInfo[] {
  if (!holes || holes.length !== expected) {
    throw new WhsInputError("HOLE_DATA_INCOMPLETE", {
      expected,
      actual: holes?.length ?? 0,
    });
  }
  holes.forEach((hole) => {
    if (!Number.isInteger(hole.par) || hole.par < 3 || hole.par > 6) {
      throw new WhsInputError("HOLE_PAR_MISSING", { hole: hole.number });
    }
  });
  return [...holes];
}

export interface GbeInput {
  holes: readonly HoleInfo[];
  scores: readonly HoleScore[];
  courseHandicap: CourseHandicapResult;
}

/** GBE einer vollständig gespielten 9- oder 18-Loch-Runde aus Lochscores. */
export function calculateGBE(input: GbeInput, cfg: WhsRuleConfig): GbeResult {
  const { holes, scores, courseHandicap } = input;
  if (scores.length !== holes.length) {
    throw new WhsInputError("HOLE_SCORES_INCOMPLETE", {
      expected: holes.length,
      actual: scores.length,
    });
  }
  const strokes = allocateStrokes(courseHandicap.rounded, holes);
  const adjustments = holes.map((hole, i) =>
    calculateHoleGBE({ hole, strokesReceived: strokes[i], raw: scores[i] }, cfg),
  );
  const total = adjustments.reduce((sum, h) => sum + (h.adjusted ?? 0), 0);
  const rawTotal = scores.every((s) => typeof s === "number")
    ? (scores as number[]).reduce((a, b) => a + b, 0)
    : null;
  return { holes: adjustments, total, rawTotal, courseHandicap };
}
