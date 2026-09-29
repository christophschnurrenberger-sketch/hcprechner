import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import { applyCaps, calculateHardCap, calculateSoftCap } from "@/rules/whs/de/2026/cap";
import { applyBrake265 } from "@/rules/whs/de/2026/brake265";
import { calculateCurrentHandicapIndex } from "@/lib/whs";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { makeProfile, sdSeries } from "./helpers";

describe("Soft Cap", () => {
  it("TEST 12: LHI 10,0, Wert 13,4 → 13,2", () => {
    const r = calculateSoftCap(13.4, 10.0, DE_2026);
    expect(r.applied).toBe(true);
    expect(r.after).toBe(13.2);
  });

  it("Anstieg genau 3,0 → kein Soft Cap", () => {
    expect(calculateSoftCap(13.0, 10.0, DE_2026)).toEqual({ applied: false, before: 13.0, after: 13.0 });
  });

  it("Anstieg 3,3 → 13,15 → 13,2", () => {
    expect(calculateSoftCap(13.3, 10.0, DE_2026).after).toBe(13.2);
  });

  it("Wert unter dem LHI → kein Cap", () => {
    expect(calculateSoftCap(9.0, 10.0, DE_2026).applied).toBe(false);
  });
});

describe("Hard Cap", () => {
  it("TEST 13: LHI 10,0, Wert 17,0 → höchstens 15,0", () => {
    const caps = applyCaps(17.0, 10.0, DE_2026);
    expect(caps.softCap.after).toBe(15.0);
    expect(caps.value).toBe(15.0);
  });

  it("LHI 10,0, Wert 20,0 → Soft 16,5 → Hard 15,0", () => {
    const caps = applyCaps(20.0, 10.0, DE_2026);
    expect(caps.softCap.after).toBe(16.5);
    expect(caps.hardCap.applied).toBe(true);
    expect(caps.value).toBe(15.0);
    expect(caps.status).toBe("HARD");
  });

  it("Hard Cap greift nicht unter LHI + 5,0", () => {
    expect(calculateHardCap(14.9, 10.0, DE_2026).applied).toBe(false);
  });

  it("Status SOFT, wenn nur der Soft Cap greift", () => {
    expect(applyCaps(13.4, 10.0, DE_2026).status).toBe("SOFT");
    expect(applyCaps(12.0, 10.0, DE_2026).status).toBe("NONE");
  });
});

describe("26,5-Bremse", () => {
  it("TEST 10: aktuell 40,0, kalkuliert 42,0 → bleibt 40,0", () => {
    const r = applyBrake265({ candidate: 42.0, previousCurrent: 40.0, active: true }, DE_2026);
    expect(r.after).toBe(40.0);
    expect(r.applied).toBe(true);
  });

  it("TEST 11: aktuell 40,0, kalkuliert 38,5 → wird 38,5", () => {
    const r = applyBrake265({ candidate: 38.5, previousCurrent: 40.0, active: true }, DE_2026);
    expect(r.after).toBe(38.5);
    expect(r.applied).toBe(false);
  });

  it("Beispiel: aktuell 49,2, kalkuliert 51,0 → 49,2; kalkuliert 45,6 → 45,6", () => {
    expect(applyBrake265({ candidate: 51.0, previousCurrent: 49.2, active: true }, DE_2026).after).toBe(49.2);
    expect(applyBrake265({ candidate: 45.6, previousCurrent: 49.2, active: true }, DE_2026).after).toBe(45.6);
  });

  it("unter 26,5: Heraufsetzung höchstens bis 26,5", () => {
    const r = applyBrake265({ candidate: 28.0, previousCurrent: 25.0, active: true }, DE_2026);
    expect(r.after).toBe(26.5);
    expect(r.upperBound).toBe(26.5);
  });

  it("unter 26,5 bleibende Werte sind nicht betroffen", () => {
    expect(applyBrake265({ candidate: 26.0, previousCurrent: 25.0, active: true }, DE_2026).after).toBe(26.0);
  });

  it("aufgehobene Bremse: kalkulierter Wert wird aktueller HCPI", () => {
    const r = applyBrake265({ candidate: 42.0, previousCurrent: 40.0, active: false }, DE_2026);
    expect(r.after).toBe(42.0);
    expect(r.active).toBe(false);
  });

  it("calculateCurrentHandicapIndex: Kette Cap → Maximum → Bremse", () => {
    const r = calculateCurrentHandicapIndex({
      calculatedHandicapIndex: 17.0,
      previousCurrentHandicapIndex: 12.0,
      lowHandicapIndex: 10.0,
      brake265Active: true,
    });
    expect(r.cappedHandicapIndex).toBe(15.0);
    expect(r.currentHandicapIndex).toBe(15.0);
  });

  it("Maximum 54,0", () => {
    const r = calculateCurrentHandicapIndex({
      calculatedHandicapIndex: 58.3,
      previousCurrentHandicapIndex: 54,
      brake265Active: false,
    });
    expect(r.calculatedHandicapIndex).toBe(54.0);
    expect(r.currentHandicapIndex).toBe(54.0);
  });
});

