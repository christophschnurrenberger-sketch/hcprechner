/**
 * Community der Node-Edition.
 *
 * - Quelle aller Daten bleibt das Mitglieder-Dokument (member_data). Nach jeder Änderung berechnet
 *   `syncCommunity` serverseitig HCPI, Statistik und die freigegebenen Daten (Projektion) und speichert sie in
 *   community_profiles, public_rounds und round_statistics. Das Ranking sortiert nur noch diese Tabelle –
 *   bei vielen Mitgliedern wird nichts pro Seitenaufruf neu berechnet.
 * - Andere Mitglieder erhalten ausschließlich Daten aus der Projektion (keine interne Benutzer-ID, keine
 *   E-Mail, keine privaten Runden). Die Filterung passiert hier im Backend, nie im Browser.
 */
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, lt, max, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { communityProfiles, publicRounds, rankingSnapshots, roundStatistics, userAvatars, users, type UserRow } from "@/db/schema";
import { apiError } from "@/lib/api/errors";
import { COMMUNITY_POLICY, effectiveDisplayName } from "@/lib/community/policy";
import { memberRef, projectCommunity, roundSummaryFor, roundViewFor } from "@/lib/community/projection";
import type {
  ActivityItem,
  CommunityFlags,
  CommunityPage,
  CommunityProfileRecord,
  MemberListItem,
  MyCommunity,
  MyRanking,
  PublicProfileView,
  PublicRoundRecord,
  PublicRoundSummary,
  PublicRoundView,
  RankingEntry,
  RankingResponse,
  RankingScope,
} from "@/lib/community/types";
import { regionByKey } from "@/lib/courses/regions";
import { ensurePublicId, memberSummary } from "@/lib/member/community";
import { activeRounds } from "@/lib/member/doc";
import { statsOf } from "@/lib/member/hcp";
import { holeNumbersFor, validateHoleStats } from "@/lib/stats/holeStats";
import { hasStatistics } from "@/lib/stats/roundStatistics";
import { todayIso } from "@/lib/whs/dates";
import { getCourse } from "./courseRepository";
import { loadMemberDoc, withMemberDoc } from "./members";
import { getSettings } from "./settings";
import { userById } from "./users";

const cp = communityProfiles;

export const avatarPath = (publicId: string, version: number) => `/api/community/avatar/${encodeURIComponent(publicId)}?v=${version}`;

export async function communityFlags(): Promise<CommunityFlags> {
  return (await getSettings()).community;
}

function requireFlag(flags: CommunityFlags, ...keys: (keyof CommunityFlags)[]) {
  if (!flags.communityEnabled || keys.some((k) => !flags[k])) throw apiError("COMMUNITY_DISABLED");
}

// ---------------------------------------------------------------------------
// Abgleich Mitglieder-Dokument → Community-Tabellen
// ---------------------------------------------------------------------------

type ProfileRow = typeof communityProfiles.$inferSelect;


/** Öffentliche Kennung vergeben (einmalig, zufällig) und Dokument laden. */
async function docWithPublicId(userId: string) {
  const stored = await loadMemberDoc(userId);
  if (stored.doc.community.publicId) return stored.doc;
  await withMemberDoc(userId, (d) => {
    const next = ensurePublicId(d, randomUUID);
    return { doc: next === d ? null : next, result: null };
  });
  return (await loadMemberDoc(userId)).doc;
}

/**
 * Berechnet HCPI, Statistik und freigegebene Daten eines Mitglieds neu und speichert sie. Wird nach jeder
 * Änderung am Mitglieder-Dokument aufgerufen (außerhalb der Dokument-Transaktion).
 */
