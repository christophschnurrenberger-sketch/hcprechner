import { describe, expect, it } from "vitest";
import { DE_2026 } from "@/rules/whs/de/2026/config";
import { determineHandicapRelevance } from "@/rules/whs/de/2026/relevance";
import { calculateScoringRecord } from "@/lib/whs/scoringRecord";
import { agsRound, makeProfile, nineRound, sdRound } from "./helpers";

const relevance = (round: Parameters<typeof determineHandicapRelevance>[0]) =>
  determineHandicapRelevance(round, DE_2026);

describe("Handicap-Relevanz", () => {
  it("Turnier im Einzelzählspiel mit gültigem Rating ist relevant", () => {
    const r = relevance(agsRound("2026-05-01", 95));
    expect(r.relevant).toBe(true);
    expect(r.checks.map((c) => c.code)).toEqual(
      expect.arrayContaining(["CATEGORY_TOURNAMENT", "FORMAT_STROKE", "STATUS_NORMAL", "RATING_VALID", "HOLES_EIGHTEEN"]),
    );
  });

  it("registrierte Privatrunde ist relevant", () => {
    expect(relevance(agsRound("2026-05-01", 95, { category: "RPR" })).relevant).toBe(true);
  });

  it("Stableford, Maximum Score und gegen Par sind relevant", () => {
    for (const format of ["STABLEFORD", "MAX_SCORE", "PAR_BOGEY"] as const) {
      expect(relevance(agsRound("2026-05-01", 95, { format })).relevant).toBe(true);
    }
  });

  it("Lochspiel und Mannschaftsformen sind nicht relevant", () => {
    expect(relevance(agsRound("2026-05-01", 95, { format: "MATCHPLAY" })).relevant).toBe(false);
    expect(relevance(agsRound("2026-05-01", 95, { format: "TEAM" })).relevant).toBe(false);
  });

  it("sonstige (nicht registrierte) Runde ist nicht relevant", () => {
    const r = relevance(agsRound("2026-05-01", 95, { category: "OTHER" }));
    expect(r.relevant).toBe(false);
    expect(r.checks.find((c) => c.code === "CATEGORY_OTHER")?.ok).toBe(false);
  });

  it.each(["NA", "TA", "NR_O", "DQ_O"] as const)("Ergebnisart %s ist nicht relevant", (status) => {
    expect(relevance(agsRound("2026-05-01", 95, { resultStatus: status })).relevant).toBe(false);
  });

  it.each(["NR_A", "DQ_A", "PENALTY"] as const)("Ergebnisart %s ist relevant", (status) => {
    expect(relevance(agsRound("2026-05-01", 95, { resultStatus: status })).relevant).toBe(true);
  });

  it("9-Loch-Runde mit 18-Loch-Rating ist nicht relevant", () => {
    const r = relevance(nineRound("2026-05-01", 45, { rating: { holes: 18, par: 72, courseRating: 72, slopeRating: 120 } }));
    expect(r.relevant).toBe(false);
    expect(r.checks.map((c) => c.code)).toContain("NINE_HOLE_RATING_REQUIRED");
  });

  it("weniger als 10 gespielte Löcher einer 18-Loch-Runde sind nicht relevant", () => {
    const r = relevance(agsRound("2026-05-01", 60, { holesPlayed: 8 }));
    expect(r.relevant).toBe(false);
    expect(r.checks.map((c) => c.code)).toContain("HOLES_INSUFFICIENT");
  });

  it("nicht relevante Runden fließen nicht in den Scoring Record ein", () => {
    const rounds = [
      sdRound("2026-05-01", 40, { category: "OTHER" }),
      sdRound("2026-05-02", 41, { resultStatus: "NA" }),
      sdRound("2026-05-03", 42),
    ];
    const result = calculateScoringRecord(makeProfile(), rounds, { today: "2026-06-01" });
    expect(result.record).toHaveLength(1);
    expect(result.rounds[0].currentExclusionReason).toBe("NOT_RELEVANT");
    expect(result.rounds[1].issues.map((i) => i.code)).toContain("NO_SCORE_FOR_STATUS");
  });
});
