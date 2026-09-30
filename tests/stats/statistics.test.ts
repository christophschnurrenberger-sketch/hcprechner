import { describe, expect, it } from "vitest";
import { performanceReport, summarize, type StatRound } from "@/lib/stats/aggregate";
import { emptyHoleStat, holeNumbersFor, validateHoleStats } from "@/lib/stats/holeStats";
import { roundInsights } from "@/lib/stats/insights";
import { roundStatistics } from "@/lib/stats/roundStatistics";
import type { HoleStat } from "@/lib/stats/types";

// 18 Löcher: 4 × Par 3, 10 × Par 4, 4 × Par 5 (Par 72)
const PARS18 = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

function holes(pars: number[], fill: (i: number, par: number) => Partial<HoleStat>, start = 1): HoleStat[] {
  return pars.map((par, i) => ({ ...emptyHoleStat(start + i, par), ...fill(i, par) }));
}

describe("Rundenstatistik", () => {
  it("18 Loch: 2 Putts je Loch = 36, 9 GIR = 50 %, 14 Fairway-Chancen (Par 3 nicht im Nenner)", () => {
    const h = holes(PARS18, (i, par) => ({ score: par + 1, putts: 2, gir: i < 9, fir: par === 3 ? null : i % 2 === 0, penaltyStrokes: 0 }));
    const s = roundStatistics(h);
    expect(PARS18.filter((p) => p === 3)).toHaveLength(4);
    expect(s.totalPutts).toBe(36);
    expect(s.puttsPerHole).toBe(2);
    expect(s.girs).toBe(9);
    expect(s.girPercentage).toBe(50);
    expect(s.fairwayOpportunities).toBe(14);
    expect(s.grossScore).toBe(90);
    expect(s.parPlayed).toBe(72);
    expect(s.bogeys).toBe(18);
    expect(s.scorecardComplete).toBe(true);
    expect(s.holesTracked).toBe(18);
  });

  it("9 Loch: 17 Putts, 5 GIR → 55,6 % (nicht 27,8 %), FIR 4 von 7 bei zwei Par 3", () => {
    const pars = [4, 4, 3, 5, 4, 4, 3, 5, 4];
    const putts = [2, 2, 1, 2, 2, 2, 2, 2, 2];
    const h = holes(pars, (i, par) => ({ score: par, putts: putts[i], gir: i < 5, fir: par === 3 ? null : i < 5 }));
    const s = roundStatistics(h);
    expect(s.totalPutts).toBe(17);
    expect(s.girHoles).toBe(9);
    expect(s.girPercentage).toBeCloseTo(55.56, 1);
    expect(s.fairwayOpportunities).toBe(7);
    expect(s.firs).toBe(4);
  });

  it("ohne Bunker: 0 Versuche, Sand-Save-Quote leer (nicht 0 %); ohne Up-&-Down-Versuch ebenso", () => {
    const h = holes(PARS18, (_, par) => ({ score: par, putts: 2, gir: true, bunkerVisit: false }));
    const s = roundStatistics(h);
    expect(s.sandAttempts).toBe(0);
    expect(s.sandSavePercentage).toBeNull();
    expect(s.upAndDownAttempts).toBe(0);
    expect(s.upAndDownPercentage).toBeNull();
  });

  it("3-Putts: Putts 2, 1, 3, 2, 4 → 2", () => {
    const putts = [2, 1, 3, 2, 4];
    const h = holes([4, 4, 4, 4, 4, 4, 4, 4, 4], (i) => ({ score: 6, putts: putts[i] ?? null }));
    expect(roundStatistics(h).threePutts).toBe(2);
  });

  it("Sand Save und Up & Down zählen nur Versuche; Strafschläge werden summiert", () => {
    const h = holes([4, 3, 5, 4, 4, 3, 4, 5, 4], (i, par) => {
      if (i === 0) return { score: par, putts: 1, gir: false, bunkerVisit: true, bunkerShots: 1, sandSave: true, upAndDown: true };
      if (i === 1) return { score: par + 1, putts: 2, gir: false, bunkerVisit: true, bunkerShots: 1, sandSave: false, upAndDown: false };
      if (i === 2) return { score: par + 2, putts: 2, gir: false, upAndDown: false, penaltyStrokes: 2 };
      return { score: par, putts: 2, gir: true, penaltyStrokes: i === 3 ? 1 : 0 };
    });
    const s = roundStatistics(h);
    expect([s.sandAttempts, s.sandSaves, s.sandSavePercentage]).toEqual([2, 1, 50]);
    expect([s.upAndDownAttempts, s.upAndDowns]).toEqual([3, 1]);
    expect(s.penaltyStrokes).toBe(3);
    expect(s.puttsOnGir).toBe(12);
    expect(s.puttsPerGir).toBe(2);
  });

  it("Score-Verteilung aus Schlägen und Par", () => {
    const scores = [2, 3, 4, 5, 6, 7, 8, 4, 4];
    const h = holes([4, 4, 4, 4, 4, 4, 4, 4, 4], (i) => ({ score: scores[i] }));
    const s = roundStatistics(h);
    expect([s.eagles, s.birdies, s.pars, s.bogeys, s.doubleBogeys, s.triplePlus]).toEqual([1, 1, 3, 1, 1, 2]);
  });

  it("unvollständige Scorekarte: keine Gesamtsumme, Nenner nur aus erfassten Löchern", () => {
    const h = holes(PARS18, (i, par) => (i < 12 ? { score: par, putts: 2, gir: i < 6 } : {}));
    const s = roundStatistics(h);
    expect(s.scorecardComplete).toBe(false);
    expect(s.grossScore).toBeNull();
    expect(s.girHoles).toBe(12);
    expect(s.girPercentage).toBe(50);
  });

  it("Hinweise sind reine Fakten", () => {
    const h = holes(PARS18, (i, par) => ({ score: par + 1, putts: i === 0 ? 3 : 2, gir: i < 9, fir: par === 3 ? null : i < 8, penaltyStrokes: 0 }));
    const text = roundInsights(roundStatistics(h)).join(" ");
    expect(text).toContain("von 14 Fairways getroffen");
    expect(text).toContain("1 Drei-Putt");
    expect(text).not.toMatch(/schlecht|gut|super/i);
  });
});

