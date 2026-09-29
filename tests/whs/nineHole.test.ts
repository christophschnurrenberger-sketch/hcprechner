import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import {
  calculateExpectedNineHoleDifferential,
  calculateNineHoleScoreDifferential,
} from "@/rules/whs/de/2026/nineHoleCalculation";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { makeProfile, nineRound, rating9, sdRound, holesFront9, holeByHoleRound } from "./helpers";

describe("Erwartetes 9-Loch-Score-Differential", () => {
  it("HCPI 14,0 → (14,0 × 1,04 + 2,4) / 2 = 8,48 → 8,5", () => {
    const e = calculateExpectedNineHoleDifferential(14.0, DE_2026);
    expect(e.unrounded).toBeCloseTo(8.48, 10);
    expect(e.value).toBe(8.5);
  });

  it("HCPI 49,2 → 26,8", () => {
    expect(calculateExpectedNineHoleDifferential(49.2, DE_2026).value).toBe(26.8);
  });

  it("HCPI 47,8 → 26,1", () => {
    // (47,8 × 1,04 + 2,4) / 2 = 26,056
    expect(calculateExpectedNineHoleDifferential(47.8, DE_2026).value).toBe(26.1);
  });

  it("HCPI 54,0 → 29,3", () => {
    // (56,16 + 2,4) / 2 = 29,28
    expect(calculateExpectedNineHoleDifferential(54, DE_2026).value).toBe(29.3);
  });

  it("HCPI 0,0 → 1,2", () => {
    expect(calculateExpectedNineHoleDifferential(0, DE_2026).value).toBe(1.2);
  });
});

describe("9-Loch-Score-Differential", () => {
  it("TEST 6: HCPI 14,0, GBE 45, CR 35,8, Slope 129 → 8,1 + 8,5 = 16,6", () => {
    const r = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 45, courseRating: 35.8, slopeRating: 129, pcc: 0, handicapIndexBeforeRound: 14.0 },
      DE_2026,
    );
    expect(r.played.value).toBe(8.1);
    expect(r.expected.value).toBe(8.5);
    expect(r.value).toBe(16.6);
    expect(r.value).toBe(r.played.value + r.expected.value);
  });

  it("TEST 7: PCC +1 am Tag wird für 9 Loch zu 0,5", () => {
    const r = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 45, courseRating: 35.8, slopeRating: 129, pcc: 1, handicapIndexBeforeRound: 14.0 },
      DE_2026,
    );
    expect(r.pccApplied).toBe(0.5);
    // 113/129 × (45 − 35,8 − 0,5) = 7,62 → 7,6
    expect(r.played.value).toBe(7.6);
    expect(r.value).toBe(16.1);
  });

  it("der volle 18-Loch-PCC wird nie auf 9 Loch angewendet", () => {
    const full = (113 / 129) * (45 - 35.8 - 1);
    const r = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 45, courseRating: 35.8, slopeRating: 129, pcc: 1, handicapIndexBeforeRound: 14.0 },
      DE_2026,
    );
    expect(r.played.unrounded).not.toBeCloseTo(full, 5);
  });

  it("PCC −1 → −0,5", () => {
    const r = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 45, courseRating: 35.8, slopeRating: 129, pcc: -1, handicapIndexBeforeRound: 14.0 },
      DE_2026,
    );
    expect(r.pccApplied).toBe(-0.5);
  });

  it("die Summe ist frei von Gleitkommarauschen", () => {
    const r = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 58, courseRating: 34.9, slopeRating: 118, pcc: 0, handicapIndexBeforeRound: 36.4 },
      DE_2026,
    );
    expect(String(r.value)).toMatch(/^\d+(\.\d)?$/);
  });

  it("besseres 9-Loch-Ergebnis → kleineres Differential", () => {
    const a = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 44, courseRating: 36, slopeRating: 120, pcc: 0, handicapIndexBeforeRound: 20 },
      DE_2026,
    );
    const b = calculateNineHoleScoreDifferential(
      { adjustedGrossScore: 48, courseRating: 36, slopeRating: 120, pcc: 0, handicapIndexBeforeRound: 20 },
      DE_2026,
    );
    expect(a.value).toBeLessThan(b.value);
  });
});

