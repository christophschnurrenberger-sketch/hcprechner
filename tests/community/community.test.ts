import { describe, expect, it } from "vitest";
import { defaultCommunitySettings, DEFAULT_FLAGS, defaultDisplayName, initialsOf, levelWithFlags, normalizeSettings, roundLevel, sanitizeDisplayName } from "@/lib/community/policy";
import { memberRef, projectCommunity, roundSummaryFor, roundViewFor, type CommunityRound } from "@/lib/community/projection";
import { positionOf, rankList, trendOf } from "@/lib/community/ranking";
import type { CommunitySettings, MemberSummary } from "@/lib/community/types";
import { emptyHoleStat } from "@/lib/stats/holeStats";
import { roundStatistics } from "@/lib/stats/roundStatistics";

const P = (publicId: string, handicapIndex: number, displayName = publicId) => ({ publicId, displayName, handicapIndex });

describe("Ranking", () => {
  it("niedrigster HCPI zuerst: A 10, B 20, C 30", () => {
    expect(rankList([P("C", 30), P("A", 10), P("B", 20)]).map((e) => [e.publicId, e.position])).toEqual([
      ["A", 1],
      ["B", 2],
      ["C", 3],
    ]);
  });

  it("Gleichstand: 20,1 und 20,1 teilen Platz 1, danach Platz 3 (Wettkampf-Rang)", () => {
    const r = rankList([P("C", 25.3), P("B", 20.1, "Bert"), P("A", 20.1, "Anna")]);
    expect(r.map((e) => [e.publicId, e.position])).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 3],
    ]);
    expect(rankList([P("C", 25.3), P("B", 20.1), P("A", 20.1)], "DENSE").map((e) => e.position)).toEqual([1, 1, 2]);
  });

  it("Gleitkomma-Darstellung spielt keine Rolle (Vergleich auf Zehntel)", () => {
    expect(rankList([P("A", 18.4), P("B", 18.400000000000002)]).map((e) => e.position)).toEqual([1, 1]);
  });

  it("Nicht-Teilnehmer: Position nur für sich berechnet", () => {
    expect(positionOf(19, [10, 20, 30])).toBe(2);
    expect(positionOf(20, [10, 20, 20, 30])).toBe(2);
    expect(trendOf(52, 48)).toBe(4);
    expect(trendOf(null, 48)).toBeNull();
  });
});

const settings = (patch: Partial<CommunitySettings> = {}): CommunitySettings => ({ ...defaultCommunitySettings(), publicId: "pub-max", ...patch });

const summary: MemberSummary = { handicapIndex: 18.7, lowHandicapIndex: 17.9, roundsCount: 3, lastRoundDate: "2026-09-18", performance: null, computedAt: "2026-09-30T10:00:00Z" };

function round(id: string, patch: Partial<CommunityRound> = {}): CommunityRound {
  const holeStats = [4, 4, 3, 5, 4, 4, 3, 5, 4].map((par, i) => ({ ...emptyHoleStat(i + 1, par), score: par + 1, putts: 2, gir: i % 2 === 0, note: i === 0 ? "Drive rechts ins Wasser" : null }));
  return {
    id,
    date: "2026-09-18",
    sequence: 0,
    title: "Runde",
    category: "RPR",
    format: "STROKE",
    resultStatus: "NORMAL",
    holes: 9,
    course: { courseName: "Testplatz", courseId: "c1", country: "DE", teeColor: "Gelb" },
    rating: { holes: 9, par: 36, courseRating: 35.9, slopeRating: 133, nine: "FRONT" },
    pcc: 0,
    entry: { mode: "AGS", adjustedGrossScore: 45 },
    notes: "privat",
    createdAt: "2026-09-18T18:00:00Z",
    updatedAt: "2026-09-18T18:00:00Z",
    status: "COMPLETED",
    holeStats,
    computed: { scoreDifferential: 20.4, adjustedGrossScore: 45, handicapIndexBefore: 19, handicapIndexAfter: 18.7, engine: "test", computedAt: "x", stats: roundStatistics(holeStats) },
    ...patch,
  };
}

