import { describe, expect, it } from "vitest";
import { emptyMemberDoc, normalizeMemberDoc } from "@/lib/member/doc";
import { computeHcp, roundDetail } from "@/lib/member/hcp";
import { ensurePublicId, memberSummary, performanceOf, saveRoundStats, setRoundVisibility, updateCommunitySettings } from "@/lib/member/community";
import { createRound, previewRoundInput, updateRound } from "@/lib/member/service";
import { emptyHoleStat } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";
import { COURSE_ID, LAYOUT_ID, PARS, ctx, expectApiError, input } from "./fixtures";

function stats18(fill: (i: number, par: number) => Partial<HoleStat>): HoleStat[] {
  return PARS.map((par, i) => ({ ...emptyHoleStat(i + 1, null), ...fill(i, par) }));
}

describe("Golfstatistik im Mitgliederbereich", () => {
  it("Statistik ergänzen verändert weder Score Differential noch Handicap Index", async () => {
    const { doc } = await createRound(emptyMemberDoc("u1"), input({ score: { mode: "GBE", adjustedGrossScore: 94 } }), ctx);
    const id = doc.rounds[0].id;
    const before = roundDetail(doc, id);
    const hcpBefore = computeHcp(doc);
    const r = await saveRoundStats(doc, id, stats18((i, par) => ({ score: par + 1, putts: 2, gir: i < 6, fir: par === 3 ? null : i % 2 === 0, penaltyStrokes: 0 })), ctx.courseLookup);
    const after = roundDetail(r.doc, id);
    expect(after.item.scoreDifferential).toBe(before.item.scoreDifferential);
    expect(after.item.adjustedGrossScore).toBe(94);
    expect(computeHcp(r.doc).currentHandicapIndex).toBe(hcpBefore.currentHandicapIndex);
    expect(r.stats?.totalPutts).toBe(36);
    expect(after.stats?.girs).toBe(6);
    // Par je Loch kommt aus den Platzdaten, nicht aus der Eingabe
    expect(after.holeStats?.[2].par).toBe(3);
    expect(after.scoresLocked).toBe(false);
    expect(after.insights.join(" ")).toContain("Fairways getroffen");
  });

  it("Runde mit Lochstatistik speichern: WHS aus GBE, Statistik getrennt; ungültige Angaben werden abgelehnt", async () => {
    const holeStats = stats18((i, par) => ({ score: par + 2, putts: 2, gir: false }));
    const { doc, result } = await createRound(emptyMemberDoc("u1"), input({ holeStats, visibility: "MEMBERS_FULL" }), ctx);
    expect(result.item.scoreDifferential).toBe(18.6);
    expect(result.stats?.grossScore).toBe(72 + 36);
    expect(doc.rounds[0].visibility).toBe("MEMBERS_FULL");
    expect(doc.rounds[0].computed?.stats?.totalPutts).toBe(36);
    const broken = stats18(() => ({}));
    broken[0] = { ...broken[0], score: 2, putts: 5 };
    await expectApiError(previewRoundInput(emptyMemberDoc("u1"), input({ holeStats: broken }), ctx), "VALIDATION");
  });

  it("Eingabe „Loch für Loch“: Schläge der WHS-Eingabe sind maßgeblich und in der Statistik gesperrt", async () => {
    const strokes = PARS.map((p) => p + 1);
    const holeStats = stats18((i) => ({ score: 99 > i ? 1 : null, putts: 1 }));
    const { doc } = await createRound(emptyMemberDoc("u1"), input({ score: { mode: "HOLES", strokes }, holeStats }), ctx);
    const round = doc.rounds[0];
    expect(round.holeStats?.map((h) => h.score)).toEqual(strokes);
    const detail = roundDetail(doc, round.id);
    expect(detail.scoresLocked).toBe(true);
    const r = await saveRoundStats(doc, round.id, stats18(() => ({ score: 12, putts: 2 })));
    expect(r.doc.rounds[0].holeStats?.map((h) => h.score)).toEqual(strokes);
    expect(roundDetail(r.doc, round.id).item.scoreDifferential).toBe(detail.item.scoreDifferential);
  });

  it("Bearbeiten ohne Statistik-Angabe behält die Lochdaten; bei geänderten Löchern entfallen sie mit Hinweis", async () => {
    const holeStats = stats18((_, par) => ({ score: par, putts: 2 }));
    const { doc } = await createRound(emptyMemberDoc("u1"), input({ holeStats }), ctx);
    const id = doc.rounds[0].id;
    const kept = await updateRound(doc, id, input({ score: { mode: "GBE", adjustedGrossScore: 95 } }), ctx);
    expect(kept.doc.rounds[0].holeStats).toHaveLength(18);
    const nine = input({ holes: 9, nine: "FRONT", score: { mode: "GBE", adjustedGrossScore: 48 } });
    const preview = await previewRoundInput(doc, nine, ctx, id);
    expect(preview.statsWarnings.join(" ")).toContain("wird beim Speichern entfernt");
  });

  it("Sichtbarkeit je Runde und Community-Einstellungen (Opt-in, Anzeigename geprüft)", async () => {
    const { doc } = await createRound(emptyMemberDoc("u1"), input(), ctx);
    const id = doc.rounds[0].id;
    expect(doc.rounds[0].visibility).toBe("PRIVATE");
    expect(setRoundVisibility(doc, id, "MEMBERS_BASIC").rounds[0].visibility).toBe("MEMBERS_BASIC");
    expect(() => setRoundVisibility(doc, id, "PUBLIC")).toThrow();
    const s = updateCommunitySettings(doc, { profileVisible: false, roundsVisible: true, displayName: "  Max  M. " }).community;
    expect(s.roundsVisible).toBe(false);
    expect(s.displayName).toBe("Max M.");
    expect(() => updateCommunitySettings(doc, { displayName: "max@example.de" })).toThrow();
    // publicId vergibt nur der Server
    const withId = ensurePublicId(updateCommunitySettings(doc, { publicId: "fremd" } as never), () => "neu");
    expect(withId.community.publicId).toBe("neu");
  });

  it("Zusammenfassung: HCPI aus dem Scoring Record, Statistik der letzten Runden – und bleibt beim Neuladen erhalten", async () => {
    let doc = emptyMemberDoc("u1");
    for (const [i, gbe] of [94, 90, 88].entries()) {
      doc = (await createRound(doc, input({ date: `2026-09-0${i + 1}`, score: { mode: "GBE", adjustedGrossScore: gbe }, holeStats: stats18((_, par) => ({ score: par + 1, putts: 2, gir: false })) }), ctx)).doc;
    }
    const summary = memberSummary(doc);
    expect(summary.handicapIndex).toBe(computeHcp(doc).currentHandicapIndex);
    expect(summary.roundsCount).toBe(3);
    expect(summary.performance?.roundsWithStats).toBe(3);
    const reloaded = normalizeMemberDoc(JSON.parse(JSON.stringify({ ...doc, summary })), "u1");
    expect(reloaded.summary?.handicapIndex).toBe(summary.handicapIndex);
    expect(reloaded.rounds[0].holeStats).toHaveLength(18);
    expect(reloaded.rounds[0].visibility).toBe("PRIVATE");
    expect(reloaded.community.rankingVisible).toBe(false);
    expect(performanceOf(reloaded, { last: 2 }).summary.roundsWithStats).toBe(2);
  });

  it("bestätigtes ungeprüftes Rating bleibt beim Neuladen erhalten (Bearbeiten weiterhin möglich)", async () => {
    const rot = { kind: "DB" as const, courseId: COURSE_ID, layoutId: LAYOUT_ID, teeColor: "Rot", gender: "F" as const, confirmRating: { par: 72, courseRating: 73.5, slopeRating: 128 } };
    const { doc } = await createRound(emptyMemberDoc("u1"), input({ course: rot }), ctx);
    const reloaded = normalizeMemberDoc(JSON.parse(JSON.stringify(doc)), "u1");
    expect(reloaded.rounds[0].rating.playerConfirmed).toBe(true);
    const detail = roundDetail(reloaded, reloaded.rounds[0].id);
    expect(detail.input.course).toMatchObject({ confirmRating: { courseRating: 73.5 } });
    await expect(updateRound(reloaded, reloaded.rounds[0].id, detail.input, ctx)).resolves.toBeTruthy();
  });
});
