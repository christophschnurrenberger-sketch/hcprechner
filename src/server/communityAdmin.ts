/**
 * Community im Admin-Bereich (Node-Edition): Übersicht, Ranking inkl. Nicht-Teilnehmern, öffentliche Runden,
 * Moderation und Datenqualität. Auswertungen der Spielleistung nur aggregiert (keine Einzelwerte).
 * Jede Änderung wird im Audit-Log protokolliert.
 */
import { and, asc, count, desc, eq, ilike, isNotNull, max, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { communityProfiles, publicRounds, rankingSnapshots, roundStatistics, users, type UserRow } from "@/db/schema";
import { apiError } from "@/lib/api/errors";
import type { Page } from "@/lib/api/types";
import { COMMUNITY_POLICY, levelWithFlags, normalizeSettings, roundLevel } from "@/lib/community/policy";
import type { AdminCommunityOverview, AdminPublicRoundRow, AdminRankingRow, ModerationAction, RoundVisibility } from "@/lib/community/types";
import { MODERATION_ACTIONS } from "@/lib/community/types";
import { ratesFromSums, type StatSums } from "@/lib/stats/aggregate";
import { audit } from "./audit";
import { communityFlags, ensureDailySnapshot, syncCommunity } from "./community";
import { withMemberDoc } from "./members";

const cp = communityProfiles;
const rs = roundStatistics;

const num = (v: unknown) => Number(v ?? 0);

export async function adminCommunityOverview(): Promise<AdminCommunityOverview> {
  const db = await getDb();
  const flags = await communityFlags();
  const [members] = await db.select({ n: count() }).from(users).where(eq(users.status, "ACTIVE"));
  const [profiles] = await db
    .select({
      profiles: sql<number>`count(*) filter (where ${cp.profileVisible})`,
      ranking: sql<number>`count(*) filter (where ${cp.rankingVisible})`,
      rounds: sql<number>`count(*) filter (where ${cp.roundsVisible})`,
      stats: sql<number>`count(*) filter (where ${cp.statsVisible})`,
    })
    .from(cp)
    .innerJoin(users, eq(users.id, cp.userId))
    .where(eq(users.status, "ACTIVE"));
  const [pub] = await db.select({ n: count(), full: sql<number>`count(*) filter (where ${publicRounds.level} = 'FULL')` }).from(publicRounds);
  const j = (key: string) => sql`coalesce(sum((${rs.stats}->>${key})::numeric) filter (where ${rs.detailed}), 0)`;
  const [agg] = await db
    .select({
      rounds: count(),
      detailedRounds: sql<number>`count(*) filter (where ${rs.detailed})`,
      completeRounds: sql<number>`count(*) filter (where ${rs.detailed} and ${rs.complete})`,
      withWarnings: sql<number>`count(*) filter (where ${rs.warnings} > 0)`,
      hidden: sql<number>`count(*) filter (where ${rs.hidden})`,
      totalPutts: j("totalPutts"),
      puttHoles: j("puttHoles"),
      puttRounds: sql<number>`count(*) filter (where ${rs.detailed} and (${rs.stats}->>'puttHoles')::int > 0)`,
      girs: j("girs"),
      girHoles: j("girHoles"),
      firs: j("firs"),
      fairwayOpportunities: j("fairwayOpportunities"),
      upAndDowns: j("upAndDowns"),
      upAndDownAttempts: j("upAndDownAttempts"),
      sandSaves: j("sandSaves"),
      sandAttempts: j("sandAttempts"),
      threePutts: j("threePutts"),
      penaltyStrokes: j("penaltyStrokes"),
      penaltyRounds: sql<number>`count(*) filter (where ${rs.detailed} and ${rs.stats}->>'penaltyStrokes' is not null)`,
    })
    .from(rs)
    .innerJoin(users, eq(users.id, rs.userId));
  const sums: StatSums = {
    rounds: num(agg.rounds),
    detailedRounds: num(agg.detailedRounds),
    completeRounds: num(agg.completeRounds),
    totalPutts: num(agg.totalPutts),
    puttHoles: num(agg.puttHoles),
    puttRounds: num(agg.puttRounds),
    girs: num(agg.girs),
    girHoles: num(agg.girHoles),
    firs: num(agg.firs),
    fairwayOpportunities: num(agg.fairwayOpportunities),
    upAndDowns: num(agg.upAndDowns),
    upAndDownAttempts: num(agg.upAndDownAttempts),
    sandSaves: num(agg.sandSaves),
    sandAttempts: num(agg.sandAttempts),
    threePutts: num(agg.threePutts),
    penaltyStrokes: num(agg.penaltyStrokes),
    penaltyRounds: num(agg.penaltyRounds),
  };
  const [snap] = await db.select({ d: max(rankingSnapshots.snapshotDate) }).from(rankingSnapshots);
  return {
    flags,
    members: num(members.n),
    profilesVisible: num(profiles?.profiles),
    rankingOptIn: num(profiles?.ranking),
    roundsVisibleUsers: num(profiles?.rounds),
    statsVisibleUsers: num(profiles?.stats),
    publicRounds: num(pub.n),
    publicRoundsFull: num(pub.full),
    hiddenRounds: num(agg.hidden),
    performance: ratesFromSums(sums),
    dataQuality: { roundsWithoutStats: sums.rounds - sums.detailedRounds, incompleteStats: sums.detailedRounds - sums.completeRounds, withWarnings: num(agg.withWarnings) },
    lastSnapshotDate: snap?.d ?? null,
  };
}

export async function adminCommunityRanking(params: { filter?: string | null; q?: string | null; page?: number; pageSize?: number }): Promise<Page<AdminRankingRow>> {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50));
  const q = (params.q ?? "").trim().slice(0, 60);
  const filter: SQL | undefined =
    params.filter === "OPT_IN" ? eq(cp.rankingVisible, true) : params.filter === "OPT_OUT" ? eq(cp.rankingVisible, false) : params.filter === "ACTIVE" ? eq(users.status, "ACTIVE") : undefined;
  const search = q ? or(ilike(cp.displayName, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`), ilike(users.lastName, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`), ilike(users.firstName, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)) : undefined;
  const where = and(filter, search);
  const ranked = and(eq(cp.rankingVisible, true), isNotNull(cp.handicapIndex), eq(users.status, "ACTIVE"));
  const fn = COMMUNITY_POLICY.ranking.ties === "DENSE" ? sql.raw("dense_rank()") : sql.raw("rank()");
  // Position nur unter Teilnehmern; Nicht-Teilnehmer ohne Platz
  const position = sql<number | null>`case when ${ranked} then cast(${fn} over (partition by (${ranked}) order by round(${cp.handicapIndex} * 10)) as integer) end`;
  const [{ n: total }] = await db.select({ n: count() }).from(cp).innerJoin(users, eq(users.id, cp.userId)).where(where);
  const rows = await db
    .select({ p: cp, first: users.firstName, last: users.lastName, status: users.status, position })
    .from(cp)
    .innerJoin(users, eq(users.id, cp.userId))
    .where(where)
    .orderBy(sql`${cp.rankingVisible} desc`, sql`${cp.handicapIndex} asc nulls last`, asc(cp.displayName))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: Number(total),
    page,
    pageSize,
    items: rows.map((r) => ({
      userId: r.p.userId,
      name: `${r.first} ${r.last}`.trim(),
      displayName: r.p.displayName,
      publicId: r.p.publicId,
      position: r.position ?? null,
      handicapIndex: r.p.handicapIndex,
      rankingVisible: r.p.rankingVisible,
      profileVisible: r.p.profileVisible,
      roundsVisible: r.p.roundsVisible,
      statsVisible: r.p.statsVisible,
      status: r.status,
      publicRoundsCount: r.p.publicRoundsCount,
    })),
  };
}

