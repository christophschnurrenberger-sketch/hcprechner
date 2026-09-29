import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import {
  calculateGbeFromStablefordHoles,
  calculateGbeFromStablefordTotal,
  stablefordPointsForHole,
} from "@/rules/whs/de/2026/stableford";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import type { CourseHandicapResult } from "@/lib/whs/types";
import { baseRound, holes18, makeProfile, PARS_18 } from "./helpers";

const ch = (rounded: number): CourseHandicapResult => ({
  kind: 18,
  handicapIndex: rounded,
  slopeRating: 113,
  courseRating: 72,
  par: 72,
  unrounded: rounded,
  rounded,
});

describe("Stableford", () => {
  it("Punkte je Loch: Netto-Par = 2 Punkte, NDB = 0 Punkte", () => {
    expect(stablefordPointsForHole(5, 4, 1)).toBe(2);
    expect(stablefordPointsForHole(4, 4, 1)).toBe(3);
    expect(stablefordPointsForHole(7, 4, 1)).toBe(0);
    expect(stablefordPointsForHole("PICKUP", 4, 1)).toBe(0);
  });

  it("GBE aus lochweisen Punkten (Playing Handicap = Course Handicap)", () => {
    const points = PARS_18.map(() => 2); // überall Netto-Par
    const gbe = calculateGbeFromStablefordHoles({ holes: holes18(), points, courseHandicap: ch(18) }, DE_2026);
    expect(gbe.total).toBe(90);
  });

  it("0 Punkte → Netto-Doppelbogey", () => {
    const points = PARS_18.map(() => 2);
    points[0] = 0;
    const gbe = calculateGbeFromStablefordHoles({ holes: holes18(), points, courseHandicap: ch(18) }, DE_2026);
    expect(gbe.holes[0].adjusted).toBe(7);
    expect(gbe.holes[0].reason).toBe("FROM_STABLEFORD_ZERO_POINTS");
    expect(gbe.total).toBe(92); // 90 − 5 (Netto-Par) + 7 (NDB)
  });

  it("Playing Handicap < Course Handicap: 0 Punkte auf einem Loch mit Mehrschlag sind nicht eindeutig", () => {
    const points = PARS_18.map(() => 2);
    points[3] = 0; // Loch 4 = SI 1: CH 20 → 2 Schläge, PH 19 → 2 Schläge → eindeutig
    points[1] = 0; // Loch 2 = SI 3: CH 20 → 1, PH 19 → 1 → eindeutig
    expect(() =>
      calculateGbeFromStablefordHoles(
        { holes: holes18(), points: points.map((p, i) => (i === 3 ? 2 : p)), courseHandicap: ch(20), playingHandicap: 19 },
        DE_2026,
      ),
    ).not.toThrow();
    const ambiguous = PARS_18.map(() => 2);
    ambiguous[9] = 0; // Loch 10 = SI 8: CH 20 → 1 Schlag, PH 7 → 0 Schläge
    expect(() =>
      calculateGbeFromStablefordHoles(
        { holes: holes18(), points: ambiguous, courseHandicap: ch(20), playingHandicap: 7 },
        DE_2026,
      ),
    ).toThrow(/STABLEFORD_ZERO_POINTS_AMBIGUOUS/);
  });

  it("nicht eindeutiges Loch kann mit Rohschlägen ergänzt werden", () => {
    const points = PARS_18.map(() => 2);
    points[9] = 0;
    const overrides = PARS_18.map(() => null as number | null);
    overrides[9] = 6;
    const gbe = calculateGbeFromStablefordHoles(
      { holes: holes18(), points, grossOverrides: overrides, courseHandicap: ch(20), playingHandicap: 7 },
      DE_2026,
    );
    expect(gbe.holes[9].adjusted).toBe(6);
  });

  it("Gesamtpunkte: nur mit bestätigter 100-%-Verrechnung exakt (GBE = Par + CH + 36 − Punkte)", () => {
    const r = calculateGbeFromStablefordTotal(
      { total: 36, par: 72, holes: 18, courseHandicap: 18, fullAllowanceConfirmed: true },
      DE_2026,
    );
    expect(r).toEqual({ possible: true, adjustedGrossScore: 90, reasonCode: null });
  });

  it("Gesamtpunkte ohne Bestätigung → keine exakte Berechnung möglich", () => {
    const r = calculateGbeFromStablefordTotal(
      { total: 36, par: 72, holes: 18, courseHandicap: 18, fullAllowanceConfirmed: false },
      DE_2026,
    );
    expect(r.possible).toBe(false);
    expect(r.reasonCode).toBe("STABLEFORD_TOTAL_AMBIGUOUS");
  });

  it("Gesamtpunkte mit abweichendem Playing Handicap → keine exakte Berechnung möglich", () => {
    const r = calculateGbeFromStablefordTotal(
      { total: 36, par: 72, holes: 18, courseHandicap: 18, fullAllowanceConfirmed: true, playingHandicap: 17 },
      DE_2026,
    );
    expect(r.possible).toBe(false);
  });

  it("Gesamtpunkte: Formel entspricht lochweiser Berechnung", () => {
    const points = [3, 2, 1, 0, 2, 2, 4, 1, 2, 2, 0, 3, 2, 2, 1, 2, 2, 1];
    const total = points.reduce((a, b) => a + b, 0);
    const holes = calculateGbeFromStablefordHoles({ holes: holes18(), points, courseHandicap: ch(24) }, DE_2026);
    const fromTotal = calculateGbeFromStablefordTotal(
      { total, par: 72, holes: 18, courseHandicap: 24, fullAllowanceConfirmed: true },
      DE_2026,
    );
    expect(fromTotal.adjustedGrossScore).toBe(holes.total);
  });

  it("im Scoring Record: Gesamtpunkte ohne Bestätigung ergeben einen Hinweis statt eines Werts", () => {
    const round = baseRound({
      date: "2026-05-01",
      format: "STABLEFORD",
      entry: { mode: "STABLEFORD_TOTAL", stablefordTotal: 30 },
    });
    const r = calculateScoringRecord(makeProfile(), [round], { today: "2026-06-01" }).rounds[0];
    expect(r.scoreDifferential).toBeUndefined();
    expect(r.issues.map((i) => i.code)).toContain("STABLEFORD_TOTAL_AMBIGUOUS");
  });
});
