import { describe, expect, it } from "vitest";
import {
  normalizeDecimal,
  roundCourseHandicap,
  roundHandicapIndex,
  roundPlayingHandicap,
  roundScoreDifferential,
  roundWHS,
} from "@/rules/whs/de/2026/rounding";

describe("roundWHS – zentrale Rundung", () => {
  it("rundet 18,5822 auf 18,6", () => {
    expect(roundWHS(18.5822, 1)).toBe(18.6);
  });

  it("rundet eine exakte Halbe trotz Gleitkommafehler auf (2,3 + 0,05 → 2,4)", () => {
    const value = 2.3 + 0.05; // Gleitkomma: 2,3499999…
    expect(Math.round(value * 10) / 10).toBe(2.3); // naive Rundung wäre falsch
    expect(roundWHS(value, 1)).toBe(2.4);
  });

  it("rundet 1,005 auf zwei Stellen korrekt auf 1,01", () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1); // naive Rundung wäre falsch
    expect(roundWHS(1.005, 2)).toBe(1.01);
  });

  it("rundet 13,15 auf 13,2", () => {
    expect(roundWHS(10 + 3 + 0.15, 1)).toBe(13.2);
  });

  it("rundet 2,45 auf 2,5 und 2,44 auf 2,4", () => {
    expect(roundWHS(2.45, 1)).toBe(2.5);
    expect(roundWHS(2.44, 1)).toBe(2.4);
  });

  it("rundet negative Halbe im DGV-Modus vom Nullpunkt weg", () => {
    expect(roundWHS(-2.5, 0)).toBe(-3);
    expect(roundWHS(-0.25, 1)).toBe(-0.3);
  });

  it("unterstützt den Modus HALF_UP (Richtung +∞)", () => {
    expect(roundWHS(-2.5, 0, "HALF_UP")).toBe(-2);
    expect(roundWHS(2.5, 0, "HALF_UP")).toBe(3);
  });

  it("liefert nie −0", () => {
    expect(Object.is(roundWHS(-0.04, 1), -0)).toBe(false);
    expect(roundWHS(-0.04, 1)).toBe(0);
  });

  it("wirft bei NaN / Infinity", () => {
    expect(() => roundWHS(Number.NaN)).toThrow(RangeError);
    expect(() => roundWHS(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("wirft bei ungültigen Nachkommastellen", () => {
    expect(() => roundWHS(1, -1)).toThrow(RangeError);
    expect(() => roundWHS(1, 1.5)).toThrow(RangeError);
  });

  it("roundScoreDifferential rundet auf eine Nachkommastelle", () => {
    expect(roundScoreDifferential(43.6473)).toBe(43.6);
    expect(roundScoreDifferential(43.65)).toBe(43.7);
  });

  it("roundHandicapIndex rundet auf eine Nachkommastelle", () => {
    expect(roundHandicapIndex(17.4)).toBe(17.4);
    expect(roundHandicapIndex(13.125)).toBe(13.1);
    expect(roundHandicapIndex(13.175)).toBe(13.2);
  });

  it("roundCourseHandicap rundet auf eine ganze Zahl", () => {
    expect(roundCourseHandicap(57.437)).toBe(57);
    expect(roundCourseHandicap(26.5)).toBe(27);
    expect(roundCourseHandicap(26.49)).toBe(26);
  });

  it("roundPlayingHandicap rundet auf eine ganze Zahl", () => {
    expect(roundPlayingHandicap(20 * 0.95)).toBe(19);
    expect(roundPlayingHandicap(21 * 0.95)).toBe(20);
  });

  it("normalizeDecimal entfernt nur Rauschen aus Summen", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(normalizeDecimal(0.1 + 0.2)).toBe(0.3);
    expect(normalizeDecimal(20.3 + 26.8)).toBe(47.1);
  });
});
