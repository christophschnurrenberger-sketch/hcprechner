/**
 * Mitgliederbereich (Node-Edition): ausschließlich Daten des angemeldeten Benutzers – die Benutzer-ID
 * stammt immer aus der Sitzung, nie aus der Anfrage. Berechnung serverseitig über src/lib/member.
 *
 * GET    /api/me                      Profil + Vorlieben
 * GET    /api/me/dashboard            Dashboard
 * GET    /api/me/hcp                  Handicap Index mit Rechenweg und Verlauf
 * GET    /api/me/rounds?holes=9|18    Runden
 * POST   /api/me/rounds               { input, draftId? } → Ergebnis
 * POST   /api/me/rounds/preview       { input, roundId? } → Vorschau (nicht gespeichert)
 * GET    /api/me/rounds/:id           Rundendetail
 * PUT    /api/me/rounds/:id           { input } → Ergebnis (Verlauf wird neu berechnet)
 * DELETE /api/me/rounds/:id           Soft Delete
 * PUT    /api/me/profile              { gender, startHandicapIndex }
 * POST   /api/me/onboarding           { startHandicapIndex?, homeCourseId?, gender? }
 * GET    /api/me/courses              Favoriten, Heimatplatz, zuletzt gespielt
 * PUT    /api/me/favorites/:courseId  { favorite }
 * PUT    /api/me/home-course          { courseId }
 * GET    /api/me/drafts | PUT/DELETE /api/me/drafts/:id
 * POST   /api/me/import/preview | /api/me/import   { csv }
 * PUT    /api/me/rounds/:id/stats     { holeStats } → Lochstatistik ergänzen (Handicap bleibt unverändert)
 * PATCH  /api/me/rounds/:id/visibility { visibility: PRIVATE|MEMBERS_BASIC|MEMBERS_FULL }
 * GET    /api/me/statistics?last&holes&courseId&teeColor&period   Golfstatistik (Spielleistung)
 * GET    /api/me/statistics/history   Verlauf je Runde (gleiche Filter)
 * GET    /api/me/community | PATCH    Community- und Privatsphäre-Einstellungen
 * PUT    /api/me/avatar { dataUrl } | DELETE   Profilbild
 * GET    /api/me/ranking              eigene Position und Verlauf
 * GET    /api/me/tools/statistics     WHS-Auswertung (Score Differentials)
 * POST   /api/me/tools/simulate | target | gbe
 *
 * Nach jeder Änderung werden HCPI, Statistik und freigegebene Community-Daten serverseitig neu berechnet.
 */
import { apiError } from "@/lib/api/errors";
import type { MemberProfileData } from "@/lib/api/types";
import type { MemberDoc } from "@/lib/member/doc";
import { computeHcp, dashboardData, listRounds, roundDetail } from "@/lib/member/hcp";
import {
  completeOnboarding,
  createRound,
  deleteDraft,
  deleteRound,
  gbeTool,
  importRounds,
  memberCourseLists,
  previewRoundInput,
  previewRoundsImport,
  saveDraft,
  setFavorite,
  setHomeCourse,
  setStartHandicap,
  simulateDifferential,
  statistics,
  targetAnalysis,
  updateRound,
} from "@/lib/member/service";
import { summarizeCourses } from "@/lib/courses/summary";
import { performanceOf, saveRoundStats, setRoundVisibility, updateCommunitySettings } from "@/lib/member/community";
import type { CommunitySettingsInput } from "@/lib/community/types";
import type { PerformanceFilter, PerformancePeriod } from "@/lib/stats/types";
import type { Round } from "@/lib/whs/types";
import type { UserRow } from "@/db/schema";
import { audit } from "@/server/audit";
import { getCourse, loadAllCourses } from "@/server/courseRepository";
import { handle, json, readJson, searchParams, str } from "@/server/http";
import { loadMemberDoc, memberContext, prefetchedContext, withMemberDoc } from "@/server/members";
import { requireUser, sessionView } from "@/server/session";
import { deleteAvatar, myCommunity, myRanking, myRankingHistory, saveAvatar, syncCommunitySafe } from "@/server/community";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

function roundSummary(round: Round | undefined) {
  if (!round) return null;
  return {
    date: round.date,
    courseName: round.course.courseName,
    holes: round.holes,
    scoreDifferential: round.computed?.scoreDifferential ?? null,
    handicapIndexAfter: round.computed?.handicapIndexAfter ?? null,
  };
}