describe("9-Loch-Runden im Scoring Record", () => {
  it("verwendet den Start-HCPI des Profils für die erste Runde (01.05.: 49,2)", () => {
    const profile = makeProfile({ startHandicapIndex: 49.2 });
    const round = nineRound("2026-05-01", 60);
    const result = calculateScoringRecord(profile, [round], { today: "2026-06-01" });
    const sd = result.rounds[0].scoreDifferential!;
    expect(sd.method).toBe("NINE_EXPECTED");
    expect(sd.handicapIndexForExpected).toBe(49.2);
    expect(sd.expectedDifferential).toBe(26.8);
    // 113/113 × (60 − 36) = 24,0 → 24,0 + 26,8
    expect(sd.value).toBe(50.8);
  });

  it("TEST 15: das erwartete SD verwendet ausschließlich den HCPI VOR der 9-Loch-Runde", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const rounds = [
      sdRound("2026-04-01", 50.0),
      sdRound("2026-04-02", 51.0),
      sdRound("2026-04-03", 52.0),
      nineRound("2026-04-10", 55),
      sdRound("2026-04-20", 30.0),
    ];
    const result = calculateScoringRecord(profile, rounds, { today: "2026-06-01" });
    const nine = result.rounds.find((r) => r.roundId === rounds[3].id)!;
    // Nach 3 Ergebnissen: 50,0 − 2,0 = 48,0 → Start-HCPI am 10.04.
    expect(nine.startHandicapIndex).toBe(48.0);
    expect(nine.scoreDifferential!.handicapIndexForExpected).toBe(48.0);
    // (48,0 × 1,04 + 2,4) / 2 = 26,16 → 26,2
    expect(nine.scoreDifferential!.expectedDifferential).toBe(26.2);
    expect(nine.scoreDifferential!.value).toBe(19.0 + 26.2);
    // Die spätere Verbesserung (ESR, neuer HCPI) verändert die historische 9-Loch-Berechnung nicht
    expect(result.status.currentHandicapIndex).toBe(28.0);
    expect(nine.scoreDifferential!.expectedDifferential).toBe(26.2);
  });

  it("9-Loch-Runde nach einer Verbesserung verwendet den neuen, nicht den alten HCPI", () => {
    const profile = makeProfile({ startHandicapIndex: 49.2, brake265LiftedAt: null });
    const rounds = [
      sdRound("2026-05-01", 45.0),
      sdRound("2026-05-05", 47.0),
      sdRound("2026-05-10", 49.8),
      nineRound("2026-05-15", 60),
    ];
    const result = calculateScoringRecord(profile, rounds, { today: "2026-06-01" });
    // 3 Ergebnisse: 45,0 − 2,0 = 43,0
    expect(result.rounds[3].startHandicapIndex).toBe(43.0);
    expect(result.rounds[3].scoreDifferential!.expectedDifferential).toBe(
      calculateExpectedNineHoleDifferential(43.0, DE_2026).value,
    );
  });

  it("9-Loch-Runde ohne 9-Loch-Rating wird nicht berechnet", () => {
    const round = nineRound("2026-05-01", 45, {
      rating: { holes: 18, par: 72, courseRating: 72, slopeRating: 125 },
    });
    const result = calculateScoringRecord(makeProfile(), [round], { today: "2026-06-01" });
    expect(result.rounds[0].scoreDifferential).toBeUndefined();
    expect(result.rounds[0].issues.map((i) => i.code)).toContain("NINE_HOLE_RATING_REQUIRED");
    expect(result.rounds[0].inRecord).toBe(false);
  });

  it("9-Loch-Scorekarte: NDB mit 9-Loch-Course-Handicap", () => {
    const scores = holesFront9().map((h) => h.par + 6);
    const round = holeByHoleRound("2026-05-01", scores, { rating: rating9() });
    const profile = makeProfile({ startHandicapIndex: 18.0 });
    const result = calculateScoringRecord(profile, [round], { today: "2026-06-01" });
    const r = result.rounds[0];
    // CH₉ = 9,0 × 113/113 + 0 = 9 → 1 Schlag je Loch → NDB = Par + 3
    expect(r.courseHandicap!.kind).toBe(9);
    expect(r.courseHandicap!.rounded).toBe(9);
    expect(r.gbe!.total).toBe(36 + 27);
    expect(r.gbe!.holes.every((h) => h.reason === "NET_DOUBLE_BOGEY_LIMIT")).toBe(true);
  });
});
