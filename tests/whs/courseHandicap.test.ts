import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import {
  calculateCourseHandicap,
  calculateNineHoleCourseHandicap,
  calculatePlayingHandicap,
} from "@/rules/whs/de/2026/courseHandicap";

describe("Course Handicap 18 Loch", () => {
  it("HCPI 49,2, Slope 131, CR 72,4, Par 72 → 57", () => {
    const ch = calculateCourseHandicap(
      { handicapIndex: 49.2, slopeRating: 131, courseRating: 72.4, par: 72 },
      DE_2026,
    );
    expect(ch.unrounded).toBeCloseTo(49.2 * (131 / 113) + 0.4, 10);
    expect(ch.rounded).toBe(57);
    expect(ch.kind).toBe(18);
  });

  it("verwendet intern den ungerundeten Wert (keine Zwischenrundung)", () => {
    const ch = calculateCourseHandicap(
      { handicapIndex: 14.3, slopeRating: 128, courseRating: 71.2, par: 72 },
      DE_2026,
    );
    // 14,3 × 128/113 = 16,198… − 0,8 = 15,398… → 15
    expect(ch.unrounded).toBeCloseTo(15.398, 3);
    expect(ch.rounded).toBe(15);
  });

  it("Slope 113 und CR = Par: Course Handicap = HCPI gerundet", () => {
    const ch = calculateCourseHandicap(
      { handicapIndex: 18.5, slopeRating: 113, courseRating: 72, par: 72 },
      DE_2026,
    );
    expect(ch.rounded).toBe(19);
  });

  it("Plus-Handicap ergibt negatives Course Handicap", () => {
    const ch = calculateCourseHandicap(
      { handicapIndex: -2.0, slopeRating: 130, courseRating: 72, par: 72 },
      DE_2026,
    );
    expect(ch.rounded).toBe(-2);
  });

  it("wirft bei ungültigem Slope", () => {
    expect(() =>
      calculateCourseHandicap({ handicapIndex: 10, slopeRating: 20, courseRating: 72, par: 72 }, DE_2026),
    ).toThrow(RangeError);
  });
});

describe("Course Handicap 9 Loch", () => {
  it("rundet HCPI/2 vor der weiteren Berechnung auf eine Nachkommastelle", () => {
    const ch = calculateNineHoleCourseHandicap(
      { handicapIndex: 49.3, slopeRating: 125, courseRating: 35.2, par: 36 },
      DE_2026,
    );
    expect(ch.halvedHandicapIndex).toBe(24.7); // 24,65 → 24,7
    expect(ch.unrounded).toBeCloseTo(24.7 * (125 / 113) - 0.8, 10);
    expect(ch.rounded).toBe(27);
    expect(ch.kind).toBe(9);
  });

  it("HCPI 21,1: 10,55 wird zu 10,6 gerundet, Course Handicap 11", () => {
    // 21,1/2 = 10,55 → 10,6; 10,6 × 120/113 − 0,5 = 10,757 → 11
    const ch = calculateNineHoleCourseHandicap(
      { handicapIndex: 21.1, slopeRating: 120, courseRating: 35.5, par: 36 },
      DE_2026,
    );
    expect(ch.halvedHandicapIndex).toBe(10.6);
    expect(ch.rounded).toBe(11);
  });

  it("HCPI 14,0 auf 9-Loch-Rating CR 35,8 / Slope 129 / Par 36", () => {
    const ch = calculateNineHoleCourseHandicap(
      { handicapIndex: 14.0, slopeRating: 129, courseRating: 35.8, par: 36 },
      DE_2026,
    );
    // 7,0 × 129/113 − 0,2 = 7,791 → 8
    expect(ch.rounded).toBe(8);
  });
});

describe("Playing Handicap", () => {
  it("Course Handicap 20 × 95 % = 19", () => {
    expect(calculatePlayingHandicap(20, 0.95, DE_2026)).toBe(19);
  });

  it("100 % Verrechnung lässt das Course Handicap unverändert", () => {
    expect(calculatePlayingHandicap(33, 1, DE_2026)).toBe(33);
  });

  it("verlangt ein gerundetes Course Handicap", () => {
    expect(() => calculatePlayingHandicap(20.4, 0.95, DE_2026)).toThrow(RangeError);
  });
});
