import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { RoundInput } from "@/lib/api/types";
import { can, canAssignRole, canManageUser, permissionsOf } from "@/lib/auth/permissions";
import { registerSchema } from "@/lib/auth/validation";
import type { CourseDto, RatingSetDto } from "@/lib/courses/types";
import { emptyMemberDoc, normalizeMemberDoc } from "@/lib/member/doc";
import { computeHcp, listRounds, roundDetail } from "@/lib/member/hcp";
import { roundToInput } from "@/lib/member/roundInput";
import {
  completeOnboarding,
  createRound,
  deleteDraft,
  deleteRound,
  importRounds,
  MAX_DRAFTS,
  previewRoundInput,
  recentCourseIds,
  saveDraft,
  setFavorite,
  updateRound,
  type MemberContext,
} from "@/lib/member/service";

// Fiktiver Testplatz (keine realen Ratings)
const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const LAYOUT_ID = "22222222-2222-4222-8222-222222222222";
const PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];

function rating(p: Partial<RatingSetDto>): RatingSetDto {
  return {
    id: `r-${Math.random()}`,
    layoutId: LAYOUT_ID,
    gender: "M",
    teeColor: "Gelb",
    teeName: null,
    holes: 18,
    nine: null,
    par: 72,
    courseRating: 71.8,
    slopeRating: 135,
    yardage: null,
    validFrom: null,
    validTo: null,
    sourceType: "OFFICIAL_SCORECARD",
    sourceUrl: null,
    checkedAt: "2026-01-01",
    verified: true,
    lastVerifiedAt: "2026-01-01",
    confidence: "HIGH",
    active: true,
    notes: null,
    ...p,
  };
}

const course: CourseDto = {
  id: COURSE_ID,
  slug: "testclub",
  name: "Testclub Musterstadt",
  officialName: null,
  clubName: null,
  facilityType: "GOLF_COURSE",
  city: "Musterstadt",
  postalCode: null,
  address: null,
  federalState: "BY",
  country: "DE",
  region: "SCHWABEN",
  latitude: null,
  longitude: null,
  website: null,
  officialSourceUrl: null,
  bayernGolfverbandUrl: null,
  externalClubId: null,
  active: true,
  verified: true,
  lastVerifiedAt: null,
  notes: null,
  layouts: [
    {
      id: LAYOUT_ID,
      courseId: COURSE_ID,
      name: "18-Loch-Platz",
      type: "18_HOLE",
      combinationName: null,
      holesCount: 18,
      active: true,
      notes: null,
      ratingSets: [
        rating({}),
        rating({ holes: 9, nine: "FRONT", par: 36, courseRating: 35.9, slopeRating: 133 }),
        rating({ gender: "F", teeColor: "Rot", courseRating: 73.5, slopeRating: 128, verified: false }),
      ],
      holes: PARS.map((par, i) => ({ id: `h${i}`, layoutId: LAYOUT_ID, holeNumber: i + 1, par, strokeIndex: ((i * 7) % 18) + 1, lengthMen: null, lengthWomen: null, teeColor: null, gender: null })),
    },
  ],
};

let counter = 0;
const ctx: MemberContext = { courseLookup: (id) => (id === COURSE_ID ? course : null), newId: () => `round-${++counter}` };

function input(p: Partial<RoundInput> = {}): RoundInput {
  return {
    date: "2026-09-01",
    category: "TOURNAMENT",
    course: { kind: "DB", courseId: COURSE_ID, layoutId: LAYOUT_ID, teeColor: "Gelb", gender: "M" },
    holes: 18,
    score: { mode: "GBE", adjustedGrossScore: 94 },
    ...p,
  };
}

async function expectApiError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code);
}

