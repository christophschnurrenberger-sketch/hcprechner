import { describe, expect, it } from "vitest";
import {
  afterHole,
  completeHole,
  formatToPar,
  holeStatus,
  nextPos,
  normalizeHole,
  prevPos,
  questionsAnswered,
  relativeScore,
  resumePos,
  scoreOptions,
  totals,
  visibleQuestions,
  type FlowContext,
  type FlowPos,
  type HoleView,
} from "@/lib/rounds/holeFlow";
import { emptyHoleStat, validateHoleStats } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";

const d18: FlowContext = { mode: "DETAILED", holeCount: 18 };
const q9: FlowContext = { mode: "QUICK", holeCount: 9 };

function walk(ctx: FlowContext): FlowPos[] {
  const out: FlowPos[] = [];
  let p: FlowPos = { hole: 0, step: "SETUP" };
  for (let i = 0; i < 200 && p.step !== "FINAL"; i++) {
    p = nextPos(p, ctx);
    out.push(p);
  }
  return out;
}

describe("Mobile Scorecard – Ablauf", () => {
  it("18 Loch detailliert: Score → Putts → Statistik je Loch, nach Loch 9 Zwischenstand, dann Übersicht", () => {
    const steps = walk(d18);
    expect(steps.slice(0, 4)).toEqual([
      { hole: 0, step: "SCORE" },
      { hole: 0, step: "PUTTS" },
      { hole: 0, step: "STATS" },
      { hole: 1, step: "SCORE" },
    ]);
    const front = steps.findIndex((p) => p.step === "FRONT_NINE");
    expect(steps[front - 1]).toEqual({ hole: 8, step: "STATS" });
    expect(steps[front + 1]).toEqual({ hole: 9, step: "SCORE" });
    expect(steps.at(-2)).toEqual({ hole: 17, step: "STATS" });
    expect(steps.at(-1)).toEqual({ hole: 17, step: "FINAL" });
    expect(steps.filter((p) => p.step === "SCORE")).toHaveLength(18);
  });

  it("9 Loch schnell: nur Schläge, nach Loch 9 direkt die Übersicht (kein Zwischenstand)", () => {
    const steps = walk(q9);
    expect(steps).toHaveLength(10);
    expect(steps.every((p) => p.step === "SCORE" || p.step === "FINAL")).toBe(true);
    expect(steps.some((p) => p.step === "FRONT_NINE")).toBe(false);
  });

  it("Zurück behält die Reihenfolge: Statistik → Putts → Score → voriges Loch; Loch 1 → Start", () => {
    expect(prevPos({ hole: 7, step: "STATS" }, d18)).toEqual({ hole: 7, step: "PUTTS" });
    expect(prevPos({ hole: 7, step: "SCORE" }, d18)).toEqual({ hole: 6, step: "STATS" });
    expect(prevPos({ hole: 0, step: "SCORE" }, d18)).toEqual({ hole: 0, step: "SETUP" });
    expect(prevPos({ hole: 8, step: "FRONT_NINE" }, d18)).toEqual({ hole: 8, step: "STATS" });
    expect(prevPos({ hole: 17, step: "FINAL" }, d18)).toEqual({ hole: 17, step: "STATS" });
    expect(prevPos({ hole: 3, step: "SCORE" }, q9)).toEqual({ hole: 2, step: "SCORE" });
    expect(prevPos({ hole: 0, step: "FINAL" }, { mode: "TOTAL", holeCount: 18 })).toEqual({ hole: 0, step: "TOTAL" });
    expect(afterHole(17, d18)).toEqual({ hole: 17, step: "FINAL" });
  });

  it("Nur relevante Fragen: Par 3 ohne Fairway, Up & Down nur bei verfehltem Grün, schrittweise", () => {
    const par3: HoleStat = { ...emptyHoleStat(3, 3), score: 4, putts: 2 };
    expect(visibleQuestions(par3)).toEqual(["gir"]);
    expect(visibleQuestions({ ...par3, gir: false })).toEqual(["gir"]); // 4 auf Par 3: Up & Down sicher nicht geschafft
    expect(visibleQuestions({ ...par3, score: 3, gir: false })).toEqual(["gir", "upAndDown"]);
    expect(visibleQuestions({ ...par3, score: 3, gir: true })).toEqual(["gir"]);
    const par4: HoleStat = { ...emptyHoleStat(7, 4), score: 4, putts: 2 };
    expect(visibleQuestions(par4)).toEqual(["fir"]);
    expect(visibleQuestions({ ...par4, fir: true })).toEqual(["fir", "gir"]);
    expect(visibleQuestions({ ...par4, fir: true, gir: false })).toEqual(["fir", "gir", "upAndDown"]);
    expect(questionsAnswered({ ...par4, fir: true, gir: false })).toBe(false);
    expect(questionsAnswered({ ...par4, fir: true, gir: false, upAndDown: true })).toBe(true);
    expect(questionsAnswered({ ...par4, score: 5, fir: true, gir: false })).toBe(true);
  });

  it("Folgerungen sind sicher und ergeben immer gültige Lochdaten (kein Bunker → kein Sand Save, über Par → Nein)", () => {
    const h: HoleStat = { ...emptyHoleStat(5, 5), score: 6, putts: 2, fir: true, gir: false, bunkerVisit: true };
    const n = completeHole(h);
    expect(n.upAndDown).toBe(false);
    expect(n.sandSave).toBe(false);
    expect(n.penaltyStrokes).toBe(0);
    expect(normalizeHole({ ...h, bunkerVisit: false, sandSave: true, bunkerShots: 2 })).toMatchObject({ sandSave: null, bunkerShots: null });
    expect(normalizeHole({ ...h, par: 3, score: 3, fir: true, gir: true, upAndDown: true })).toMatchObject({ fir: null, upAndDown: null });
    const quick = completeHole({ ...emptyHoleStat(1, 4), score: 4, putts: 2, fir: false, gir: false });
    expect(quick.bunkerVisit).toBe(false);
    expect(quick.upAndDown).toBeNull(); // noch offen – Par, also möglich
    for (const x of [n, quick]) expect(validateHoleStats([x], [x.number]).errors).toEqual([]);
  });

  it("Schlagzahl: große Schnellauswahl Par −1 … Par +3 und „mehr“, Anzeige relativ zu Par mit Text", () => {
    expect(scoreOptions(4).map((o) => `${o.value}${o.more ? "+" : ""}`)).toEqual(["3", "4", "5", "6", "7", "8+"]);
    expect(scoreOptions(3).map((o) => o.value)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(relativeScore(5, 4)).toMatchObject({ label: "Bogey", short: "+1" });
    expect(relativeScore(4, 4)).toMatchObject({ label: "Par", short: "E" });
    expect(relativeScore(3, 4)).toMatchObject({ label: "Birdie", short: "−1" });
    expect(relativeScore(1, 3)).toMatchObject({ label: "Hole in One", short: "−2" });
    expect(relativeScore(9, 4)).toMatchObject({ label: "5 über Par", short: "+5", tone: "triple" });
    expect(relativeScore(null, 4)).toBeNull();
    expect([formatToPar(7), formatToPar(0), formatToPar(-2), formatToPar(null)]).toEqual(["+7", "E", "−2", "–"]);
  });

  it("Zwischenstand, Lochstatus und Wiedereinstieg", () => {
    const pars = [4, 5, 3, 4];
    const view = (raw: HoleView["raw"], s: Partial<HoleStat>, i: number): HoleView => ({ number: i + 1, par: pars[i], strokeIndex: null, raw, stats: { ...emptyHoleStat(i + 1, pars[i]), ...s } });
    const holes = [view(5, { putts: 2, fir: true, gir: false, upAndDown: false }, 0), view(6, { putts: 3, fir: false, gir: true }, 1), view("PICKUP", {}, 2), view(null, {}, 3)];
    const t = totals(holes);
    expect(t).toMatchObject({ played: 2, pickups: 1, strokes: 11, toPar: 2, putts: 5, puttHoles: 2, girs: 1, girHoles: 2, firs: 1, firHoles: 2 });
    expect(holes.map((h) => holeStatus(h, "DETAILED"))).toEqual(["done", "done", "partial", "empty"]);
    expect(holes.map((h) => holeStatus(h, "QUICK"))).toEqual(["done", "done", "done", "empty"]);
    expect(resumePos(holes, "QUICK")).toEqual({ hole: 3, step: "SCORE" });
    expect(resumePos(holes, "DETAILED")).toEqual({ hole: 2, step: "PUTTS" });
    expect(resumePos(holes.slice(0, 2), "DETAILED")).toEqual({ hole: 1, step: "FINAL" });
  });
});
