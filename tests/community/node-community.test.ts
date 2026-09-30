import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserRow } from "@/db/schema";
import type { MemberDoc } from "@/lib/member/doc";

// Eingebettete In-Memory-Datenbank (oder TEST_DATABASE_URL); fiktive Mitglieder und fiktiver Testplatz.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
}

const { getDb, closeDb } = await import("@/db/client");
const { users, rankingSnapshots } = await import("@/db/schema");
const { withMemberDoc } = await import("@/server/members");
const community = await import("@/server/community");
const service = await import("@/lib/member/service");
const memberCommunity = await import("@/lib/member/community");
const { emptyHoleStat } = await import("@/lib/stats/holeStats");
const { ctx, input, PARS } = await import("../member/fixtures");

async function createUser(firstName: string, lastName: string): Promise<UserRow> {
  const db = await getDb();
  const [u] = await db.insert(users).values({ email: `${firstName.toLowerCase()}@example.de`, firstName, lastName, passwordHash: "x", emailVerified: true }).returning();
  return u;
}

/** Mitglied mit Start-HCPI (ohne Runden) und Community-Einstellungen. */
async function setup(user: UserRow, start: number, settings: Parameters<typeof memberCommunity.updateCommunitySettings>[1], build?: (doc: MemberDoc) => Promise<MemberDoc>) {
  await withMemberDoc(user.id, async (doc) => {
    let next = service.setStartHandicap(doc, start);
    next = memberCommunity.updateCommunitySettings(next, settings);
    if (build) next = await build(next);
    return { doc: next, result: null };
  });
  return community.syncCommunity(user.id);
}