export async function adminPublicRounds(params: { filter?: string | null; q?: string | null; page?: number; pageSize?: number }): Promise<Page<AdminPublicRoundRow>> {
  const db = await getDb();
  const flags = await communityFlags();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50));
  const q = (params.q ?? "").trim().slice(0, 60).replace(/[\\%_]/g, (c) => `\\${c}`);
  const base = params.filter === "HIDDEN" ? eq(rs.hidden, true) : params.filter === "FULL" ? eq(rs.visibility, "MEMBERS_FULL") : or(ne(rs.visibility, "PRIVATE"), eq(rs.hidden, true));
  const where = and(base, q ? or(ilike(rs.courseName, `%${q}%`), ilike(cp.displayName, `%${q}%`), ilike(users.lastName, `%${q}%`)) : undefined);
  const [{ n: total }] = await db.select({ n: count() }).from(rs).innerJoin(users, eq(users.id, rs.userId)).leftJoin(cp, eq(cp.userId, rs.userId)).where(where);
  const rows = await db
    .select({ r: rs, first: users.firstName, last: users.lastName, p: cp })
    .from(rs)
    .innerJoin(users, eq(users.id, rs.userId))
    .leftJoin(cp, eq(cp.userId, rs.userId))
    .where(where)
    .orderBy(desc(rs.date), asc(rs.roundId))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: Number(total),
    page,
    pageSize,
    items: rows.map(({ r, first, last, p }) => {
      const settings = normalizeSettings({
        displayName: p?.displayName ?? null,
        rankingVisible: p?.rankingVisible ?? false,
        profileVisible: p?.profileVisible ?? false,
        roundsVisible: p?.roundsVisible ?? false,
        statsVisible: p?.statsVisible ?? false,
        notesVisible: p?.notesVisible ?? false,
        defaultRoundVisibility: "PRIVATE",
        publicId: p?.publicId ?? null,
        avatarVersion: null,
        updatedAt: null,
      });
      const lvl = roundLevel(settings, { visibility: r.visibility as RoundVisibility, moderation: r.hidden ? { hidden: true, reason: null, at: "", by: null } : null });
      return {
        userId: r.userId,
        userName: `${first} ${last}`.trim(),
        displayName: p?.displayName ?? "",
        roundId: r.roundId,
        date: r.date,
        courseName: r.courseName,
        holes: r.holes as 9 | 18,
        visibility: r.visibility as RoundVisibility,
        hidden: r.hidden,
        detailed: r.detailed,
        level: lvl ? levelWithFlags(lvl, flags) : null,
      };
    }),
  };
}