export async function syncCommunity(userId: string): Promise<CommunityProfileRecord | null> {
  const user = await userById(userId);
  if (!user) return null;
  const doc = await docWithPublicId(userId);
  const summary = memberSummary(doc);
  const homeId = doc.preferences.homeCourseId;
  const home = homeId ? await getCourse(homeId).catch(() => null) : null;
  const now = new Date().toISOString();
  const { profile, rounds } = projectCommunity({
    userId,
    account: user,
    settings: doc.community,
    summary,
    rounds: doc.rounds,
    home: home ? { id: home.id, name: home.name, region: home.region ?? null } : null,
    now,
  });
  const statRows = activeRounds(doc).map((r) => {
    const stats = statsOf(r);
    const warnings = r.holeStats?.length ? validateHoleStats(r.holeStats, holeNumbersFor(r.holes, r.rating.nine ?? null)).warnings.length : 0;
    return {
      userId,
      roundId: r.id,
      date: r.date,
      holes: r.holes,
      courseId: r.course.courseId ?? null,
      courseName: r.course.courseName,
      detailed: hasStatistics(stats),
      complete: Boolean(stats && stats.holesTracked === stats.holes),
      warnings: Math.min(warnings, 99),
      visibility: r.visibility ?? "PRIVATE",
      hidden: Boolean(r.moderation?.hidden),
      stats,
    };
  });
  const row = { ...profile, lastActivityAt: profile.lastActivityAt ? new Date(profile.lastActivityAt) : null, updatedAt: new Date(now) };
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(cp).values(row).onConflictDoUpdate({ target: cp.userId, set: row });
    await tx.delete(publicRounds).where(eq(publicRounds.userId, userId));
    for (let i = 0; i < rounds.length; i += 200) {
      await tx.insert(publicRounds).values(
        rounds.slice(i, i + 200).map((r) => ({ userId, roundId: r.roundId, level: r.level, date: r.date, courseId: r.courseId, courseName: r.courseName, holes: r.holes, record: r, createdAt: new Date(r.createdAt), updatedAt: new Date(now) })),
      );
    }
    await tx.delete(roundStatistics).where(eq(roundStatistics.userId, userId));
    for (let i = 0; i < statRows.length; i += 200) await tx.insert(roundStatistics).values(statRows.slice(i, i + 200));
  });
  return profile;
}