describe("Community (Node-Edition, PGlite)", () => {
  let anna: UserRow, bert: UserRow, carl: UserRow, dora: UserRow, eva: UserRow;
  let bertPublic = "";

  beforeAll(async () => {
    [anna, bert, carl, dora, eva] = await Promise.all([createUser("Anna", "Adler"), createUser("Bert", "Berg"), createUser("Carl", "Christ"), createUser("Dora", "Dach"), createUser("Eva", "Eich")]);
    await setup(anna, 20.1, { rankingVisible: true, profileVisible: true });
    const b = await setup(bert, 20.1, { rankingVisible: true, profileVisible: true, roundsVisible: true, statsVisible: true }, async (doc) => {
      const holeStats = PARS.map((par, i) => ({ ...emptyHoleStat(i + 1, par), score: par + 1, putts: 2, gir: i < 9, note: i === 0 ? "privat" : null }));
      let d = (await service.createRound(doc, input({ date: "2026-09-10", holeStats, visibility: "MEMBERS_FULL" }), ctx)).doc;
      d = (await service.createRound(d, input({ date: "2026-09-11", visibility: "PRIVATE" }), ctx)).doc;
      return d;
    });
    bertPublic = b!.publicId;
    await setup(carl, 25.3, { rankingVisible: true, profileVisible: false });
    await setup(dora, 12.0, { rankingVisible: false, profileVisible: true });
    await setup(eva, 5.0, {});
  });

  afterAll(async () => {
    await closeDb();
  });

  it("Ranking: nur Teilnehmer, niedrigster HCPI zuerst, Gleichstand teilt den Platz (1, 1, 3)", async () => {
    const r = await community.rankingPage(anna, {});
    expect(r.items.map((e) => [e.displayName, e.position])).toEqual([
      ["Anna A.", 1],
      ["Bert B.", 1],
      ["Carl C.", 3],
    ]);
    expect(r.total).toBe(3);
    expect(r.items[0].isMe).toBe(true);
    expect(r.me).toMatchObject({ participating: true, position: 1, handicapIndex: 20.1 });
    expect(JSON.stringify(r)).not.toMatch(/example\.de|"userId"/);
  });

  it("Nicht-Teilnehmer erscheint nicht, sieht aber (nur für sich) seine Position", async () => {
    const r = await community.rankingPage(dora, {});
    expect(r.items.some((e) => e.displayName === "Dora D.")).toBe(false);
    expect(r.me).toMatchObject({ participating: false, position: 1 });
    expect((await community.rankingPage(eva, {})).me).toMatchObject({ participating: false, position: 1 });
  });

  it("Trend gegenüber dem letzten Tagesstand (+ = Plätze gewonnen)", async () => {
    const db = await getDb();
    await db.insert(rankingSnapshots).values({ snapshotDate: "2026-01-01", scope: "ALL", userId: carl.id, position: 7, handicapIndex: 30 });
    const r = await community.rankingPage(carl, {});
    expect(r.items.find((e) => e.isMe)?.trend).toBe(4);
    expect(r.me?.trendSince).toBe("2026-01-01");
    expect(r.previousSnapshotDate).toBe("2026-01-01");
  });

  it("Mitglieder: nur sichtbare Profile, Suche nach Namen (nicht E-Mail)", async () => {
    const all = await community.membersPage(anna, {});
    expect(all.items.map((m) => m.displayName).sort()).toEqual(["Anna A.", "Bert B.", "Dora D."]);
    expect((await community.membersPage(anna, { q: "ber" })).items.map((m) => m.displayName)).toEqual(["Bert B."]);
    expect((await community.membersPage(anna, { q: "bert@example" })).items).toHaveLength(0);
    const carlPublic = (await community.rankingPage(anna, {})).items.find((e) => e.displayName === "Carl C.")!.publicId;
    await expect(community.memberProfile(anna, carlPublic)).rejects.toMatchObject({ code: "MEMBER_NOT_FOUND" });
  });

  it("Profil und öffentliche Runden: private Runde bleibt verborgen, Details gemäß Freigabe, Notizen privat", async () => {
    const profile = await community.memberProfile(anna, bertPublic);
    expect(profile).toMatchObject({ displayName: "Bert B.", roundsCount: 2, publicRoundsCount: 1, rankingPosition: 1 });
    expect(profile.performance?.roundsWithStats).toBe(1);
    const rounds = await community.memberRounds(anna, bertPublic);
    expect(rounds.items).toHaveLength(1);
    const view = await community.publicRound(anna, bertPublic, rounds.items[0].roundId);
    expect(view.level).toBe("FULL");
    expect(view.stats?.totalPutts).toBe(36);
    expect(view.holeStats?.[0].note).toBeNull();
    expect(view.isMine).toBe(false);
    const doc = await (await import("@/server/members")).loadMemberDoc(bert.id);
    const priv = doc.doc.rounds.find((r) => r.visibility === "PRIVATE")!;
    await expect(community.publicRound(anna, bertPublic, priv.id)).rejects.toMatchObject({ code: "ROUND_NOT_FOUND" });
  });

  it("Aktivität zeigt nur öffentliche Runden sichtbarer Profile", async () => {
    const feed = await community.activityPage(anna, 1);
    expect(feed.items.map((i) => i.round.member.displayName)).toEqual(["Bert B."]);
  });

  it("Statistikfreigabe aus → Runde nur noch mit Basisdaten", async () => {
    await withMemberDoc(bert.id, (doc) => ({ doc: memberCommunity.updateCommunitySettings(doc, { statsVisible: false }), result: null }));
    await community.syncCommunity(bert.id);
    const rounds = await community.memberRounds(anna, bertPublic);
    const view = await community.publicRound(anna, bertPublic, rounds.items[0].roundId);
    expect(view.level).toBe("BASIC");
    expect(view.stats).toBeNull();
    expect(view.holeStats).toBeNull();
    expect((await community.memberProfile(anna, bertPublic)).performance).toBeNull();
  });

  it("Admin: Übersicht aggregiert, Moderation verbirgt Runde (Audit), Sichtbarkeit nur abschaltbar", async () => {
    const admin = await import("@/server/communityAdmin");
    const { auditEntries } = await import("@/server/audit");
    const overview = await admin.adminCommunityOverview();
    expect(overview.rankingOptIn).toBe(3);
    expect(overview.publicRounds).toBe(1);
    expect(overview.performance.detailedRounds).toBe(1);
    expect(overview.performance.puttsPerHole).toBe(2);
    expect(overview.dataQuality.roundsWithoutStats).toBe(1);
    const listed = await admin.adminPublicRounds({});
    expect(listed.items).toHaveLength(1);
    const roundId = listed.items[0].roundId;
    await admin.moderateRound(anna, bert.id, roundId, "HIDE", "Test");
    await expect(community.publicRound(anna, bertPublic, roundId)).rejects.toMatchObject({ code: "ROUND_NOT_FOUND" });
    expect((await admin.adminPublicRounds({ filter: "HIDDEN" })).items[0]).toMatchObject({ hidden: true, level: null });
    const log = await auditEntries({ action: "PUBLIC_ROUND_HIDDEN" }, 1, 5);
    expect(log.items[0]).toMatchObject({ userId: bert.id, entityId: roundId });
    await admin.moderateRound(anna, bert.id, roundId, "UNHIDE", null);
    expect((await community.memberRounds(anna, bertPublic)).items).toHaveLength(1);
    await expect(admin.hideUserCommunity(anna, bert.id, { rankingVisible: true })).rejects.toMatchObject({ code: "VALIDATION" });
    await admin.hideUserCommunity(anna, bert.id, { rankingVisible: false });
    expect((await community.rankingPage(anna, {})).items.map((e) => e.displayName)).not.toContain("Bert B.");
    expect((await auditEntries({ action: "USER_RANKING_VISIBILITY_CHANGED" }, 1, 5)).total).toBe(1);
  });

  it("deaktiviertes Konto verschwindet aus Ranking und Mitgliederliste", async () => {
    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    await db.update(users).set({ status: "DISABLED" }).where(eq(users.id, carl.id));
    expect((await community.rankingPage(anna, {})).items.map((e) => e.displayName)).toEqual(["Anna A."]);
  });
});
