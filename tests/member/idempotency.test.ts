import { describe, expect, it } from "vitest";
import { emptyMemberDoc, normalizeMemberDoc, publicPreferences } from "@/lib/member/doc";
import { computeHcp } from "@/lib/member/hcp";
import { createRound, roundByClientRef, setRoundEntryMode, updateRound } from "@/lib/member/service";
import { ApiError } from "@/lib/api/errors";
import { ctx, input } from "./fixtures";

describe("Idempotentes Speichern (mobile Rundeneingabe, Offline-Wiederholung)", () => {
  it("gleiche Entwurfs-Kennung → keine zweite Runde, gleiches Ergebnis", async () => {
    const draftId = "0f1e2d3c-4b5a-4968-8776-655443322110";
    const first = await createRound(emptyMemberDoc("u1"), input({ score: { mode: "GBE", adjustedGrossScore: 90 } }), ctx, draftId);
    expect(first.duplicate).toBe(false);
    expect(first.doc.rounds).toHaveLength(1);
    expect(first.doc.rounds[0].clientRef).toBe(draftId);

    const again = await createRound(first.doc, input({ score: { mode: "GBE", adjustedGrossScore: 90 } }), ctx, draftId);
    expect(again.duplicate).toBe(true);
    expect(again.doc).toBe(first.doc);
    expect(again.result.roundId).toBe(first.result.roundId);
    expect(again.result.item.scoreDifferential).toBe(first.result.item.scoreDifferential);
    expect(again.result.hcpBefore).toBe(first.result.hcpBefore);
    expect(again.result.hcpAfter).toBe(first.result.hcpAfter);
    expect(computeHcp(again.doc).currentHandicapIndex).toBe(computeHcp(first.doc).currentHandicapIndex);
  });

  it("Kennung bleibt bei späteren Änderungen erhalten; ohne Kennung entsteht wie bisher je Aufruf eine Runde", async () => {
    const draftId = "draft-abc_1";
    const a = await createRound(emptyMemberDoc("u1"), input({ score: { mode: "GBE", adjustedGrossScore: 90 } }), ctx, draftId);
    const edited = await updateRound(a.doc, a.result.roundId, input({ score: { mode: "GBE", adjustedGrossScore: 88 } }), ctx);
    expect(roundByClientRef(edited.doc, draftId)?.id).toBe(a.result.roundId);
    const retry = await createRound(edited.doc, input({ score: { mode: "GBE", adjustedGrossScore: 90 } }), ctx, draftId);
    expect(retry.duplicate).toBe(true);
    expect(retry.doc.rounds).toHaveLength(1);

    const x = await createRound(emptyMemberDoc("u1"), input({}), ctx);
    const y = await createRound(x.doc, input({}), ctx);
    expect(y.doc.rounds).toHaveLength(2);
    // ungültige Kennung wird nicht übernommen (kein Pfad, keine Sonderzeichen)
    const z = await createRound(emptyMemberDoc("u1"), input({}), ctx, "../../etc");
    expect(z.doc.rounds[0].clientRef).toBeUndefined();
  });

  it("gelöschte Runde blockiert einen neuen Versuch mit derselben Kennung nicht", async () => {
    const draftId = "d-1";
    const a = await createRound(emptyMemberDoc("u1"), input({}), ctx, draftId);
    const deleted = { ...a.doc, rounds: a.doc.rounds.map((r) => ({ ...r, status: "DELETED" as const })) };
    const b = await createRound(deleted, input({}), ctx, draftId);
    expect(b.duplicate).toBe(false);
    expect(b.doc.rounds.filter((r) => r.status !== "DELETED")).toHaveLength(1);
  });

  it("Einstellung Rundeneingabe: Standard „fragen“, nur gültige Werte", async () => {
    const doc = emptyMemberDoc("u1");
    expect(publicPreferences(doc).roundEntryMode).toBe("ASK");
    expect(publicPreferences(normalizeMemberDoc({ profile: doc.profile, preferences: { favorites: [] } }, "u1")).roundEntryMode).toBe("ASK");
    expect(setRoundEntryMode(doc, "DETAILED").preferences.roundEntryMode).toBe("DETAILED");
    expect(() => setRoundEntryMode(doc, "ADMIN")).toThrow(ApiError);
  });
});