/** Abgleich, ohne die eigentliche Aktion scheitern zu lassen (Fehler landen im Serverprotokoll). */
export async function syncCommunitySafe(userId: string): Promise<void> {
  try {
    await syncCommunity(userId);
  } catch (error) {
    const { logServerError } = await import("./audit");
    await logServerError(`Community-Abgleich fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function profileOf(userId: string): Promise<ProfileRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(cp).where(eq(cp.userId, userId));
  if (row) return row;
  await syncCommunity(userId);
  const [again] = await db.select().from(cp).where(eq(cp.userId, userId));
  return again ?? null;
}

async function profileByPublicId(publicId: string): Promise<(ProfileRow & { status: string }) | null> {
  if (!publicId || publicId.length > 64) return null;
  const db = await getDb();
  const [row] = await db.select({ p: cp, status: users.status }).from(cp).innerJoin(users, eq(users.id, cp.userId)).where(eq(cp.publicId, publicId));
  return row ? { ...row.p, status: row.status } : null;
}

const refOf = (row: ProfileRow) => memberRef(row, avatarPath);

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function rankExpr(): SQL<number> {
  const fn = COMMUNITY_POLICY.ranking.ties === "DENSE" ? sql.raw("dense_rank()") : sql.raw("rank()");
  return sql<number>`cast(${fn} over (order by round(${cp.handicapIndex} * 10)) as integer)`;
}

function rankedWhere(scopeWhere?: SQL): SQL {
  return and(eq(cp.rankingVisible, true), isNotNull(cp.handicapIndex), eq(users.status, "ACTIVE"), scopeWhere)!;
}

/** Position für einen HCPI innerhalb der Teilnehmer (auch „wärst du im Ranking“). */
async function positionFor(handicapIndex: number, scopeWhere?: SQL): Promise<number> {
  const db = await getDb();
  const me = Math.round(handicapIndex * 10);
  const expr = COMMUNITY_POLICY.ranking.ties === "DENSE" ? sql<number>`count(distinct round(${cp.handicapIndex} * 10))` : sql<number>`count(*)`;
  const [row] = await db
    .select({ n: expr })
    .from(cp)
    .innerJoin(users, eq(users.id, cp.userId))
    .where(and(rankedWhere(scopeWhere), sql`round(${cp.handicapIndex} * 10) < ${me}`));
  return 1 + Number(row?.n ?? 0);
}

/** Tagesstand des Rankings speichern (einmal pro Tag beim ersten Aufruf bzw. auf Knopfdruck im Admin-Bereich). */
export async function ensureDailySnapshot(force = false): Promise<string> {
  const db = await getDb();
  const today = todayIso();
  if (!force) {
    const [exists] = await db.select({ n: count() }).from(rankingSnapshots).where(and(eq(rankingSnapshots.snapshotDate, today), eq(rankingSnapshots.scope, "ALL")));
    if (Number(exists?.n ?? 0) > 0) return today;
  } else {
    await db.delete(rankingSnapshots).where(and(eq(rankingSnapshots.snapshotDate, today), eq(rankingSnapshots.scope, "ALL")));
  }
  const fn = COMMUNITY_POLICY.ranking.ties === "DENSE" ? sql.raw("dense_rank()") : sql.raw("rank()");
  await db.execute(sql`
    insert into ranking_snapshots (snapshot_date, scope, user_id, position, handicap_index)
    select ${today}::date, 'ALL', cp.user_id, cast(${fn} over (order by round(cp.handicap_index * 10)) as integer), cp.handicap_index
    from community_profiles cp join users u on u.id = cp.user_id
    where cp.ranking_visible and cp.handicap_index is not null and u.status = 'ACTIVE'
    on conflict do nothing`);
  return today;
}

async function previousSnapshot(userIds: string[]): Promise<{ date: string | null; positions: Map<string, number> }> {
  const db = await getDb();
  const [row] = await db
    .select({ d: max(rankingSnapshots.snapshotDate) })
    .from(rankingSnapshots)
    .where(and(eq(rankingSnapshots.scope, "ALL"), lt(rankingSnapshots.snapshotDate, todayIso())));
  const date = row?.d ?? null;
  const positions = new Map<string, number>();
  if (date && userIds.length) {
    const rows = await db
      .select({ userId: rankingSnapshots.userId, position: rankingSnapshots.position })
      .from(rankingSnapshots)
      .where(and(eq(rankingSnapshots.snapshotDate, date), eq(rankingSnapshots.scope, "ALL"), inArray(rankingSnapshots.userId, userIds)));
    for (const r of rows) positions.set(r.userId, r.position);
  }
  return { date, positions };
}

function scopeFor(me: ProfileRow | null, requested: string | null | undefined): { scope: RankingScope; where?: SQL; label: string | null; scopes: { scope: RankingScope; label: string }[] } {
  const scopes: { scope: RankingScope; label: string }[] = [{ scope: "ALL", label: "Gesamt" }];
  if (me?.homeCourseId) scopes.push({ scope: "HOME", label: me.homeCourseName ?? "Mein Heimatclub" });
  const regionLabel = regionByKey(me?.region)?.label ?? null;
  if (me?.region) scopes.push({ scope: "REGION", label: regionLabel ?? me.region });
  if (requested === "HOME" && me?.homeCourseId) return { scope: "HOME", where: eq(cp.homeCourseId, me.homeCourseId), label: me.homeCourseName, scopes };
  if (requested === "REGION" && me?.region) return { scope: "REGION", where: eq(cp.region, me.region), label: regionLabel ?? me.region, scopes };
  return { scope: "ALL", label: null, scopes };
}

async function myRankingIn(viewer: UserRow, me: ProfileRow | null, scope: RankingScope, where: SQL | undefined, total: number, prev: Awaited<ReturnType<typeof previousSnapshot>>): Promise<MyRanking | null> {
  if (!me || me.handicapIndex === null) return null;
  const participating = me.rankingVisible && viewer.status === "ACTIVE";
  if (!participating && !COMMUNITY_POLICY.ranking.hiddenUserSeesOwnPosition) return { participating, position: null, handicapIndex: me.handicapIndex, trend: null, trendSince: null, total };
  const position = await positionFor(me.handicapIndex, where);
  const prevPos = scope === "ALL" && participating ? prev.positions.get(viewer.id) : undefined;
  return { participating, position, handicapIndex: me.handicapIndex, trend: prevPos !== undefined ? prevPos - position : null, trendSince: prevPos !== undefined ? prev.date : null, total };
}

export async function rankingPage(viewer: UserRow, params: { scope?: string | null; page?: number; pageSize?: number }): Promise<RankingResponse> {
  const flags = await communityFlags();
  requireFlag(flags, "rankingEnabled");
  await ensureDailySnapshot();
  const db = await getDb();
  const me = await profileOf(viewer.id);
  const { scope, where, label, scopes } = scopeFor(me, params.scope);
  const pageSize = Math.min(50, Math.max(5, params.pageSize ?? COMMUNITY_POLICY.ranking.pageSize));
  const page = Math.max(1, params.page ?? 1);
  const base = rankedWhere(where);
  const [{ n: total }] = await db.select({ n: count() }).from(cp).innerJoin(users, eq(users.id, cp.userId)).where(base);
  const position = rankExpr();
  const select = { p: cp, position };
  const query = (limit: number, offset: number) =>
    db.select(select).from(cp).innerJoin(users, eq(users.id, cp.userId)).where(base).orderBy(position, asc(cp.displayName), asc(cp.publicId)).limit(limit).offset(offset);
  const rows = await query(pageSize, (page - 1) * pageSize);
  const top = page === 1 ? rows.slice(0, 3) : await query(3, 0);
  const prev = await previousSnapshot([...rows, ...top].map((r) => r.p.userId).concat(viewer.id));
  const entry = (r: (typeof rows)[number]): RankingEntry => {
    const prevPos = scope === "ALL" ? prev.positions.get(r.p.userId) : undefined;
    return {
      ...refOf(r.p),
      position: r.position,
      handicapIndex: r.p.handicapIndex!,
      homeCourseName: r.p.homeCourseName,
      roundsCount: r.p.roundsCount,
      trend: prevPos !== undefined ? prevPos - r.position : null,
      isMe: r.p.userId === viewer.id,
    };
  };
  return {
    scope,
    scopeLabel: label,
    page,
    pageSize,
    total: Number(total),
    items: rows.map(entry),
    top: top.map(entry),
    me: await myRankingIn(viewer, me, scope, where, Number(total), prev),
    scopes,
    previousSnapshotDate: prev.date,
  };
}

/** Eigene Position (Startseite). null, wenn Community oder Ranking aus sind. */
export async function myRanking(viewer: UserRow): Promise<MyRanking | null> {
  const flags = await communityFlags();
  if (!flags.communityEnabled || !flags.rankingEnabled) return null;
  await ensureDailySnapshot();
  const me = await profileOf(viewer.id);
  const db = await getDb();
  const [{ n: total }] = await db.select({ n: count() }).from(cp).innerJoin(users, eq(users.id, cp.userId)).where(rankedWhere());
  const prev = await previousSnapshot([viewer.id]);
  return myRankingIn(viewer, me, "ALL", undefined, Number(total), prev);
}

export async function myRankingHistory(userId: string): Promise<{ date: string; position: number; handicapIndex: number }[]> {
  const db = await getDb();
  const rows = await db
    .select({ date: rankingSnapshots.snapshotDate, position: rankingSnapshots.position, handicapIndex: rankingSnapshots.handicapIndex })
    .from(rankingSnapshots)
    .where(and(eq(rankingSnapshots.userId, userId), eq(rankingSnapshots.scope, "ALL")))
    .orderBy(desc(rankingSnapshots.snapshotDate))
    .limit(400);
  return rows.reverse();
}

// ---------------------------------------------------------------------------
// Mitglieder, Profile, öffentliche Runden, Aktivität
// ---------------------------------------------------------------------------

const likeEscape = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function membersPage(viewer: UserRow, params: { q?: string | null; sort?: string | null; page?: number }): Promise<CommunityPage<MemberListItem>> {
  const flags = await communityFlags();
  requireFlag(flags);
  const db = await getDb();
  const pageSize = COMMUNITY_POLICY.membersPageSize;
  const page = Math.max(1, params.page ?? 1);
  const q = (params.q ?? "").trim().slice(0, 60);
  const where = and(eq(cp.profileVisible, true), eq(users.status, "ACTIVE"), q ? ilike(cp.displayName, `%${likeEscape(q)}%`) : undefined);
  const order =
    params.sort === "NAME"
      ? [asc(cp.displayName), asc(cp.publicId)]
      : params.sort === "ACTIVITY"
        ? [sql`${cp.lastActivityAt} desc nulls last`, asc(cp.displayName)]
        : [sql`${cp.handicapIndex} asc nulls last`, asc(cp.displayName)];
  const [{ n: total }] = await db.select({ n: count() }).from(cp).innerJoin(users, eq(users.id, cp.userId)).where(where);
  const rows = await db
    .select({ p: cp })
    .from(cp)
    .innerJoin(users, eq(users.id, cp.userId))
    .where(where)
    .orderBy(...order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: Number(total),
    page,
    pageSize,
    items: rows.map(({ p }) => ({
      ...refOf(p),
      handicapIndex: p.handicapIndex,
      homeCourseName: p.homeCourseName,
      roundsCount: p.roundsCount,
      lastActivityAt: p.lastActivityAt?.toISOString() ?? null,
      isMe: p.userId === viewer.id,
    })),
  };
}

async function visibleProfile(viewer: UserRow, publicId: string) {
  const row = await profileByPublicId(publicId);
  const isMe = row?.userId === viewer.id;
  if (!row || row.status !== "ACTIVE" || (!row.profileVisible && !isMe)) throw apiError("MEMBER_NOT_FOUND");
  return { row, isMe };
}

export async function memberProfile(viewer: UserRow, publicId: string): Promise<PublicProfileView> {
  const flags = await communityFlags();
  requireFlag(flags);
  const { row, isMe } = await visibleProfile(viewer, publicId);
  return {
    ...refOf(row),
    handicapIndex: row.handicapIndex,
    homeCourseName: row.homeCourseName,
    roundsCount: row.roundsCount,
    publicRoundsCount: flags.publicRoundsEnabled ? row.publicRoundsCount : 0,
    rankingPosition: row.rankingVisible && flags.rankingEnabled && row.handicapIndex !== null ? await positionFor(row.handicapIndex) : null,
    performance: row.statsVisible && flags.statsSharingEnabled ? ((row.performance ?? null) as PublicProfileView["performance"]) : null,
    isMe,
  };
}

export async function memberRounds(viewer: UserRow, publicId: string, page = 1): Promise<CommunityPage<PublicRoundSummary>> {
  const flags = await communityFlags();
  requireFlag(flags);
  const { row } = await visibleProfile(viewer, publicId);
  const pageSize = COMMUNITY_POLICY.feedPageSize;
  if (!flags.publicRoundsEnabled) return { items: [], total: 0, page: 1, pageSize };
  const db = await getDb();
  const [{ n: total }] = await db.select({ n: count() }).from(publicRounds).where(eq(publicRounds.userId, row.userId));
  const rows = await db
    .select({ record: publicRounds.record })
    .from(publicRounds)
    .where(eq(publicRounds.userId, row.userId))
    .orderBy(desc(publicRounds.date), desc(publicRounds.createdAt))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize);
  const ref = refOf(row);
  return { total: Number(total), page, pageSize, items: rows.map((r) => roundSummaryFor(r.record as PublicRoundRecord, ref, flags)).filter((x): x is PublicRoundSummary => x !== null) };
}

export async function activityPage(viewer: UserRow, page = 1): Promise<CommunityPage<ActivityItem>> {
  const flags = await communityFlags();
  requireFlag(flags, "activityFeedEnabled", "publicRoundsEnabled");
  const db = await getDb();
  const pageSize = COMMUNITY_POLICY.feedPageSize;
  const where = and(eq(cp.profileVisible, true), eq(users.status, "ACTIVE"));
  const [{ n: total }] = await db.select({ n: count() }).from(publicRounds).innerJoin(cp, eq(cp.userId, publicRounds.userId)).innerJoin(users, eq(users.id, publicRounds.userId)).where(where);
  const rows = await db
    .select({ record: publicRounds.record, p: cp })
    .from(publicRounds)
    .innerJoin(cp, eq(cp.userId, publicRounds.userId))
    .innerJoin(users, eq(users.id, publicRounds.userId))
    .where(where)
    .orderBy(desc(publicRounds.createdAt))
    .limit(pageSize)
    .offset((Math.max(1, page) - 1) * pageSize);
  const items: ActivityItem[] = [];
  for (const r of rows) {
    const round = roundSummaryFor(r.record as PublicRoundRecord, refOf(r.p), flags);
    if (round) items.push({ type: "ROUND", round });
  }
  void viewer;
  return { total: Number(total), page, pageSize, items };
}

export async function publicRound(viewer: UserRow, publicId: string, roundId: string): Promise<PublicRoundView> {
  const flags = await communityFlags();
  requireFlag(flags, "publicRoundsEnabled");
  const { row, isMe } = await visibleProfile(viewer, publicId);
  const db = await getDb();
  const [r] = await db.select({ record: publicRounds.record }).from(publicRounds).where(and(eq(publicRounds.userId, row.userId), eq(publicRounds.roundId, roundId.slice(0, 64))));
  const view = r ? roundViewFor(r.record as PublicRoundRecord, refOf(row), flags, isMe) : null;
  if (!view) throw apiError("ROUND_NOT_FOUND");
  return view;
}

// ---------------------------------------------------------------------------
// Eigene Einstellungen und Profilbild
// ---------------------------------------------------------------------------

export async function myCommunity(user: UserRow): Promise<MyCommunity> {
  const doc = await docWithPublicId(user.id);
  const s = doc.community;
  return {
    settings: s,
    effectiveDisplayName: effectiveDisplayName(s, user),
    avatarUrl: s.avatarVersion && s.publicId ? avatarPath(s.publicId, s.avatarVersion) : null,
    flags: await communityFlags(),
  };
}

const IMAGE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function checkImage(dataUrl: unknown): { mime: string; data: string } {
  const m = typeof dataUrl === "string" ? IMAGE.exec(dataUrl) : null;
  if (!m) throw apiError("VALIDATION", "Bitte ein Bild (JPEG, PNG oder WebP) auswählen.", { avatar: "Bitte ein Bild auswählen." });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > COMMUNITY_POLICY.avatarMaxBytes) throw apiError("VALIDATION", "Das Bild ist zu groß (höchstens 150 KB).", { avatar: "Höchstens 150 KB." });
  const magic = bytes.subarray(0, 12);
  const ok =
    (m[1] === "image/jpeg" && magic[0] === 0xff && magic[1] === 0xd8) ||
    (m[1] === "image/png" && magic.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
    (m[1] === "image/webp" && magic.subarray(0, 4).toString() === "RIFF" && magic.subarray(8, 12).toString() === "WEBP");
  if (!ok) throw apiError("VALIDATION", "Die Datei ist kein gültiges Bild.", { avatar: "Kein gültiges Bild." });
  return { mime: m[1], data: m[2] };
}

export async function saveAvatar(user: UserRow, dataUrl: unknown): Promise<void> {
  const img = checkImage(dataUrl);
  const db = await getDb();
  const [cur] = await db.select({ version: userAvatars.version }).from(userAvatars).where(eq(userAvatars.userId, user.id));
  const version = (cur?.version ?? 0) + 1;
  await db
    .insert(userAvatars)
    .values({ userId: user.id, mime: img.mime, data: img.data, version })
    .onConflictDoUpdate({ target: userAvatars.userId, set: { mime: img.mime, data: img.data, version, updatedAt: new Date() } });
  await withMemberDoc(user.id, (d) => ({ doc: { ...d, community: { ...d.community, avatarVersion: version } }, result: null }));
  await syncCommunity(user.id);
}

export async function deleteAvatar(user: UserRow): Promise<void> {
  const db = await getDb();
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  await withMemberDoc(user.id, (d) => ({ doc: { ...d, community: { ...d.community, avatarVersion: null } }, result: null }));
  await syncCommunity(user.id);
}

/** Profilbild nur für angemeldete Mitglieder und nur, wenn das Mitglied im Ranking oder mit Profil sichtbar ist. */
export async function avatarFor(viewer: UserRow, publicId: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const row = await profileByPublicId(publicId);
  if (!row) return null;
  const isMe = row.userId === viewer.id;
  if (!isMe && (row.status !== "ACTIVE" || (!row.profileVisible && !row.rankingVisible))) return null;
  const db = await getDb();
  const [a] = await db.select().from(userAvatars).where(eq(userAvatars.userId, row.userId));
  return a ? { mime: a.mime, bytes: Buffer.from(a.data, "base64") } : null;
}
