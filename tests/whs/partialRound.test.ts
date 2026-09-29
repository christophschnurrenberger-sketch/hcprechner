import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import { calculatePartialRound, countPlayedHoles } from "@/rules/whs/de/2026/partialRound";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import type { HoleScore } from "@/lib/whs/types";
import { baseRound, holes18, makeProfile, PARS_18, rating18, rating9 } from "./helpers";

const bogeys = (): HoleScore[] => PARS_18.map((p) => p + 1);

function played(count: number, from = 0): HoleScore[] {
  const scores = bogeys();
  return scores.map((s, i) => (i >= from && i < from + count ? s : null));
}

const nineRatings = {
  FRONT: { courseRating: 36.0, slopeRating: 113, par: 36 },
  BACK: { courseRating: 36.0, slopeRating: 113, par: 36 },
};

const input = (scores: HoleScore[], extra: Partial<Parameters<typeof calculatePartialRound>[0]> = {}) => ({
  holes: holes18(),
  scores,
  rating18: { courseRating: 72.0, slopeRating: 113, par: 72 },
  nineHoleRatings: nineRatings,
  handicapIndexBeforeRound: 18.0,
  pcc: 0,
  ...extra,
});

describe("Abgebrochene 18-Loch-Runden (10–17 Löcher)", () => {
  it("zählt gespielte Löcher (PICKUP zählt als gespielt)", () => {
    const s = played(12);
    s[3] = "PICKUP";
    expect(countPlayedHoles(s)).toBe(12);
  });

  it("14 Löcher: nicht gespielte Löcher mit Netto-Par", () => {
    const r = calculatePartialRound(input(played(14)), DE_2026);
    expect(r.differential.method).toBe("PARTIAL_NET_PAR");
    expect(r.holesPlayed).toBe(14);
    // CH 18 → 1 Schlag je Loch; Bogey = Netto-Par → GBE 90 → SD 18,0
    expect(r.gbe.total).toBe(90);
    expect(r.gbe.holes.slice(14).every((h) => h.reason === "NOT_PLAYED_NET_PAR")).toBe(true);
    expect(r.differential.value).toBe(18.0);
  });

  it("17 Löcher: ein Loch Netto-Par, PCC voll", () => {
    const r = calculatePartialRound(input(played(17), { pcc: 1 }), DE_2026);
    expect(r.differential.pccApplied).toBe(1);
    expect(r.differential.value).toBe(17.0);
  });

  it("12 Löcher: Hochrechnung über die vollständig gespielten Löcher 1–9", () => {
    const r = calculatePartialRound(input(played(12)), DE_2026);
    expect(r.differential.method).toBe("PARTIAL_NINE_EXPECTED");
    expect(r.differential.nineUsed).toBe("FRONT");
    // CH₉ 9 → Bogey = Netto-Par → GBE₉ 45 → 9,0 + erwartet 10,6 = 19,6
    expect(r.differential.playedDifferential).toBe(9.0);
    expect(r.differential.expectedDifferential).toBe(10.6);
    expect(r.differential.value).toBe(19.6);
    expect(r.gbe.holes.slice(9).every((h) => h.reason === "NOT_COUNTED")).toBe(true);
  });

  it("11 Löcher auf den Löchern 8–18: Hochrechnung über die Löcher 10–18", () => {
    const r = calculatePartialRound(input(played(11, 7)), DE_2026);
    expect(r.differential.nineUsed).toBe("BACK");
  });

  it("10–13 Löcher ohne vollständige neun Löcher → nicht wertbar", () => {
    expect(() => calculatePartialRound(input(played(12, 3)), DE_2026)).toThrow(/PARTIAL_NO_COMPLETE_NINE/);
  });

  it("10–13 Löcher ohne offizielles 9-Loch-Rating → nicht wertbar (keine Ableitung aus 18 Loch)", () => {
    expect(() => calculatePartialRound(input(played(12), { nineHoleRatings: {} }), DE_2026)).toThrow(
      /PARTIAL_NINE_RATING_REQUIRED/,
    );
  });

  it("9 oder weniger Löcher → keine Wertung als 18-Loch-Runde", () => {
    expect(() => calculatePartialRound(input(played(9)), DE_2026)).toThrow(/PARTIAL_TOO_FEW_HOLES/);
  });

  it("im Scoring Record: eigene Routine mit Hinweis auf die Methode", () => {
    const round = baseRound({
      date: "2026-05-01",
      holesPlayed: 14,
      holeData: holes18(),
      rating: rating18(),
      entry: { mode: "HOLE_BY_HOLE", holeScores: played(14) },
    });
    const result = calculateScoringRecord(makeProfile({ startHandicapIndex: 18.0 }), [round], { today: "2026-06-01" });
    const r = result.rounds[0];
    expect(r.scoreDifferential!.method).toBe("PARTIAL_NET_PAR");
    expect(r.issues.map((i) => i.code)).toContain("PARTIAL_METHOD_UNVERIFIED");
    expect(r.inRecord).toBe(true);
  });

  it("eine normale 9-Loch-Runde benutzt nie die Teilrunden-Routine", () => {
    const round = baseRound({
      date: "2026-05-01",
      holes: 9,
      rating: rating9(),
      entry: { mode: "AGS", adjustedGrossScore: 45 },
    });
    const r = calculateScoringRecord(makeProfile({ startHandicapIndex: 18.0 }), [round], { today: "2026-06-01" })
      .rounds[0];
    expect(r.scoreDifferential!.method).toBe("NINE_EXPECTED");
  });

  it("Teilrunde nur mit Lochscores möglich", () => {
    const round = baseRound({ date: "2026-05-01", holesPlayed: 14, entry: { mode: "AGS", adjustedGrossScore: 80 } });
    const r = calculateScoringRecord(makeProfile(), [round], { today: "2026-06-01" }).rounds[0];
    expect(r.issues.map((i) => i.code)).toContain("PARTIAL_REQUIRES_HOLE_SCORES");
    expect(r.inRecord).toBe(false);
  });
});
