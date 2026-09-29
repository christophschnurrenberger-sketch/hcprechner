import { describe, expect, it } from "vitest";
import { analyzeTarget, differentialRound, maxGrossForDifferential, simulateRound } from "@/lib/whs/simulation";
import { calculateStatistics } from "@/lib/whs/statistics";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { makeProfile, sdSeries, agsRound } from "./helpers";

const TODAY = "2026-09-29";
const profile = makeProfile({ startHandicapIndex: 30, brake265LiftedAt: "2000-01-01" });

function fullRecord() {
  const values = [25, 22, 29, 27, 20, 21, 24, 27, 21, 23, 23, 26, 28, 23, 20, 25, 26, 28, 24, 22];
  return sdSeries("2026-06-01", values).map((r) => ({ ...r, entry: { ...r.entry, suppressEsr: true } }));
}

describe("Was-wäre-wenn", () => {
  it("zeigt neuen HCPI, Rang und das herausfallende (älteste) Ergebnis", () => {
    const rounds = fullRecord();
    const hypothetical = differentialRound("what-if", "2026-10-01", 18.0);
    const r = simulateRound(profile, rounds, hypothetical, { today: TODAY });
    expect(r.before.recordSize).toBe(20);
    expect(r.rankInWindow).toBe(1);
    expect(r.counted).toBe(true);
    expect(r.dropped?.roundId).toBe(rounds[0].id);
    expect(r.change).toBeLessThan(0);
    expect(r.after.currentHandicapIndex).toBe(r.before.currentHandicapIndex + r.change);
  });

  it("ein schlechtes Ergebnis gehört nicht zu den besten 8", () => {
    const r = simulateRound(profile, fullRecord(), differentialRound("w", "2026-10-01", 40.0), { today: TODAY });
    expect(r.counted).toBe(false);
    expect(r.rankInWindow).toBe(20);
  });

  it("verändert die gespeicherten Runden nicht", () => {
    const rounds = fullRecord();
    const copy = JSON.stringify(rounds);
    simulateRound(profile, rounds, differentialRound("w", "2026-10-01", 18.0), { today: TODAY });
    expect(JSON.stringify(rounds)).toBe(copy);
  });
});

describe("Ziel-HCPI", () => {
  it("findet das höchste Score Differential, mit dem eine Runde das Ziel erreicht", () => {
    const rounds = fullRecord();
    const base = calculateScoringRecord(profile, rounds, { today: TODAY }).status.currentHandicapIndex;
    const target = base - 0.5;
    const analysis = analyzeTarget(profile, rounds, target, { today: TODAY });
    expect(analysis.alreadyReached).toBe(false);
    expect(analysis.singleRound.achievable).toBe(true);
    expect(analysis.singleRound.resultingHandicapIndex!).toBeLessThanOrEqual(target);
    // 0,1 schlechter reicht nicht mehr
    const worse = simulateRound(
      profile,
      rounds,
      differentialRound("w", analysis.date, analysis.singleRound.maxDifferential! + 0.1),
      { today: TODAY },
    );
    expect(worse.after.currentHandicapIndex).toBeGreaterThan(target);
  });

  it("unerreichbares Ziel mit einer Runde wird erkannt", () => {
    const analysis = analyzeTarget(profile, fullRecord(), 5.0, { today: TODAY, scenarioDifferentials: [20] });
    expect(analysis.singleRound.achievable).toBe(false);
    expect(analysis.scenarios[0].roundsNeeded).toBeNull();
  });

  it("Szenario: Anzahl Runden mit gleichem SD bis zum Ziel", () => {
    const analysis = analyzeTarget(profile, fullRecord(), 20.5, { today: TODAY, scenarioDifferentials: [19] });
    expect(analysis.scenarios[0].roundsNeeded).toBeGreaterThan(0);
    expect(analysis.scenarios[0].resultingHandicapIndex!).toBeLessThanOrEqual(20.5);
    expect(analysis.nextToDrop[0].order).toBe(1);
  });
});

describe("Maximales GBE für ein Ziel-Differential", () => {
  it("18 Loch: CR 72,0, Slope 113 → SD ≤ 18,0 bei GBE 90", () => {
    expect(
      maxGrossForDifferential({
        targetDifferential: 18.0,
        holes: 18,
        courseRating: 72,
        slopeRating: 113,
        pcc: 0,
        handicapIndexBeforeRound: 20,
      }),
    ).toBe(90);
  });

  it("9 Loch berücksichtigt das erwartete Differential", () => {
    // HCPI 14 → erwartet 8,5; Ziel 16,6 → gespielt ≤ 8,1 → GBE₉ 45 auf CR 35,8/Slope 129
    expect(
      maxGrossForDifferential({
        targetDifferential: 16.6,
        holes: 9,
        courseRating: 35.8,
        slopeRating: 129,
        pcc: 0,
        handicapIndexBeforeRound: 14,
      }),
    ).toBe(45);
  });
});

describe("Statistik", () => {
  it("Durchschnitt, Median, bestes und schlechtestes Differential", () => {
    const rounds = [agsRound("2026-05-01", 90), agsRound("2026-05-02", 95), agsRound("2026-05-03", 100)];
    const result = calculateScoringRecord(makeProfile(), rounds, { today: TODAY });
    const stats = calculateStatistics(result, rounds);
    expect(stats.differentials.count).toBe(3);
    expect(stats.differentials.best).toBe(18.0);
    expect(stats.differentials.worst).toBe(28.0);
    expect(stats.differentials.median).toBe(23.0);
    expect(stats.gross18.average).toBe(95);
    expect(stats.courses[0].rounds).toBe(3);
    expect(stats.eighteenHoleRounds).toBe(3);
  });
});