describe("Prüfregeln der Lochdaten", () => {
  const numbers = holeNumbersFor(9, "FRONT");
  const base = () => holes([4, 4, 3, 5, 4, 4, 3, 5, 4], () => ({}));

  it("technisch unmöglich → Fehler: 5 Putts bei 2 Schlägen, Fairway auf Par 3, Sand Save ohne Bunker, Up & Down trotz GIR", () => {
    const h = base();
    h[0] = { ...h[0], score: 2, putts: 5 };
    h[2] = { ...h[2], score: 3, fir: true };
    h[3] = { ...h[3], score: 5, sandSave: true };
    h[4] = { ...h[4], score: 4, gir: true, upAndDown: true, putts: 2 };
    const v = validateHoleStats(h, numbers);
    expect(v.errors.map((e) => e.field)).toEqual(expect.arrayContaining(["putts", "fir", "sandSave", "upAndDown"]));
  });

  it("Sand Save / Up & Down bedeuten Par oder besser", () => {
    const h = base();
    h[0] = { ...h[0], score: 6, putts: 2, gir: false, bunkerVisit: true, sandSave: true };
    h[1] = { ...h[1], score: 5, putts: 1, gir: false, upAndDown: true };
    expect(validateHoleStats(h, numbers).errors).toHaveLength(2);
  });

  it("GIR ohne Schlagzahl → Hinweis, kein Fehler; ungewöhnliche GIR-Angabe → Hinweis", () => {
    const h = base();
    h[0] = { ...h[0], gir: false };
    h[1] = { ...h[1], score: 5, putts: 1, gir: true };
    const v = validateHoleStats(h, numbers);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings.map((w) => w.field)).toEqual(["score", "gir"]);
  });

  it("5 auf Par 4 mit 3 Putts und GIR ist gültig (keine Annahme aus der Schlagzahl)", () => {
    const h = base();
    h[0] = { ...h[0], score: 5, putts: 3, gir: true };
    const v = validateHoleStats(h, numbers);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
  });

  it("falsche Lochnummern werden abgelehnt (hintere neun: 10–18)", () => {
    expect(validateHoleStats(base(), holeNumbersFor(9, "BACK")).errors).toHaveLength(1);
    expect(holeNumbersFor(9, "BACK")).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});

describe("Auswertung über mehrere Runden", () => {
  const mk = (id: string, date: string, holes: 9 | 18, girs: number, girHoles: number, extra: Partial<HoleStat> = {}): StatRound => {
    const pars = holes === 18 ? PARS18 : PARS18.slice(0, 9);
    const h = pars.map((par, i) => ({ ...emptyHoleStat(i + 1, par), score: par + 1, putts: 2, gir: i < girHoles ? i < girs : null, penaltyStrokes: 0, ...extra }));
    return { id, date, courseName: "Testplatz", courseId: "c1", teeColor: "Gelb", holes, stats: roundStatistics(h) };
  };

  it("Quoten aus Summen (nicht Durchschnitt der Prozentwerte)", () => {
    const s = summarize([mk("a", "2026-09-01", 18, 9, 18), mk("b", "2026-09-10", 9, 1, 9)]);
    expect(s.girs).toBe(10);
    expect(s.girHoles).toBe(27);
    expect(s.girPercentage).toBeCloseTo((10 / 27) * 100, 6);
    expect(s.averageScore18).toBe(90);
    expect(s.averageScore9).toBe(45);
    expect(s.threePuttsPerRound).toBe(0);
  });

  it("Filter: letzte n Runden, 9/18 Loch, Zeitraum; Runden ohne Statistik werden gezählt, aber nicht ausgewertet", () => {
    const rounds: StatRound[] = [
      mk("a", "2025-12-01", 18, 9, 18),
      mk("b", "2026-08-01", 18, 6, 18),
      mk("c", "2026-09-20", 9, 3, 9),
      { id: "quick", date: "2026-09-25", courseName: "Testplatz", courseId: "c1", teeColor: "Gelb", holes: 18, stats: null },
    ];
    const today = "2026-09-30";
    expect(performanceReport(rounds, { last: 2 }, today).summary.roundsWithStats).toBe(2);
    expect(performanceReport(rounds, { holes: 18 }, today).summary.girs).toBe(15);
    expect(performanceReport(rounds, { period: "YEAR" }, today).history.map((p) => p.roundId)).toEqual(["b", "c"]);
    expect(performanceReport(rounds, { period: "DAYS_30" }, today).history.map((p) => p.roundId)).toEqual(["c"]);
    const all = performanceReport(rounds, {}, today);
    expect(all.roundsWithoutStats).toBe(1);
    expect(all.options.courses).toEqual([{ id: "c1", name: "Testplatz", rounds: 3 }]);
  });
});
