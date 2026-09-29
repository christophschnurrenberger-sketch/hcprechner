import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import {
  calculateScoreDifferential,
  isAllowedPcc,
  nineHolePcc,
} from "@/rules/whs/de/2026/scoreDifferential";

const sd = (adjustedGrossScore: number, courseRating: number, slopeRating: number, pcc = 0) =>
  calculateScoreDifferential({ adjustedGrossScore, courseRating, slopeRating, pcc }, DE_2026);

describe("Score Differential (18 Loch)", () => {
  it("TEST 1: GBE 94, CR 71,8, Slope 135, PCC 0 → 18,6", () => {
    const result = sd(94, 71.8, 135);
    expect(result.unrounded).toBeCloseTo((113 / 135) * (94 - 71.8), 10);
    expect(result.value).toBe(18.6);
  });

  it("GBE 123, CR 72,4, Slope 131 → 43,6", () => {
    expect(sd(123, 72.4, 131).value).toBe(43.6);
  });

  it("Slope 113: SD entspricht GBE − CR", () => {
    expect(sd(90, 72.0, 113).value).toBe(18.0);
  });

  it("PCC +1 verringert das SD", () => {
    expect(sd(94, 71.8, 135, 1).value).toBe(17.7);
  });

  it("PCC −1 erhöht das SD", () => {
    expect(sd(94, 71.8, 135, -1).value).toBe(19.4);
  });

  it("PCC +3 wird voll abgezogen", () => {
    expect(sd(94, 71.8, 135, 3).value).toBe(16.1);
  });

  it("ein Ergebnis unter dem Course Rating ergibt ein negatives SD", () => {
    expect(sd(70, 72.0, 113).value).toBe(-2.0);
  });

  it("höherer Slope → kleineres SD bei gleichem GBE", () => {
    expect(sd(100, 72, 140).value).toBeLessThan(sd(100, 72, 120).value);
  });

  it("wirft bei Slope außerhalb 55–155", () => {
    expect(() => sd(90, 72, 54)).toThrow(RangeError);
    expect(() => sd(90, 72, 156)).toThrow(RangeError);
  });

  it("wirft bei fehlendem GBE", () => {
    expect(() => sd(Number.NaN, 72, 113)).toThrow(RangeError);
  });
});

describe("PCC", () => {
  it("zulässig sind −1 bis +3", () => {
    expect([-1, 0, 1, 2, 3].every((p) => isAllowedPcc(p, DE_2026))).toBe(true);
    expect(isAllowedPcc(4, DE_2026)).toBe(false);
    expect(isAllowedPcc(-2, DE_2026)).toBe(false);
    expect(isAllowedPcc(0.5, DE_2026)).toBe(false);
  });

  it("TEST 7: 9-Loch-PCC nach DGV-Tabelle (+1 → 0,5)", () => {
    expect(nineHolePcc(1, DE_2026)).toBe(0.5);
  });

  it("9-Loch-PCC: 0 → 0, −1 → −0,5, +2 → 1,0, +3 → 1,5", () => {
    expect(nineHolePcc(0, DE_2026)).toBe(0);
    expect(nineHolePcc(-1, DE_2026)).toBe(-0.5);
    expect(nineHolePcc(2, DE_2026)).toBe(1.0);
    expect(nineHolePcc(3, DE_2026)).toBe(1.5);
  });

  it("9-Loch-PCC wirft bei unzulässigem Wert", () => {
    expect(() => nineHolePcc(4, DE_2026)).toThrow(RangeError);
  });
});