describe("Mitglieder-Service: Handicap", () => {
  it("ohne Runden: Ausgangshandicap (Initial Handicap, kein Scoring Record)", () => {
    const doc = completeOnboarding(emptyMemberDoc("u1"), { startHandicapIndex: 36.4 });
    const hcp = computeHcp(doc);
    expect(hcp.status).toBe("INITIAL");
    expect(hcp.currentHandicapIndex).toBe(36.4);
    expect(hcp.calculatedHandicapIndex).toBeNull();
    expect(hcp.lastRound).toBeNull();
    expect(doc.preferences.onboardedAt).not.toBeNull();
  });

  it("18 Loch: Rating wird serverseitig aus der Golfplatzdatenbank geladen (SD 18,6)", async () => {
    const { doc, result } = await createRound(emptyMemberDoc("u1"), input(), ctx);
    expect(result.item.scoreDifferential).toBe(18.6);
    expect(result.item.courseName).toBe("Testclub Musterstadt");
    const round = doc.rounds[0];
    expect(round.rating).toMatchObject({ courseRating: 71.8, slopeRating: 135, par: 72, verified: true });
    expect(round.computed?.scoreDifferential).toBe(18.6);
    expect(round.computed?.engine).toMatch(/2026/);
  });

  it("vom Client mitgeschickte Ratingwerte werden bei DB-Plätzen ignoriert", async () => {
    const tampered = { ...input(), course: { ...input().course!, courseRating: 60, slopeRating: 55 } } as unknown as RoundInput;
    const { doc } = await createRound(emptyMemberDoc("u1"), tampered, ctx);
    expect(doc.rounds[0].rating.courseRating).toBe(71.8);
  });

  it("9 Loch: offizielles 9-Loch-Rating der Hälfte; fehlt es, klare Fehlermeldung (keine Ableitung)", async () => {
    const nine = await previewRoundInput(emptyMemberDoc("u1"), input({ holes: 9, nine: "FRONT", score: { mode: "GBE", adjustedGrossScore: 50 } }), ctx);
    expect(nine.result.scoreDifferential?.method).toBe("NINE_EXPECTED");
    expect(nine.result.scoreDifferential?.courseRating).toBe(35.9);
    await expectApiError(previewRoundInput(emptyMemberDoc("u1"), input({ holes: 9, nine: "BACK", score: { mode: "GBE", adjustedGrossScore: 50 } }), ctx), "NINE_HOLE_RATING_MISSING");
  });

  it("nicht verifiziertes Rating wird nicht automatisch verwendet", async () => {
    await expectApiError(
      previewRoundInput(emptyMemberDoc("u1"), input({ course: { kind: "DB", courseId: COURSE_ID, layoutId: LAYOUT_ID, teeColor: "Rot", gender: "F" } }), ctx),
      "RATING_NOT_VERIFIED",
    );
    await expectApiError(
      previewRoundInput(emptyMemberDoc("u1"), input({ course: { kind: "DB", courseId: COURSE_ID, layoutId: LAYOUT_ID, teeColor: "Blau", gender: "M" } }), ctx),
      "COURSE_RATING_MISSING",
    );
  });

  it("Scorekarte: GBE mit Netto-Doppelbogey aus den Lochdaten des Platzes", async () => {
    const strokes = PARS.map((p) => p + 6); // überall weit über Netto-Doppelbogey
    const preview = await previewRoundInput(completeOnboarding(emptyMemberDoc("u1"), { startHandicapIndex: 20 }), input({ score: { mode: "HOLES", strokes } }), ctx);
    const sum = strokes.reduce((a, b) => a + b, 0);
    expect(preview.item.adjustedGrossScore).toBeLessThan(sum);
    expect(preview.result.gbe?.holes.some((h) => h.reason === "NET_DOUBLE_BOGEY_LIMIT")).toBe(true);
  });

  it("GBE über dem Netto-Doppelbogey-Maximum: verständlicher Hinweis in der Vorschau", async () => {
    const preview = await previewRoundInput(completeOnboarding(emptyMemberDoc("u1"), { startHandicapIndex: 5 }), input({ score: { mode: "GBE", adjustedGrossScore: 200 } }), ctx);
    expect(preview.issues.join(" ")).toMatch(/Netto-Doppelbogey/);
  });

  it("nicht berechenbare Runden (blockierende Fehler) werden nicht gespeichert", async () => {
    const strokes = PARS.map((p, i) => (i < 5 ? p : null));
    const preview = await previewRoundInput(emptyMemberDoc("u1"), input({ score: { mode: "HOLES", strokes } }), ctx);
    if (preview.blocking) await expectApiError(createRound(emptyMemberDoc("u1"), input({ score: { mode: "HOLES", strokes } }), ctx), "ROUND_INVALID");
    else expect(preview.item.relevant).toBe(false);
  });

  it("Validierung: Datum, fehlender Platz und GBE werden am Feld gemeldet", async () => {
    try {
      await previewRoundInput(emptyMemberDoc("u1"), { ...input(), date: "2026-13-40", course: null, score: { mode: "GBE", adjustedGrossScore: 5 } }, ctx);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const fields = (e as ApiError).fields!;
      expect(Object.keys(fields)).toEqual(expect.arrayContaining(["date", "course", "score.adjustedGrossScore"]));
    }
  });

  it("HCPI ab drei Runden; Vorher/Nachher und Veränderung seit der letzten Runde", async () => {
    let doc = completeOnboarding(emptyMemberDoc("u1"), { startHandicapIndex: 30 });
    const gbes = [100, 96, 92];
    let last;
    for (const [i, gbe] of gbes.entries()) {
      const r = await createRound(doc, input({ date: `2026-08-0${i + 1}`, score: { mode: "GBE", adjustedGrossScore: gbe } }), ctx);
      doc = r.doc;
      last = r.result;
    }
    const hcp = computeHcp(doc);
    expect(hcp.status).toBe("ACTIVE");
    expect(hcp.scoringRecordCount).toBe(3);
    expect(hcp.calculationLabel).toMatch(/besten|Bestes/);
    expect(last!.hcpBefore).toBe(30);
    expect(last!.hcpAfter).toBe(hcp.currentHandicapIndex);
    expect(hcp.changeSinceLastRound?.after).toBe(hcp.currentHandicapIndex);
    expect(hcp.history.length).toBeGreaterThanOrEqual(2);
    expect(hcp.lastRound?.date).toBe("2026-08-03");
    expect(listRounds(doc)).toHaveLength(3);
    expect(listRounds(doc, { holes: 9 })).toHaveLength(0);
  });

  it("Bearbeiten einer älteren Runde berechnet den Verlauf vollständig neu; Löschen ist ein Soft Delete", async () => {
    let doc = completeOnboarding(emptyMemberDoc("u1"), { startHandicapIndex: 30 });
    for (const [i, gbe] of [100, 96, 92].entries()) doc = (await createRound(doc, input({ date: `2026-08-0${i + 1}`, score: { mode: "GBE", adjustedGrossScore: gbe } }), ctx)).doc;
    const before = computeHcp(doc).currentHandicapIndex;
    const first = [...doc.rounds].sort((a, b) => a.date.localeCompare(b.date))[0];
    doc = (await updateRound(doc, first.id, { ...roundToInput(first), score: { mode: "GBE", adjustedGrossScore: 88 } }, ctx)).doc;
    const edited = computeHcp(doc).currentHandicapIndex;
    expect(edited).toBeLessThan(before);
    expect(doc.rounds.find((r) => r.id === first.id)?.createdAt).toBe(first.createdAt);
    doc = deleteRound(doc, first.id, "2026-09-02T00:00:00Z");
    expect(doc.rounds).toHaveLength(3);
    expect(doc.rounds.find((r) => r.id === first.id)?.status).toBe("DELETED");
    expect(listRounds(doc)).toHaveLength(2);
    expect(computeHcp(doc).scoringRecordCount).toBe(2);
    expect(() => roundDetail(doc, first.id)).toThrow(ApiError);
    expect(() => deleteRound(doc, first.id)).toThrow(ApiError);
  });

  it("Entwürfe zählen nicht und werden begrenzt; Speichern entfernt den Entwurf", async () => {
    let doc = emptyMemberDoc("u1");
    for (let i = 0; i < MAX_DRAFTS + 3; i++) doc = saveDraft(doc, { id: `d${i}`, label: `Entwurf ${i}`, input: { date: "2026-09-01" } });
    expect(doc.drafts).toHaveLength(MAX_DRAFTS);
    expect(doc.drafts[0].id).toBe(`d${MAX_DRAFTS + 2}`);
    expect(computeHcp(doc).status).toBe("INITIAL");
    const { doc: saved } = await createRound(doc, input(), ctx, doc.drafts[0].id);
    expect(saved.drafts.some((d) => d.id === `d${MAX_DRAFTS + 2}`)).toBe(false);
    expect(deleteDraft(saved, saved.drafts[0].id).drafts).toHaveLength(MAX_DRAFTS - 2);
  });

  it("Favoriten, zuletzt gespielte Plätze", async () => {
    let doc = setFavorite(emptyMemberDoc("u1"), COURSE_ID, true);
    expect(doc.preferences.favorites).toEqual([COURSE_ID]);
    doc = setFavorite(doc, COURSE_ID, false);
    expect(doc.preferences.favorites).toEqual([]);
    doc = (await createRound(doc, input(), ctx)).doc;
    expect(recentCourseIds(doc)).toEqual([COURSE_ID]);
  });

  it("CSV-Import bisheriger Runden (Score Differentials) → Neuberechnung", () => {
    const csv = "Datum;Golfplatz;Löcher;Score Differential\n2026-05-01;Platz A;18;20,1\n2026-05-08;Platz B;18;22,4\n2026-05-15;Platz C;18;19,0\nkaputt;;;\n";
    const { doc, imported, skipped } = importRounds(completeOnboarding(emptyMemberDoc("u1"), { startHandicapIndex: 30 }), csv, () => `imp-${++counter}`);
    expect(imported).toBe(3);
    expect(skipped).toBe(1);
    expect(computeHcp(doc).status).toBe("ACTIVE");
  });

  it("Datenstand der Konto-Version 1 wird übernommen", () => {
    const v1 = { profile: { ...emptyMemberDoc("u1").profile, homeCourseId: COURSE_ID }, rounds: [], settings: { theme: "dark" } };
    const doc = normalizeMemberDoc(v1, "u1");
    expect(doc.preferences.homeCourseId).toBe(COURSE_ID);
    expect(doc.drafts).toEqual([]);
    expect(normalizeMemberDoc(null, "u2").profile.id).toBe("u2");
  });
});