async function profileData(user: UserRow, doc?: MemberDoc): Promise<MemberProfileData> {
  const d = doc ?? (await loadMemberDoc(user.id)).doc;
  return { user: await sessionView(user), profile: d.profile, preferences: { favorites: d.preferences.favorites, homeCourseId: d.preferences.homeCourseId } };
}

function performanceFilter(req: Request): PerformanceFilter {
  const q = searchParams(req);
  const last = Number(q.get("last"));
  const holes = q.get("holes");
  return {
    last: Number.isInteger(last) && last > 0 ? last : null,
    holes: holes === "9" ? 9 : holes === "18" ? 18 : null,
    courseId: q.get("courseId")?.slice(0, 64) || null,
    teeColor: q.get("teeColor")?.slice(0, 40) || null,
    period: (q.get("period") as PerformancePeriod | null) ?? "ALL",
  };
}

function num(v: unknown, field: string): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n)) throw apiError("VALIDATION", "Bitte eine Zahl eingeben.", { [field]: "Bitte eine Zahl eingeben." });
  return n;
}

async function dispatch(req: Request, path: string[]): Promise<Response> {
  const user = await requireUser(req);
  const [head, id, extra, more] = path;
  const method = req.method;

  if (more !== undefined) throw apiError("NOT_FOUND");

  // ------------------------------------------------------------------ Golfstatistik und Sichtbarkeit einer Runde
  if (head === "rounds" && id && extra === "stats" && method === "PUT") {
    const body = await readJson(req, 64 * 1024);
    // Platzdaten vorher laden (keine Datenbankabfrage innerhalb der Dokument-Sperre)
    const courseId = (await loadMemberDoc(user.id)).doc.rounds.find((x) => x.id === id)?.course.courseId ?? null;
    const course = courseId ? await getCourse(courseId) : null;
    const { result } = await withMemberDoc(user.id, async (doc) => {
      const r = await saveRoundStats(doc, id, body.holeStats, (cid) => (course && cid === course.id ? course : null));
      return { doc: r.doc, result: { stats: r.stats, warnings: r.warnings } };
    });
    await audit("ROUND_STATS_UPDATED", user, { userId: user.id, entityType: "round", entityId: id, newValue: { holes: result.stats?.holesScored ?? 0 } });
    await syncCommunitySafe(user.id);
    return json(result);
  }
  if (head === "rounds" && id && extra === "visibility" && method === "PATCH") {
    const body = await readJson(req, 2000);
    const { result } = await withMemberDoc(user.id, (doc) => {
      const old = doc.rounds.find((r) => r.id === id)?.visibility ?? "PRIVATE";
      return { doc: setRoundVisibility(doc, id, body.visibility), result: old };
    });
    await audit("ROUND_VISIBILITY_CHANGED", user, { userId: user.id, entityType: "round", entityId: id, oldValue: { visibility: result }, newValue: { visibility: body.visibility } });
    await syncCommunitySafe(user.id);
    return json({ ok: true, visibility: body.visibility });
  }
  if (extra !== undefined && !(head === "statistics" && id === "history")) throw apiError("NOT_FOUND");

  if (!head) {
    if (method === "GET") return json(await profileData(user));
  }

  if (head === "dashboard" && method === "GET") {
    const { doc } = await loadMemberDoc(user.id);
    return json({ ...dashboardData(doc, user.firstName), ranking: await myRanking(user).catch(() => null) });
  }

  if (head === "hcp" && method === "GET") {
    const { doc } = await loadMemberDoc(user.id);
    return json(computeHcp(doc));
  }

  if (head === "rounds") {
    if (!id && method === "GET") {
      const holes = searchParams(req).get("holes");
      const { doc } = await loadMemberDoc(user.id);
      return json(listRounds(doc, { holes: holes === "9" ? 9 : holes === "18" ? 18 : null }));
    }
    if (!id && method === "POST") {
      const body = await readJson(req);
      const draftId = typeof body.draftId === "string" ? body.draftId : null;
      const ctx = await prefetchedContext(body.input);
      const { result } = await withMemberDoc(user.id, async (doc) => {
        const r = await createRound(doc, body.input, ctx, draftId);
        return { doc: r.doc, result: { save: r.result, round: r.doc.rounds.find((x) => x.id === r.result.roundId) } };
      });
      await audit("ROUND_CREATED", user, { userId: user.id, entityType: "round", entityId: result.save.roundId, newValue: roundSummary(result.round) });
      await syncCommunitySafe(user.id);
      return json(result.save, 201);
    }
    if (id === "preview" && method === "POST") {
      const body = await readJson(req);
      const { doc } = await loadMemberDoc(user.id);
      return json(await previewRoundInput(doc, body.input, memberContext, typeof body.roundId === "string" ? body.roundId : undefined));
    }
    if (id && method === "GET") {
      const { doc } = await loadMemberDoc(user.id);
      return json(roundDetail(doc, id));
    }
    if (id && method === "PUT") {
      const body = await readJson(req);
      const ctx = await prefetchedContext(body.input);
      const { result } = await withMemberDoc(user.id, async (doc) => {
        const old = doc.rounds.find((r) => r.id === id);
        const r = await updateRound(doc, id, body.input, ctx);
        return { doc: r.doc, result: { save: r.result, old, round: r.doc.rounds.find((x) => x.id === id) } };
      });
      await audit("ROUND_MODIFIED", user, { userId: user.id, entityType: "round", entityId: id, oldValue: roundSummary(result.old), newValue: roundSummary(result.round) });
      await syncCommunitySafe(user.id);
      return json(result.save);
    }
    if (id && method === "DELETE") {
      const { result: old } = await withMemberDoc(user.id, (doc) => {
        const before = doc.rounds.find((r) => r.id === id);
        return { doc: deleteRound(doc, id), result: before };
      });
      await audit("ROUND_DELETED", user, { userId: user.id, entityType: "round", entityId: id, oldValue: roundSummary(old) });
      await syncCommunitySafe(user.id);
      return json({ ok: true });
    }
  }

  if (head === "profile" && !id && method === "PUT") {
    const body = await readJson(req, 4000);
    const gender = body.gender === "F" ? "F" : body.gender === "M" ? "M" : undefined;
    const value = num(body.startHandicapIndex, "startHandicapIndex");
    const { result } = await withMemberDoc(user.id, (doc) => {
      const next = setStartHandicap(doc, value, gender);
      return { doc: next, result: { old: { gender: doc.profile.gender, startHandicapIndex: doc.profile.startHandicapIndex }, doc: next } };
    });
    await audit("USER_PROFILE_UPDATED", user, { userId: user.id, entityType: "profile", entityId: user.id, oldValue: result.old, newValue: { gender: result.doc.profile.gender, startHandicapIndex: result.doc.profile.startHandicapIndex } });
    await syncCommunitySafe(user.id);
    return json(await profileData(user, result.doc));
  }

  if (head === "onboarding" && !id && method === "POST") {
    const body = await readJson(req, 4000);
    const start = body.startHandicapIndex === null || body.startHandicapIndex === undefined || body.startHandicapIndex === "" ? null : num(body.startHandicapIndex, "startHandicapIndex");
    const homeCourseId = typeof body.homeCourseId === "string" && body.homeCourseId ? body.homeCourseId : null;
    const gender = body.gender === "F" ? "F" : body.gender === "M" ? "M" : undefined;
    const { result } = await withMemberDoc(user.id, (doc) => {
      const next = completeOnboarding(doc, { startHandicapIndex: start, homeCourseId, gender });
      return { doc: next, result: next };
    });
    await syncCommunitySafe(user.id);
    return json(await profileData(user, result));
  }

  if (head === "courses" && !id && method === "GET") {
    const [{ doc }, courses] = await Promise.all([loadMemberDoc(user.id), loadAllCourses()]);
    return json(memberCourseLists(doc, (ids) => summarizeCourses(courses, ids)));
  }

  if (head === "favorites" && id && method === "PUT") {
    const body = await readJson(req, 1000);
    const { result } = await withMemberDoc(user.id, (doc) => {
      const next = setFavorite(doc, id.slice(0, 64), body.favorite !== false);
      return { doc: next, result: next.preferences };
    });
    return json({ favorites: result.favorites, homeCourseId: result.homeCourseId });
  }

  if (head === "home-course" && !id && method === "PUT") {
    const body = await readJson(req, 1000);
    const courseId = typeof body.courseId === "string" && body.courseId ? body.courseId.slice(0, 64) : null;
    const { result } = await withMemberDoc(user.id, (doc) => {
      const next = setHomeCourse(doc, courseId);
      return { doc: next, result: next.preferences };
    });
    await syncCommunitySafe(user.id);
    return json({ favorites: result.favorites, homeCourseId: result.homeCourseId });
  }

  if (head === "drafts") {
    if (!id && method === "GET") return json((await loadMemberDoc(user.id)).doc.drafts);
    if (id && method === "PUT") {
      const body = await readJson(req, 64 * 1024);
      if (!body.input || typeof body.input !== "object") throw apiError("VALIDATION", "Ungültiger Entwurf");
      const draftId = id.slice(0, 64);
      const { result } = await withMemberDoc(user.id, (doc) => {
        const next = saveDraft(doc, { id: draftId, label: str(body, "label", 120), input: body.input as never });
        return { doc: next, result: next.drafts.find((d) => d.id === draftId)! };
      });
      return json(result);
    }
    if (id && method === "DELETE") {
      await withMemberDoc(user.id, (doc) => ({ doc: deleteDraft(doc, id), result: null }));
      return json({ ok: true });
    }
  }

  if (head === "import") {
    const body = await readJson(req, 2 * 1024 * 1024);
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) throw apiError("VALIDATION", "Bitte eine CSV-Datei auswählen.", { csv: "Bitte eine CSV-Datei auswählen." });
    if (id === "preview" && method === "POST") {
      const { doc } = await loadMemberDoc(user.id);
      return json(previewRoundsImport(doc, csv, memberContext.newId));
    }
    if (!id && method === "POST") {
      const { result } = await withMemberDoc(user.id, (doc) => {
        const r = importRounds(doc, csv, memberContext.newId);
        return { doc: r.imported > 0 ? r.doc : null, result: { imported: r.imported, skipped: r.skipped } };
      });
      if (result.imported > 0) await audit("ROUNDS_IMPORTED", user, { userId: user.id, entityType: "round", newValue: { count: result.imported } });
      if (result.imported > 0) await syncCommunitySafe(user.id);
      return json(result);
    }
  }

  if (head === "statistics" && method === "GET") {
    const { doc } = await loadMemberDoc(user.id);
    const report = performanceOf(doc, performanceFilter(req));
    if (!id) return json(report);
    if (id === "history" && extra === undefined) return json(report.history);
  }

  if (head === "community" && !id) {
    if (method === "GET") return json(await myCommunity(user));
    if (method === "PATCH") {
      const body = (await readJson(req, 4000)) as CommunitySettingsInput;
      const { result } = await withMemberDoc(user.id, (doc) => {
        const next = updateCommunitySettings(doc, body);
        const pick = (s: typeof doc.community) => ({ displayName: s.displayName, rankingVisible: s.rankingVisible, profileVisible: s.profileVisible, roundsVisible: s.roundsVisible, statsVisible: s.statsVisible, notesVisible: s.notesVisible });
        return { doc: next, result: { old: pick(doc.community), neu: pick(next.community) } };
      });
      await audit("COMMUNITY_SETTINGS_CHANGED", user, { userId: user.id, entityType: "community", entityId: user.id, oldValue: result.old, newValue: result.neu });
      await syncCommunitySafe(user.id);
      return json(await myCommunity(user));
    }
  }

  if (head === "avatar" && !id) {
    if (method === "PUT") {
      await saveAvatar(user, (await readJson(req, 256 * 1024)).dataUrl);
      return json(await myCommunity(user));
    }
    if (method === "DELETE") {
      await deleteAvatar(user);
      return json(await myCommunity(user));
    }
  }

  if (head === "ranking" && !id && method === "GET") {
    return json({ ranking: await myRanking(user), history: await myRankingHistory(user.id) });
  }

  if (head === "tools" && id === "statistics" && method === "GET") {
    const { doc } = await loadMemberDoc(user.id);
    return json(statistics(doc));
  }

  if (head === "tools" && method === "POST") {
    const body = await readJson(req, 64 * 1024);
    const { doc } = await loadMemberDoc(user.id);
    if (id === "simulate") return json(simulateDifferential(doc, num(body.scoreDifferential, "scoreDifferential"), typeof body.date === "string" ? body.date : undefined));
    if (id === "target") return json(targetAnalysis(doc, num(body.target, "target")));
    if (id === "gbe") return json(gbeTool(body));
  }

  throw apiError("NOT_FOUND");
}

async function route(req: Request, ctx: Ctx) {
  return handle(async () => dispatch(req, (await ctx.params).path ?? []));
}

export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
