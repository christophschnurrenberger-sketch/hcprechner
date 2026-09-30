import { describe, expect, it } from "vitest";
import { applyPatch, holesChoiceOf, holesPatch, initialState, restoreState, statsWithStrokes, stepErrors, toRoundInput } from "@/components/member/wizard/wizardState";
import { alignToHoles, emptyHoleStat } from "@/lib/stats/holeStats";

describe("Runden-Wizard: Zustand", () => {
  const confirmed = { par: 72, courseRating: 72.3, slopeRating: 131 };
  const base = { ...initialState("2026-09-30"), courseId: "c1", layoutId: "l1", teeColor: "Gelb", ratingConfirmed: confirmed };

  it("Bestätigung des Ratings verfällt bei anderem Abschlag, Löchern, Geschlecht oder Datum", () => {
    expect(applyPatch(base, { gbe: "90" }).ratingConfirmed).toEqual(confirmed);
    expect(applyPatch(base, { teeColor: "Gelb" }).ratingConfirmed).toEqual(confirmed);
    for (const patch of [{ teeColor: "Rot" }, { holes: 9 as const }, { gender: "F" as const }, { date: "2026-09-01" }, { layoutId: "l2" }]) {
      expect(applyPatch(base, patch).ratingConfirmed).toBeNull();
    }
    expect(applyPatch(base, { teeColor: "Rot", ratingConfirmed: confirmed }).ratingConfirmed).toEqual(confirmed);
  });

  it("bestätigte Werte gehen mit der Eingabe an das Backend", () => {
    expect(toRoundInput(base).course).toMatchObject({ kind: "DB", teeColor: "Gelb", confirmRating: confirmed });
    expect(toRoundInput({ ...base, ratingConfirmed: null }).course).not.toHaveProperty("confirmRating");
  });

  it("Löcher-Auswahl: 18 Loch, vordere/hintere neun bzw. 9-Loch-Platz", () => {
    expect(holesChoiceOf({ holes: 18, nine: null }, 18)).toBe("18");
    expect(holesChoiceOf({ holes: 9, nine: "BACK" }, 18)).toBe("BACK");
    expect(holesChoiceOf({ holes: 9, nine: null }, 18)).toBe("FRONT");
    expect(holesChoiceOf({ holes: 9, nine: "FRONT" }, 9)).toBe("9");
    expect(holesPatch("BACK")).toEqual({ holes: 9, nine: "BACK" });
    expect(holesPatch("9")).toEqual({ holes: 9, nine: null });
    expect(holesPatch("18")).toEqual({ holes: 18, nine: null });
  });
});

describe("Runden-Wizard: Lochstatistik und Sichtbarkeit", () => {
  const holes = [4, 3, 5, 4, 4, 3, 5, 4, 4].map((par, i) => emptyHoleStat(i + 1, par, i + 1));
  const base = { ...initialState("2026-09-30", "M", "MEMBERS_BASIC"), courseId: "c1", layoutId: "l1", teeColor: "Gelb", holes: 9 as const, nine: "FRONT" as const };

  it("Vorauswahl der Sichtbarkeit aus den Privatsphäre-Einstellungen geht mit an das Backend", () => {
    expect(toRoundInput(base).visibility).toBe("MEMBERS_BASIC");
    expect(toRoundInput({ ...base, visibility: "PRIVATE" }).visibility).toBe("PRIVATE");
  });

  it("ohne detailliertes Tracking wird keine Statistik gesendet (null entfernt eine bisherige)", () => {
    const withStats = holes.map((h) => ({ ...h, putts: 2 }));
    expect(toRoundInput({ ...base, holeStats: withStats }).holeStats).toBeNull();
    expect(toRoundInput({ ...base, detailed: true, holeStats: holes }).holeStats).toBeNull();
    expect(toRoundInput({ ...base, detailed: true, holeStats: withStats }).holeStats).toHaveLength(9);
  });

  it("Loch für Loch: Schlagzahl der Statistik kommt aus der Handicap-Eingabe", () => {
    const strokes = [5, 3, "PICKUP", 4, null, 3, 6, 4, 5] as const;
    const s = { ...base, detailed: true, scoreMode: "HOLES" as const, strokes: [...strokes], holeStats: holes.map((h) => ({ ...h, putts: 1, score: 9 })) };
    const sent = toRoundInput(s).holeStats!;
    expect(sent.map((h) => h.score)).toEqual([5, 3, null, 4, null, 3, 6, 4, 5]);
    expect(statsWithStrokes({ ...s, scoreMode: "GBE" }).map((h) => h.score)).toEqual(Array(9).fill(9));
  });

  it("unmögliche Statistik blockiert den Schritt „Ergebnis“, ungewöhnliche nicht", () => {
    const bad = holes.map((h, i) => (i === 0 ? { ...h, score: 4, putts: 4 } : h));
    expect(stepErrors({ ...base, scoreMode: "GBE", gbe: "45", detailed: true, holeStats: bad }, "score").stats).toMatch(/Loch 1/);
    const odd = holes.map((h, i) => (i === 0 ? { ...h, score: 6, putts: 2, gir: true } : h));
    expect(stepErrors({ ...base, scoreMode: "GBE", gbe: "45", detailed: true, holeStats: odd }, "score").stats).toBeUndefined();
    expect(stepErrors({ ...base, scoreMode: "GBE", gbe: "45", detailed: false, holeStats: bad }, "score").stats).toBeUndefined();
  });

  it("Lochliste folgt den gespielten Löchern und behält Angaben je Lochnummer", () => {
    const front = holes.map((h) => ({ ...h, putts: 2 }));
    const back = Array.from({ length: 9 }, (_, i) => ({ number: 10 + i, par: 4, strokeIndex: null }));
    expect(alignToHoles(front, back).map((h) => [h.number, h.putts])).toEqual(back.map((b) => [b.number, null]));
    const eighteen = [...holes, ...back.map((b) => emptyHoleStat(b.number, b.par))];
    const aligned = alignToHoles(front, eighteen);
    expect(aligned).toHaveLength(18);
    expect(aligned.slice(0, 9).every((h) => h.putts === 2)).toBe(true);
    // Par aus den Platzdaten hat Vorrang, sonst bleibt die eigene Angabe (manueller Platz)
    expect(alignToHoles([{ ...holes[0], par: 5 }], [{ number: 1, par: null }])[0].par).toBe(5);
    expect(alignToHoles([{ ...holes[0], par: 5 }], [{ number: 1, par: 4 }])[0].par).toBe(4);
  });

  it("Entwurf ohne neue Felder wird ergänzt", () => {
    const restored = restoreState({ step: "score", gbe: "44" }, initialState("2026-09-30", "M", "MEMBERS_FULL"));
    expect(restored).toMatchObject({ detailed: false, holeStats: [], visibility: "MEMBERS_FULL", gbe: "44" });
  });
});