describe("Rollen und Berechtigungen", () => {
  const user = { id: "u", role: "USER" as const };
  const support = { id: "s", role: "SUPPORT" as const };
  const admin = { id: "a", role: "ADMIN" as const };
  const admin2 = { id: "a2", role: "ADMIN" as const };
  const sa = { id: "sa", role: "SUPER_ADMIN" as const };

  it("Matrix", () => {
    expect(can("USER", "admin.access")).toBe(false);
    expect(can("SUPPORT", "users.read")).toBe(true);
    expect(can("SUPPORT", "users.write")).toBe(false);
    expect(can("ADMIN", "courses.write")).toBe(true);
    expect(can("ADMIN", "users.roles")).toBe(false);
    expect(can("SUPER_ADMIN", "settings.write")).toBe(true);
    expect(can(null, "admin.access")).toBe(false);
    expect(permissionsOf("USER")).toEqual([]);
  });

  it("Rollen vergibt nur der Super-Admin, nie an sich selbst", () => {
    expect(canAssignRole(admin, user, "SUPPORT")).toBe(false);
    expect(canAssignRole(sa, user, "ADMIN")).toBe(true);
    expect(canAssignRole(sa, sa, "USER")).toBe(false);
  });

  it("Admins verwalten nur niedrigere Rollen", () => {
    expect(canManageUser(admin, user)).toBe(true);
    expect(canManageUser(admin, support)).toBe(true);
    expect(canManageUser(admin, admin2)).toBe(false);
    expect(canManageUser(admin, sa)).toBe(false);
    expect(canManageUser(support, user)).toBe(false);
    expect(canManageUser(sa, admin)).toBe(true);
    expect(canManageUser(admin, admin)).toBe(false);
  });

  it("Registrierung: Pflichtfelder, Passwortwiederholung, Datenschutz", () => {
    const ok = registerSchema.safeParse({ firstName: "Max", lastName: "Muster", email: " Max@Example.DE ", password: "geheim123", passwordRepeat: "geheim123", acceptTerms: true, handicapIndex: "36,4" });
    expect(ok.success && ok.data.email).toBe("max@example.de");
    expect(ok.success && ok.data.handicapIndex).toBe(36.4);
    const bad = registerSchema.safeParse({ firstName: "", lastName: "M", email: "x", password: "123", passwordRepeat: "456", acceptTerms: false });
    expect(bad.success).toBe(false);
  });
});