describe("Privatsphäre", () => {
  it("Standard: alles aus (Opt-in)", () => {
    const d = defaultCommunitySettings();
    expect([d.rankingVisible, d.profileVisible, d.roundsVisible, d.statsVisible, d.notesVisible]).toEqual([false, false, false, false, false]);
    expect(d.defaultRoundVisibility).toBe("PRIVATE");
  });

  it("Runden und Statistik nur mit sichtbarem Profil, Notizen nur mit Runden + Statistik", () => {
    const s = normalizeSettings(settings({ profileVisible: false, roundsVisible: true, statsVisible: true, notesVisible: true }));
    expect([s.roundsVisible, s.statsVisible, s.notesVisible]).toEqual([false, false, false]);
  });

  it("private Runde, gelöschte oder vom Admin verborgene Runde ist nie sichtbar", () => {
    const s = settings({ profileVisible: true, roundsVisible: true });
    expect(roundLevel(s, round("a", { visibility: "PRIVATE" }))).toBeNull();
    expect(roundLevel(s, round("a", { visibility: "MEMBERS_FULL", status: "DELETED" }))).toBeNull();
    expect(roundLevel(s, round("a", { visibility: "MEMBERS_FULL", moderation: { hidden: true, reason: null, at: "x", by: "admin" } }))).toBeNull();
    expect(roundLevel(settings({ profileVisible: true }), round("a", { visibility: "MEMBERS_BASIC" }))).toBeNull();
  });

  it("MEMBERS_FULL ohne Statistikfreigabe → nur Basisdaten; Admin-Schalter wirken zusätzlich", () => {
    expect(roundLevel(settings({ profileVisible: true, roundsVisible: true }), round("a", { visibility: "MEMBERS_FULL" }))).toBe("BASIC");
    expect(roundLevel(settings({ profileVisible: true, roundsVisible: true, statsVisible: true }), round("a", { visibility: "MEMBERS_FULL" }))).toBe("FULL");
    expect(levelWithFlags("FULL", { ...DEFAULT_FLAGS, statsSharingEnabled: false })).toBe("BASIC");
    expect(levelWithFlags("BASIC", { ...DEFAULT_FLAGS, publicRoundsEnabled: false })).toBeNull();
  });

  it("Anzeigename: Standard „Vorname N.“, keine E-Mail-Adressen oder Links", () => {
    expect(defaultDisplayName("Christoph", "Schnurrenberger")).toBe("Christoph S.");
    expect(initialsOf("Christoph S.")).toBe("CS");
    expect(sanitizeDisplayName("  Max   M. ")).toBe("Max M.");
    expect(sanitizeDisplayName("max@example.de")).toBeNull();
    expect(sanitizeDisplayName("www.spam.de")).toBeNull();
    expect(sanitizeDisplayName("A")).toBeNull();
  });
});

describe("Öffentliche Runde: Basis vs. Details", () => {
  const avatar = (id: string, v: number) => `/avatar/${id}?v=${v}`;
  const project = (s: CommunitySettings, rounds: CommunityRound[]) =>
    projectCommunity({ userId: "u-intern", account: { firstName: "Max", lastName: "Muster" }, settings: s, summary, rounds, home: { id: "c1", name: "Testplatz", region: "SCHWABEN" }, now: "2026-09-30T10:00:00Z" });

  it("Basisdaten: Score sichtbar, keine Putts/GIR/Scorekarte, keine Notizen", () => {
    const { rounds, profile } = project(settings({ profileVisible: true, roundsVisible: true }), [round("a", { visibility: "MEMBERS_FULL" }), round("b")]);
    expect(rounds).toHaveLength(1);
    const view = roundViewFor(rounds[0], memberRef(profile, avatar), DEFAULT_FLAGS, false)!;
    expect(view.level).toBe("BASIC");
    expect(view.grossScore).toBe(45);
    expect(view.scoreDifferential).toBe(20.4);
    expect(view.stats).toBeNull();
    expect(view.holeStats).toBeNull();
    expect(view.notes).toBeNull();
    expect(JSON.stringify(view)).not.toContain("u-intern");
  });

  it("Details: Scorekarte mit Putts, GIR, FIR, Bunker, Up & Down – Notizen nur mit Freigabe", () => {
    const s = settings({ profileVisible: true, roundsVisible: true, statsVisible: true });
    const withoutNotes = project(s, [round("a", { visibility: "MEMBERS_FULL" })]);
    const view = roundViewFor(withoutNotes.rounds[0], memberRef(withoutNotes.profile, avatar), DEFAULT_FLAGS, false)!;
    expect(view.level).toBe("FULL");
    expect(view.stats?.totalPutts).toBe(18);
    expect(view.holeStats?.[0]).toMatchObject({ putts: 2, gir: true, fir: null, bunkerVisit: null, upAndDown: null, note: null });
    expect(view.notes).toBeNull();
    expect(view.insights[0]).not.toMatch(/^Du /);
    const withNotes = project({ ...s, notesVisible: true }, [round("a", { visibility: "MEMBERS_FULL" })]);
    expect(withNotes.rounds[0].holeStats?.[0].note).toBe("Drive rechts ins Wasser");
    expect(withNotes.rounds[0].notes).toBe("privat");
  });

  it("Profil: Statistik nur mit Freigabe; Zusammenfassung ohne interne Daten", () => {
    const perf = { ...summary, performance: { rounds: 1 } as MemberSummary["performance"] };
    const hidden = projectCommunity({ userId: "u", account: { firstName: "Max", lastName: "Muster" }, settings: settings({ profileVisible: true }), summary: perf, rounds: [], home: null, now: "x" });
    expect(hidden.profile.performance).toBeNull();
    expect(hidden.profile.displayName).toBe("Max M.");
    const summaryView = roundSummaryFor(project(settings({ profileVisible: true, roundsVisible: true }), [round("a", { visibility: "MEMBERS_BASIC" })]).rounds[0], memberRef(hidden.profile, avatar), DEFAULT_FLAGS);
    expect(summaryView?.member).toEqual({ publicId: "pub-max", displayName: "Max M.", initials: "MM", avatarUrl: null, profileVisible: true });
  });
});
