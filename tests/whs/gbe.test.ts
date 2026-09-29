import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import {
  allocateStrokes,
  calculateGBE,
  calculateHoleGBE,
  netDoubleBogey,
  strokeIndexRanks,
  validateHoleData,
} from "@/rules/whs/de/2026/gbE";
import { WhsInputError } from "@/rules/whs/errors";
import type { CourseHandicapResult, HoleInfo } from "@/lib/whs/types";
import { holes18, holesFront9, PARS_18 } from "./helpers";

function ch(rounded: number, kind: 9 | 18 = 18): CourseHandicapResult {
  return {
    kind,
    handicapIndex: rounded,
    slopeRating: 113,
    courseRating: kind === 18 ? 72 : 36,
    par: kind === 18 ? 72 : 36,
    unrounded: rounded,
    rounded,
  };
}

const hole = (par: number, strokeIndex: number, number = 1): HoleInfo => ({ number, par, strokeIndex });

describe("Vorgabenschläge verteilen", () => {
  it("CH 0: keine Schläge", () => {
    expect(allocateStrokes(0, holes18()).every((s) => s === 0)).toBe(true);
  });

  it("CH 18: ein Schlag auf jedem Loch", () => {
    expect(allocateStrokes(18, holes18()).every((s) => s === 1)).toBe(true);
  });

  it("CH 20: zwei Schläge auf SI 1 und 2", () => {
    const holes = holes18();
    const strokes = allocateStrokes(20, holes);
    holes.forEach((h, i) => {
      expect(strokes[i]).toBe(h.strokeIndex! <= 2 ? 2 : 1);
    });
    expect(strokes.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it("CH 57: vier Schläge auf SI 1–3, sonst drei", () => {
    const holes = holes18();
    const strokes = allocateStrokes(57, holes);
    holes.forEach((h, i) => {
      expect(strokes[i]).toBe(h.strokeIndex! <= 3 ? 4 : 3);
    });
    expect(strokes.reduce((a, b) => a + b, 0)).toBe(57);
  });

  it("CH 5: Schläge auf SI 1–5", () => {
    const holes = holes18();
    const strokes = allocateStrokes(5, holes);
    holes.forEach((h, i) => expect(strokes[i]).toBe(h.strokeIndex! <= 5 ? 1 : 0));
  });

  it("Plus-Handicap −3: Schläge werden auf SI 16–18 zurückgegeben", () => {
    const holes = holes18();
    const strokes = allocateStrokes(-3, holes);
    holes.forEach((h, i) => expect(strokes[i]).toBe(h.strokeIndex! >= 16 ? -1 : 0));
  });

  it("9 Löcher mit 18er-Stroke-Index: Verteilung nach Rangfolge", () => {
    const front = holesFront9(); // SI 7,3,15,1,11,5,17,9,13
    const strokes = allocateStrokes(4, front);
    // Rang 1–4 = SI 1,3,5,7 (Löcher 4,2,6,1)
    expect(strokes).toEqual([1, 1, 0, 1, 0, 1, 0, 0, 0]);
  });

  it("9 Löcher, CH 12: Rang 1–3 erhalten zwei Schläge", () => {
    const strokes = allocateStrokes(12, holesFront9());
    expect(strokes.reduce((a, b) => a + b, 0)).toBe(12);
    expect(strokes).toEqual([1, 2, 1, 2, 1, 2, 1, 1, 1]); // Löcher 2, 4, 6 = SI 3, 1, 5
  });

  it("verlangt ein gerundetes Course Handicap", () => {
    expect(() => allocateStrokes(12.4, holes18())).toThrow(RangeError);
  });

  it("fehlender Stroke Index ist ein Fehler", () => {
    const holes = holes18();
    holes[3] = { ...holes[3], strokeIndex: null };
    expect(() => allocateStrokes(10, holes)).toThrow(WhsInputError);
  });

  it("doppelter Stroke Index ist ein Fehler", () => {
    const holes = holes18();
    holes[3] = { ...holes[3], strokeIndex: 7 };
    expect(() => strokeIndexRanks(holes)).toThrow(/STROKE_INDEX_DUPLICATE/);
  });
});

describe("Netto-Doppelbogey und gewerteter Lochscore", () => {
  it("NDB = Par + 2 + Vorgabenschläge", () => {
    expect(netDoubleBogey(4, 1, DE_2026)).toBe(7);
    expect(netDoubleBogey(5, 0, DE_2026)).toBe(7);
    expect(netDoubleBogey(3, 3, DE_2026)).toBe(8);
  });

  it("Loch 1: Par 4, 1 Schlag, Rohscore 8 → gewertet 7 (NDB-Limit)", () => {
    const r = calculateHoleGBE({ hole: hole(4, 7), strokesReceived: 1, raw: 8 }, DE_2026);
    expect(r.raw).toBe(8); // Rohscore bleibt unverändert
    expect(r.netDoubleBogey).toBe(7);
    expect(r.adjusted).toBe(7);
    expect(r.reason).toBe("NET_DOUBLE_BOGEY_LIMIT");
  });

  it("Loch 2: Par 5, 1 Schlag, Rohscore 7 → gewertet 7 (unter NDB 8)", () => {
    const r = calculateHoleGBE({ hole: hole(5, 3), strokesReceived: 1, raw: 7 }, DE_2026);
    expect(r.netDoubleBogey).toBe(8);
    expect(r.adjusted).toBe(7);
    expect(r.reason).toBe("UNCHANGED");
  });

  it("Rohscore genau auf NDB bleibt unverändert", () => {
    const r = calculateHoleGBE({ hole: hole(4, 1), strokesReceived: 2, raw: 8 }, DE_2026);
    expect(r.adjusted).toBe(8);
    expect(r.reason).toBe("UNCHANGED");
  });

  it("nicht beendetes Loch = Netto-Doppelbogey", () => {
    const r = calculateHoleGBE({ hole: hole(4, 1), strokesReceived: 2, raw: "PICKUP" }, DE_2026);
    expect(r.adjusted).toBe(8);
    expect(r.reason).toBe("NOT_COMPLETED");
  });

  it("fehlender Lochscore ist ein Fehler", () => {
    expect(() => calculateHoleGBE({ hole: hole(4, 1), strokesReceived: 0, raw: null }, DE_2026)).toThrow(
      /HOLE_SCORE_MISSING/,
    );
  });

  it("ungültiger Lochscore ist ein Fehler", () => {
    expect(() => calculateHoleGBE({ hole: hole(4, 1), strokesReceived: 0, raw: 0 }, DE_2026)).toThrow(
      /HOLE_SCORE_INVALID/,
    );
  });
});

describe("GBE einer Runde", () => {
  it("18 Löcher, CH 18, überall Bogey → GBE 90", () => {
    const scores = PARS_18.map((p) => p + 1);
    const gbe = calculateGBE({ holes: holes18(), scores, courseHandicap: ch(18) }, DE_2026);
    expect(gbe.total).toBe(90);
    expect(gbe.rawTotal).toBe(90);
  });

  it("Ausreißer werden auf NDB begrenzt, der Rohscore bleibt erhalten", () => {
    const scores = PARS_18.map((p) => p + 1);
    scores[0] = 12; // Par 4, 1 Schlag → NDB 7
    const gbe = calculateGBE({ holes: holes18(), scores, courseHandicap: ch(18) }, DE_2026);
    expect(gbe.rawTotal).toBe(90 - 5 + 12);
    expect(gbe.total).toBe(90 - 5 + 7);
    expect(gbe.holes[0].raw).toBe(12);
    expect(gbe.holes[0].adjusted).toBe(7);
  });

  it("mehrere nicht beendete Löcher", () => {
    const scores: (number | "PICKUP")[] = PARS_18.map((p) => p);
    scores[1] = "PICKUP";
    scores[5] = "PICKUP";
    const gbe = calculateGBE({ holes: holes18(), scores, courseHandicap: ch(0) }, DE_2026);
    expect(gbe.total).toBe(72 + 2 + 2);
    expect(gbe.rawTotal).toBeNull();
  });

  it("CH 54 (HCPI-54-Spieler): NDB je Loch = Par + 5", () => {
    const scores = PARS_18.map((p) => p + 10);
    const gbe = calculateGBE({ holes: holes18(), scores, courseHandicap: ch(54) }, DE_2026);
    expect(gbe.total).toBe(72 + 18 * 5);
  });

  it("9 Löcher mit 9-Loch-Course-Handicap", () => {
    const scores = holesFront9().map((h) => h.par + 3);
    const gbe = calculateGBE({ holes: holesFront9(), scores, courseHandicap: ch(9, 9) }, DE_2026);
    // CH 9 → 1 Schlag je Loch → NDB = Par + 3 → keine Kappung
    expect(gbe.total).toBe(36 + 27);
  });

  it("falsche Anzahl Lochscores ist ein Fehler", () => {
    expect(() =>
      calculateGBE({ holes: holes18(), scores: [4, 4, 4], courseHandicap: ch(10) }, DE_2026),
    ).toThrow(/HOLE_SCORES_INCOMPLETE/);
  });

  it("validateHoleData: Par fehlt → Fehler", () => {
    const holes = holes18();
    holes[2] = { ...holes[2], par: 0 };
    expect(() => validateHoleData(holes, 18)).toThrow(/HOLE_PAR_MISSING/);
  });

  it("validateHoleData: falsche Lochanzahl → Fehler", () => {
    expect(() => validateHoleData(holesFront9(), 18)).toThrow(/HOLE_DATA_INCOMPLETE/);
  });
});
