import { describe, expect, it } from "vitest";
import { calculateScoringRecord, handicapIndexInEffectOn, sortRoundsChronologically } from "@/lib/whs/scoringRecord";
import { addDays } from "@/lib/whs/dates";
import { agsRound, baseRound, makeProfile, nineRound, rating18, sdRound, sdSeries } from "./helpers";

const TODAY = "2026-09-29";

describe("Chronologische Berechnung", () => {
  it("sortiert nach Datum, dann Reihenfolge am Tag – unabhängig von der Eingabereihenfolge", () => {
    const a = sdRound("2026-05-03", 30);
    const b = sdRound("2026-05-01", 31);
    const c = sdRound("2026-05-02", 32, { sequence: 1 });
    const d = sdRound("2026-05-02", 33, { sequence: 0 });
    expect(sortRoundsChronologically([a, b, c, d]).map((r) => r.id)).toEqual([b.id, d.id, c.id, a.id]);
  });

  it("jede Runde erhält den HCPI nach der vorherigen Runde als Start-HCPI", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const rounds = sdSeries("2026-03-01", [50, 51, 52, 49, 48]);
    const result = calculateScoringRecord(profile, rounds, { today: TODAY });
    const starts = result.rounds.map((r) => r.startHandicapIndex);
    // 1–2 Ergebnisse: Start-HCPI bleibt; ab 3: 50 − 2 = 48; 4: 49 − 1 = 48; 5: 48
    expect(starts).toEqual([54, 54, 54, 48, 48]);
    expect(result.status.currentHandicapIndex).toBe(48.0);
  });

  it("mit 1–2 Ergebnissen gibt es noch keinen kalkulierten HCPI", () => {
    const result = calculateScoringRecord(makeProfile(), sdSeries("2026-03-01", [50, 51]), { today: TODAY });
    expect(result.status.calculatedHandicapIndex).toBeNull();
    expect(result.status.currentHandicapIndex).toBe(54);
    expect(result.revisions[1].noChangeReason).toBe("TOO_FEW_SCORES");
  });

  it("der neue HCPI gilt ab dem Folgetag", () => {
    const result = calculateScoringRecord(makeProfile(), sdSeries("2026-03-01", [50, 51, 52]), { today: TODAY });
    expect(result.revisions[2].date).toBe("2026-03-03");
    expect(result.revisions[2].effectiveFrom).toBe("2026-03-04");
    expect(handicapIndexInEffectOn(result, "2026-03-03")).toBe(54);
    expect(handicapIndexInEffectOn(result, "2026-03-04")).toBe(48);
  });

  it("nachträglich eingefügte ältere Runde verändert den Verlauf danach korrekt", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const rounds = sdSeries("2026-03-01", [50, 51, 52]);
    const before = calculateScoringRecord(profile, rounds, { today: TODAY });
    const inserted = sdRound("2026-02-15", 49);
    const after = calculateScoringRecord(profile, [...rounds, inserted], { today: TODAY });
    expect(before.rounds[2].startHandicapIndex).toBe(54);
    expect(after.rounds[0].roundId).toBe(inserted.id);
    // jetzt ist die Runde vom 03.03. bereits die vierte → Start-HCPI 47 (49 − 2)
    expect(after.rounds[3].startHandicapIndex).toBe(47.0);
  });

  it("es werden maximal 20 Ergebnisse berücksichtigt, die Historie bleibt vollständig", () => {
    const profile = makeProfile({ startHandicapIndex: 30, brake265LiftedAt: "2000-01-01" });
    const values = Array.from({ length: 30 }, (_, i) => 20 + (i % 7));
    const result = calculateScoringRecord(profile, sdSeries("2026-01-01", values), { today: TODAY });
    expect(result.record).toHaveLength(30);
    expect(result.status.window).toHaveLength(20);
    expect(result.status.recordSize).toBe(20);
    expect(result.rounds.filter((r) => r.currentlyInWindow)).toHaveLength(20);
    expect(result.rounds[0].currentExclusionReason).toBe("OUTSIDE_WINDOW");
  });

  it("die 8 verwendeten Ergebnisse sind markiert", () => {
    const profile = makeProfile({ startHandicapIndex: 30, brake265LiftedAt: "2000-01-01" });
    const values = [25, 12, 29, 17, 10, 21, 14, 27, 11, 19, 23, 16, 28, 13, 20, 15, 26, 18, 24, 22];
    const result = calculateScoringRecord(
      profile,
      sdSeries("2026-01-01", values).map((r) => ({
        ...r,
        entry: { ...r.entry, suppressEsr: true },
      })),
      { today: TODAY },
    );
    const counted = result.status.window.filter((w) => w.counted).map((w) => w.adjustedSD).sort((a, b) => a - b);
    expect(counted).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(result.status.usedCount).toBe(8);
    expect(result.status.calculatedHandicapIndex).toBe(13.5);
    const notCounted = result.rounds.find((r) => r.scoreDifferential?.value === 29)!;
    expect(notCounted.currentExclusionReason).toBe("NOT_IN_BEST");
  });
});