describe("Bremse und Cap im chronologischen Scoring Record", () => {
  it("kalkulierter HCPI kann über dem aktuellen liegen", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const rounds = sdSeries("2026-03-01", [50, 52, 53, 54]);
    const result = calculateScoringRecord(profile, rounds, { today: "2026-06-01" });
    expect(result.revisions[2].currentHandicapIndex).toBe(48.0); // 50 − 2
    expect(result.status.calculatedHandicapIndex).toBe(49.0); // 50 − 1
    expect(result.status.currentHandicapIndex).toBe(48.0);
    expect(result.status.brake265Active).toBe(true);
    expect(result.status.brake265Applied).toBe(true);
  });

  it("Aufhebung der Bremse: aktueller HCPI springt ab dem Aufhebungsdatum auf den kalkulierten", () => {
    const profile = makeProfile({ startHandicapIndex: 54, brake265LiftedAt: "2026-03-10" });
    const rounds = sdSeries("2026-03-01", [50, 52, 53, 54]);
    const result = calculateScoringRecord(profile, rounds, { today: "2026-06-01" });
    const last = result.revisions[result.revisions.length - 1];
    expect(last.trigger).toBe("BRAKE_LIFTED");
    expect(last.effectiveFrom).toBe("2026-03-10");
    expect(result.status.currentHandicapIndex).toBe(49.0);
    expect(result.status.brake265Active).toBe(false);
  });

  it("Heraufsetzung aus dem Bereich unter 26,5 höchstens bis 26,5", () => {
    const profile = makeProfile({ startHandicapIndex: 25.0 });
    const result = calculateScoringRecord(profile, sdSeries("2026-03-01", [30, 30, 30]), { today: "2026-06-01" });
    expect(result.status.calculatedHandicapIndex).toBe(28.0);
    expect(result.status.currentHandicapIndex).toBe(26.5);
  });

  it("Soft/Hard Cap nach 20 Ergebnissen mit Low Handicap Index", () => {
    const profile = makeProfile({ startHandicapIndex: 10.0, brake265LiftedAt: "2000-01-01" });
    const rounds = sdSeries("2026-01-01", [
      ...Array.from({ length: 20 }, () => 10),
      ...Array.from({ length: 20 }, () => 20),
    ]);
    const result = calculateScoringRecord(profile, rounds, { today: "2026-06-01" });
    // LHI: niedrigster Wert im Zeitraum = 8,0 (nach 3 Ergebnissen: 10 − 2)
    expect(result.status.lowHandicapIndex?.value).toBe(8.0);
    expect(result.status.calculatedHandicapIndex).toBe(20.0);
    // Soft: 8 + 3 + (12 − 3) × 0,5 = 15,5 → Hard: 8 + 5 = 13,0
    expect(result.revisions[result.revisions.length - 1].softCap?.after).toBe(15.5);
    expect(result.status.capStatus).toBe("HARD");
    expect(result.status.currentHandicapIndex).toBe(13.0);
  });

  it("kein Cap vor 20 Ergebnissen", () => {
    const profile = makeProfile({ startHandicapIndex: 10.0, brake265LiftedAt: "2000-01-01" });
    const rounds = sdSeries("2026-01-01", [10, 10, 10, 10, 10, 20, 20, 20, 20, 20]);
    const result = calculateScoringRecord(profile, rounds, { today: "2026-06-01" });
    expect(result.status.lowHandicapIndex).toBeNull();
    expect(result.status.capStatus).toBe("NONE");
  });
});
