import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import { calculateExceptionalScoreReduction, combineSameDayReductions } from "@/rules/whs/de/2026/exceptionalScore";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { addDays } from "@/lib/whs/dates";
import { makeProfile, nineRound, sdRound, sdSeries } from "./helpers";

const esr = (hi: number, sd: number) =>
  calculateExceptionalScoreReduction({ handicapIndexBeforeRound: hi, scoreDifferential: sd }, DE_2026);

describe("Exceptional Score Reduction – Schwellen", () => {
  it("TEST 8: HCPI 30,0, SD 23,0 → Differenz 7,0 → −1", () => {
    expect(esr(30.0, 23.0)).toEqual({ difference: 7.0, reduction: -1 });
  });

  it("TEST 9: HCPI 30,0, SD 20,0 → Differenz 10,0 → −2", () => {
    expect(esr(30.0, 20.0)).toEqual({ difference: 10.0, reduction: -2 });
  });

  it("HCPI 30,0, SD 22,5 → 7,5 → −1", () => {
    expect(esr(30.0, 22.5).reduction).toBe(-1);
  });

  it("HCPI 30,0, SD 19,5 → 10,5 → −2", () => {
    expect(esr(30.0, 19.5).reduction).toBe(-2);
  });

  it("Differenz 6,9 → kein ESR", () => {
    expect(esr(30.0, 23.1).reduction).toBe(0);
  });

  it("Differenz 9,9 → −1", () => {
    expect(esr(30.0, 20.1).reduction).toBe(-1);
  });

  it("schlechteres Ergebnis → kein ESR", () => {
    expect(esr(30.0, 35.0)).toEqual({ difference: -5.0, reduction: 0 });
  });

  it("Gleitkomma: 18,3 − 11,3 ergibt exakt 7,0", () => {
    expect(esr(18.3, 11.3).reduction).toBe(-1);
  });

  it("mehrere außergewöhnliche Ergebnisse am selben Tag werden addiert", () => {
    expect(combineSameDayReductions([-1, -2], DE_2026)).toBe(-3);
    expect(combineSameDayReductions([], DE_2026)).toBe(0);
  });
});

describe("ESR im Scoring Record", () => {
  const lifted = makeProfile({ startHandicapIndex: 30.0, brake265LiftedAt: "2000-01-01" });

  it("wird rückwirkend auf die vorhandenen Score Differentials angewendet", () => {
    const rounds = [...sdSeries("2026-03-01", [30, 30, 30, 30, 30]), sdRound("2026-03-06", 20.0)];
    const result = calculateScoringRecord(lifted, rounds, { today: "2026-06-01" });
    const exceptional = result.rounds[5];
    expect(exceptional.startHandicapIndex).toBe(30.0);
    expect(exceptional.esr).toEqual({ difference: 10.0, reduction: -2 });
    expect(result.record.map((e) => e.originalSD)).toEqual([30, 30, 30, 30, 30, 20]);
    expect(result.record.map((e) => e.adjustedSD)).toEqual([28, 28, 28, 28, 28, 18]);
    // 6 Ergebnisse: (18 + 28) / 2 − 1 = 22,0
    expect(result.status.currentHandicapIndex).toBe(22.0);
  });

  it("originalSD und adjustedSD werden getrennt geführt", () => {
    const rounds = [...sdSeries("2026-03-01", [30, 30, 30, 30, 30]), sdRound("2026-03-06", 20.0)];
    const result = calculateScoringRecord(lifted, rounds, { today: "2026-06-01" });
    const first = result.rounds[0];
    expect(first.scoreDifferential!.value).toBe(30);
    expect(first.finalAdjustedSD).toBe(28);
    expect(first.finalEsrTotal).toBe(-2);
  });

  it("eine spätere normale Runde erhält den alten ESR-Abzug nicht", () => {
    const rounds = [
      ...sdSeries("2026-03-01", [30, 30, 30, 30, 30]),
      sdRound("2026-03-06", 20.0),
      sdRound("2026-03-07", 30.0),
    ];
    const result = calculateScoringRecord(lifted, rounds, { today: "2026-06-01" });
    const last = result.record[result.record.length - 1];
    expect(last.originalSD).toBe(30);
    expect(last.adjustedSD).toBe(30);
    expect(last.esrAdjustments).toHaveLength(0);
  });

  it("gilt nur für die jüngsten 20 Ergebnisse", () => {
    const rounds = [...sdSeries("2026-01-01", Array.from({ length: 24 }, () => 30)), sdRound("2026-02-01", 18.0)];
    const result = calculateScoringRecord(lifted, rounds, { today: "2026-06-01" });
    expect(result.rounds[24].esr?.reduction).toBe(-2);
    result.record.slice(0, 5).forEach((e) => expect(e.esrAdjustments).toHaveLength(0));
    result.record.slice(5).forEach((e) => expect(e.adjustedSD).toBe(e.originalSD - 2));
    // beste 8 von [28 × 19, 16] → (16 + 7 × 28) / 8 = 26,5
    expect(result.status.calculatedHandicapIndex).toBe(26.5);
  });

  it("zwei außergewöhnliche Ergebnisse am selben Tag: beide gegen denselben Start-HCPI, Abzüge addiert", () => {
    const rounds = [
      ...sdSeries("2026-03-01", [30, 30, 30, 30, 30]),
      sdRound("2026-03-10", 22.5, { sequence: 0 }),
      sdRound("2026-03-10", 19.5, { sequence: 1 }),
    ];
    const result = calculateScoringRecord(lifted, rounds, { today: "2026-06-01" });
    const [a, b] = result.rounds.slice(5);
    expect(a.startHandicapIndex).toBe(30.0);
    expect(b.startHandicapIndex).toBe(30.0);
    expect(a.esr?.reduction).toBe(-1);
    expect(b.esr?.reduction).toBe(-2);
    expect(result.record[0].adjustedSD).toBe(27);
    expect(result.revisions[result.revisions.length - 1].esr).toEqual({ value: -3, roundIds: [a.roundId, b.roundId] });
  });

  it("9-Loch-Runde: ESR wird mit dem 18-Loch-Differential gegen den Start-HCPI geprüft", () => {
    const profile = makeProfile({ startHandicapIndex: 30.0, brake265LiftedAt: "2000-01-01" });
    // 9 Loch: GBE 36 auf CR 36/Slope 113 → 0,0 + erwartet (30 × 1,04 + 2,4)/2 = 16,8 → SD 16,8
    const result = calculateScoringRecord(profile, [nineRound("2026-03-01", 36)], { today: "2026-06-01" });
    expect(result.rounds[0].scoreDifferential!.value).toBe(16.8);
    expect(result.rounds[0].esr).toEqual({ difference: 13.2, reduction: -2 });
  });

  it("importierte Differentials können von der ESR-Prüfung ausgenommen werden", () => {
    const round = sdRound(addDays("2026-03-01", 0), 10, {
      entry: { mode: "SCORE_DIFFERENTIAL", scoreDifferential: 10, suppressEsr: true },
    });
    const result = calculateScoringRecord(lifted, [round], { today: "2026-06-01" });
    expect(result.rounds[0].esr).toBeNull();
  });
});