/** Moderation einer Runde: verbergen, wieder freigeben, auf „Nur ich“ setzen, Notizen entfernen. */
export async function moderateRound(actor: UserRow, userId: string, roundId: string, action: unknown, reason: unknown): Promise<void> {
  if (typeof action !== "string" || !MODERATION_ACTIONS.includes(action as ModerationAction)) throw apiError("VALIDATION", "Unbekannte Aktion.");
  const why = typeof reason === "string" ? reason.trim().slice(0, 300) || null : null;
  const now = new Date().toISOString();
  const actorName = `${actor.firstName} ${actor.lastName}`.trim();
  const { result } = await withMemberDoc(userId, (doc) => {
    const round = doc.rounds.find((r) => r.id === roundId && r.status !== "DELETED");
    if (!round) throw apiError("ROUND_NOT_FOUND");
    const old = { visibility: round.visibility ?? "PRIVATE", hidden: Boolean(round.moderation?.hidden), notes: Boolean(round.notes || round.holeStats?.some((h) => h.note)) };
    let next = { ...round };
    if (action === "HIDE") next.moderation = { hidden: true, reason: why, at: now, by: actorName };
    if (action === "UNHIDE") next.moderation = null;
    if (action === "MAKE_PRIVATE") next.visibility = "PRIVATE";
    if (action === "REMOVE_NOTES") {
      next = { ...next, notes: undefined, holeStats: next.holeStats?.map((h) => ({ ...h, note: null })) };
      if (!next.holeStats) delete next.holeStats;
    }
    const neu = { visibility: next.visibility ?? "PRIVATE", hidden: Boolean(next.moderation?.hidden), notes: Boolean(next.notes || next.holeStats?.some((h) => h.note)) };
    return { doc: { ...doc, rounds: doc.rounds.map((r) => (r.id === roundId ? next : r)) }, result: { old, neu, course: round.course.courseName, date: round.date } };
  });
  await syncCommunity(userId);
  const auditAction = action === "HIDE" ? "PUBLIC_ROUND_HIDDEN" : action === "UNHIDE" ? "PUBLIC_ROUND_UNHIDDEN" : "PUBLIC_ROUND_MODIFIED";
  await audit(auditAction, actor, { userId, entityType: "round", entityId: roundId, oldValue: result.old, newValue: { ...result.neu, action, reason: why, courseName: result.course, date: result.date } });
}

/**
 * Sichtbarkeit eines Mitglieds abschalten (z. B. auf Beschwerde). Einschalten kann nur das Mitglied selbst –
 * der Admin umgeht Privatsphäre-Einstellungen nie zugunsten einer Veröffentlichung.
 */
export async function hideUserCommunity(actor: UserRow, userId: string, patch: { rankingVisible?: unknown; profileVisible?: unknown }): Promise<void> {
  const changes: ("rankingVisible" | "profileVisible")[] = [];
  if (patch.rankingVisible === false) changes.push("rankingVisible");
  if (patch.profileVisible === false) changes.push("profileVisible");
  if (!changes.length) throw apiError("VALIDATION", "Der Admin kann Sichtbarkeit nur abschalten.");
  const { result: old } = await withMemberDoc(userId, (doc) => {
    const before = { rankingVisible: doc.community.rankingVisible, profileVisible: doc.community.profileVisible };
    const next = { ...doc.community };
    for (const k of changes) next[k] = false;
    return { doc: { ...doc, community: { ...normalizeSettings(next), updatedAt: new Date().toISOString() } }, result: before };
  });
  await syncCommunity(userId);
  for (const k of changes) {
    if (old[k] === false) continue;
    await audit(k === "rankingVisible" ? "USER_RANKING_VISIBILITY_CHANGED" : "USER_PROFILE_VISIBILITY_CHANGED", actor, { userId, entityType: "user", entityId: userId, oldValue: { [k]: true }, newValue: { [k]: false } });
  }
}

/** Alle Community-Daten neu berechnen (z. B. nach Regeländerung) und den heutigen Ranking-Stand ersetzen. */
export async function refreshRanking(actor: UserRow): Promise<{ users: number; snapshotDate: string }> {
  const db = await getDb();
  const ids = await db.select({ id: users.id }).from(users);
  for (const { id } of ids) await syncCommunity(id);
  const snapshotDate = await ensureDailySnapshot(true);
  await audit("RANKING_REFRESHED", actor, { entityType: "ranking", newValue: { users: ids.length, snapshotDate } });
  return { users: ids.length, snapshotDate };
}