describe("Mehrere Runden am selben Tag (DGV-Tageslogik)", () => {
  it("TEST 14: beide Runden erhalten denselben Start-HCPI", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const rounds = [
      ...sdSeries("2026-03-01", [50, 51, 52]),
      sdRound("2026-03-10", 40, { sequence: 0 }),
      sdRound("2026-03-10", 45, { sequence: 1 }),
    ];
    const result = calculateScoringRecord(profile, rounds, { today: TODAY });
    const [a, b] = result.rounds.slice(3);
    expect(a.startHandicapIndex).toBe(48.0);
    expect(b.startHandicapIndex).toBe(48.0);
    // ein gemeinsamer HCPI-Schritt für den Tag
    expect(result.revisions).toHaveLength(4);
    expect(a.revision).toBe(b.revision);
  });

  it("9-Loch-Runde am selben Tag verwendet ebenfalls den Tages-Start-HCPI", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const rounds = [
      ...sdSeries("2026-03-01", [50, 51, 52]),
      sdRound("2026-03-10", 40, { sequence: 0 }),
      nineRound("2026-03-10", 55, { sequence: 1 }),
    ];
    const result = calculateScoringRecord(profile, rounds, { today: TODAY });
    const nine = result.rounds[4];
    expect(nine.startHandicapIndex).toBe(48.0);
    expect(nine.scoreDifferential!.handicapIndexForExpected).toBe(48.0);
  });

  it("die Reihenfolge am Tag ändert die Start-HCPI nicht", () => {
    const profile = makeProfile({ startHandicapIndex: 54 });
    const base = sdSeries("2026-03-01", [50, 51, 52]);
    const r1 = calculateScoringRecord(
      profile,
      [...base, sdRound("2026-03-10", 40, { sequence: 0 }), sdRound("2026-03-10", 45, { sequence: 1 })],
      { today: TODAY },
    );
    const r2 = calculateScoringRecord(
      profile,
      [...base, sdRound("2026-03-10", 40, { sequence: 1 }), sdRound("2026-03-10", 45, { sequence: 0 })],
      { today: TODAY },
    );
    expect(r1.status.currentHandicapIndex).toBe(r2.status.currentHandicapIndex);
  });
});

describe("Ratings je Runde (historisch, unveränderlich)", () => {
  it("unterschiedliche CR/Slope derselben Anlage ergeben unterschiedliche SDs", () => {
    const old = agsRound("2026-05-01", 95, { rating: rating18({ courseRating: 71.8, slopeRating: 129 }) });
    const newer = agsRound("2027-05-01", 95, { rating: rating18({ courseRating: 72.1, slopeRating: 131 }) });
    const result = calculateScoringRecord(makeProfile(), [old, newer], { today: "2027-06-01" });
    // 113/129 × 23,2 = 20,3 | 113/131 × 22,9 = 19,8
    expect(result.rounds[0].scoreDifferential!.value).toBe(20.3);
    expect(result.rounds[1].scoreDifferential!.value).toBe(19.8);
  });

  it("unterschiedliche Abschläge (Gelb/Rot) werden mit ihrem eigenen Rating gerechnet", () => {
    const yellow = agsRound("2026-05-01", 100, { rating: rating18({ courseRating: 72.4, slopeRating: 131 }) });
    const red = agsRound("2026-05-02", 100, {
      course: { courseName: "Testplatz", country: "DE", teeColor: "Rot", gender: "F" },
      rating: rating18({ courseRating: 74.0, slopeRating: 128 }),
    });
    const result = calculateScoringRecord(makeProfile(), [yellow, red], { today: TODAY });
    expect(result.rounds[0].scoreDifferential!.courseRating).toBe(72.4);
    expect(result.rounds[1].scoreDifferential!.courseRating).toBe(74.0);
    expect(result.rounds[0].scoreDifferential!.value).not.toBe(result.rounds[1].scoreDifferential!.value);
  });

  it("die Berechnung ist reproduzierbar (gleiche Eingabe → gleiches Ergebnis)", () => {
    const rounds = sdSeries("2026-01-01", [30, 28, 35, 31, 27, 29, 33]);
    const a = calculateScoringRecord(makeProfile({ startHandicapIndex: 36 }), rounds, { today: TODAY });
    const b = calculateScoringRecord(makeProfile({ startHandicapIndex: 36 }), [...rounds].reverse(), { today: TODAY });
    expect(a.status).toEqual(b.status);
  });
});

describe("Fehlende und ungültige Werte", () => {
  it("fehlendes Course Rating → Fehler, nicht im Scoring Record", () => {
    const round = agsRound("2026-05-01", 95, { rating: rating18({ courseRating: null }) });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("COURSE_RATING_MISSING");
    expect(r.inRecord).toBe(false);
    expect(r.relevance.relevant).toBe(false);
  });

  it("fehlendes Slope Rating → Fehler", () => {
    const round = agsRound("2026-05-01", 95, { rating: rating18({ slopeRating: null }) });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("SLOPE_RATING_MISSING");
  });

  it("fehlendes Par bei Scorekarte → Fehler", () => {
    const round = baseRound({
      date: "2026-05-01",
      rating: rating18({ par: null }),
      holeData: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
      entry: { mode: "HOLE_BY_HOLE", holeScores: Array.from({ length: 18 }, () => 5) },
    });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("PAR_MISSING");
    expect(r.inRecord).toBe(false);
  });

  it("fehlendes Par bei direkt eingegebenem GBE → SD wird berechnet, Warnung", () => {
    const round = agsRound("2026-05-01", 94, { rating: rating18({ par: null, courseRating: 71.8, slopeRating: 135 }) });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.scoreDifferential?.value).toBe(18.6);
    expect(r.issues.find((i) => i.code === "PAR_MISSING_AGS")?.severity).toBe("warning");
    expect(r.courseHandicap).toBeUndefined();
    expect(r.inRecord).toBe(true);
  });

  it("PCC außerhalb −1…+3 → Fehler", () => {
    const round = agsRound("2026-05-01", 95, { pcc: 4 as never });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("PCC_INVALID");
    expect(r.inRecord).toBe(false);
  });

  it("unplausibles Course Rating → Fehler", () => {
    const round = agsRound("2026-05-01", 95, { rating: rating18({ courseRating: 36.0 }) });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("COURSE_RATING_IMPLAUSIBLE");
  });

  it("sehr niedriges GBE → Warnung", () => {
    const round = agsRound("2026-05-01", 60);
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.find((i) => i.code === "SCORE_IMPLAUSIBLY_LOW")?.severity).toBe("warning");
  });

  it("GBE über der NDB-Summe → Warnung", () => {
    const round = agsRound("2026-05-01", 200);
    const r = calculateScoringRecord(makeProfile({ startHandicapIndex: 10 }), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("AGS_ABOVE_NET_DOUBLE_BOGEY_MAXIMUM");
  });

  it("fehlender Lochscore in der Scorekarte → Fehler", () => {
    const round = baseRound({
      date: "2026-05-01",
      holeData: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 })),
      entry: { mode: "HOLE_BY_HOLE", holeScores: [...Array.from({ length: 17 }, () => 5), null] },
    });
    const r = calculateScoringRecord(makeProfile(), [round], { today: TODAY }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("HOLE_SCORE_MISSING");
    expect(r.inRecord).toBe(false);
  });

  it("Runden in der Zukunft erzeugen eine Warnung", () => {
    const r = calculateScoringRecord(makeProfile(), [sdRound(addDays(TODAY, 3), 40)], { today: TODAY });
    expect(r.issues.map((i) => i.code)).toContain("FUTURE_ROUNDS");
  });
});

describe("Übernahme offizieller Werte", () => {
  it("ein offizieller HCPI nach der Runde überschreibt die Rekonstruktion", () => {
    const profile = makeProfile({ startHandicapIndex: 20 });
    const imported = sdRound("2026-04-01", 19.5, {
      entry: { mode: "SCORE_DIFFERENTIAL", scoreDifferential: 19.5, officialHandicapIndexAfter: 18.3 },
    });
    const next = sdRound("2026-04-05", 25);
    const result = calculateScoringRecord(profile, [imported, next], { today: TODAY });
    expect(result.revisions[0].officialOverride).toBe(18.3);
    expect(result.revisions[0].currentHandicapIndex).toBe(18.3);
    expect(result.rounds[1].startHandicapIndex).toBe(18.3);
  });

  it("Debug-Objekt enthält alle Zwischenwerte", () => {
    const result = calculateScoringRecord(makeProfile(), sdSeries("2026-03-01", [50, 51, 52]), { today: TODAY });
    const debug = result.rounds[2].debug;
    expect(debug).toMatchObject({
      startHandicapIndex: 54,
      scoreDifferential: 52,
      rawHandicapIndex: 48,
      finalHandicapIndex: 48,
      exceptionalScoreReduction: 0,
    });
    expect(Object.keys(debug)).toEqual(
      expect.arrayContaining([
        "courseRating",
        "slopeRating",
        "pcc",
        "grossScore",
        "adjustedGrossScore",
        "expectedNineHoleScoreDifferential",
        "lowHandicapIndex",
        "softCapAdjustment",
        "hardCapAdjustment",
        "brake265Adjustment",
      ]),
    );
  });
});
