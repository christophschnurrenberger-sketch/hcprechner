/**
 * API-Adapter der Webspace-Edition.
 *
 * PHP (api/auth.php, api/me.php, api/admin.php) übernimmt Anmeldung, Rollenprüfung, Datentrennung,
 * Speicherung und Audit-Log. Da PHP kein TypeScript ausführen kann, berechnet dieser Adapter die
 * WHS-Ergebnisse mit derselben Service-Schicht wie der Node-Server (src/lib/member) und übergibt PHP nur
 * die fertige, strukturgeprüfte Änderung. Ratings von Plätzen aus der Datenbank werden dabei aus dem
 * veröffentlichten Golfplatz-Datensatz aufgelöst – nicht aus Eingaben.
 */
import { phpApi } from "@/lib/runtime";
import { findCourse, type CourseDataset } from "@/lib/courses/dataset";
import { getCourseDataset } from "@/lib/courses/client";
import { runCourseSearch, summarizeCourses } from "@/lib/courses/summary";
import { adminRoundDetail, adminUserDetail } from "@/lib/member/admin";
import { memberSummary, performanceOf, saveRoundStats, setRoundVisibility } from "@/lib/member/community";
import { roundInsights } from "@/lib/stats/insights";
import { ratesFromSums, type StatSums } from "@/lib/stats/aggregate";
import type { AdminCommunityOverview, MyCommunity, PublicRoundView } from "@/lib/community/types";
import { normalizeMemberDoc, type MemberDoc } from "@/lib/member/doc";
import { APP_VERSION, BUILD_INFO } from "@/lib/member/engine";
import { computeHcp, dashboardData, listRounds, roundDetail } from "@/lib/member/hcp";
import { rulesInfo } from "@/lib/member/rules";
import {
  completeOnboarding,
  createRound,
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
  type MemberContext,
} from "@/lib/member/service";
import { defaultRuleSet } from "@/rules/whs/registry";
import type { AdminApi, AuthApi, CommunityApi, HcpApi, MeResponse, MemberApi } from "./client";
import { ApiError } from "./errors";
import { request, setCsrf, type RequestOptions } from "./transport";
import type { AdminSettings, AdminUserDetail, AdminUserRow, DashboardData, DraftRound, MemberProfileData, SessionUser } from "./types";

type DashboardRanking = NonNullable<DashboardData["ranking"]>;

function php<T>(script: "auth" | "me" | "admin" | "community", action: string, options: RequestOptions = {}, query: Record<string, string | number | null | undefined> = {}): Promise<T> {
  const params: Record<string, string> = { action };
  for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== "") params[k] = String(v);
  return request<T>(phpApi(script, params), options);
}

/** Zusammenfassung (HCPI, Rundenzahl, Statistik) – gleiche Service-Schicht wie der Node-Server; PHP prüft. */
const summaryOf = (doc: MemberDoc) => memberSummary(doc);

// ---------------------------------------------------------------------------
// Sitzung
// ---------------------------------------------------------------------------

let sessionUser: SessionUser | null = null;

function setSession(user: SessionUser | null, csrf: string | null) {
  if (sessionUser?.id !== user?.id) cache = null;
  sessionUser = user;
  setCsrf(csrf);
}

const auth: AuthApi = {
  async me() {
    const res = await php<MeResponse>("auth", "me", { quietAuth: true });
    setSession(res.user, res.csrf);
    return res;
  },
  async login(email, password) {
    const res = await php<{ user: SessionUser; csrf: string }>("auth", "login", { body: { email, password }, quietAuth: true });
    setSession(res.user, res.csrf);
    return res;
  },
  async logout() {
    await php("auth", "logout", { body: {}, quietAuth: true });
    setSession(null, null);
  },
  async register(input) {
    const res = await php<Awaited<ReturnType<AuthApi["register"]>>>("auth", "register", { body: input, quietAuth: true });
    if (!res.verificationRequired) setSession(res.user, res.csrf);
    return res;
  },
  verifyEmail: (token) => php("auth", "verify-email", { body: { token }, quietAuth: true }),
  resendVerification: async (email) => {
    await php("auth", "resend-verification", { body: { email }, quietAuth: true });
  },
  forgotPassword: async (email) => {
    await php("auth", "forgot-password", { body: { email }, quietAuth: true });
  },
  resetPassword: async (token, password, passwordRepeat) => {
    await php("auth", "reset-password", { body: { token, password, passwordRepeat }, quietAuth: true });
  },
  async changePassword(input) {
    const res = await php<{ user: SessionUser; csrf: string }>("auth", "change-password", { body: input });
    setSession(res.user, res.csrf);
    return res;
  },
  async updateProfile(input) {
    const res = await php<{ user: SessionUser; pendingEmail: string | null }>("auth", "update-profile", { body: input });
    sessionUser = res.user;
    return res;
  },
  exportData: () => php("auth", "export", { body: {} }),
  async deleteAccount(password, confirm) {
    await php("auth", "delete-account", { body: { password, confirm } });
    setSession(null, null);
  },
};

async function currentUser(): Promise<SessionUser> {
  if (sessionUser) return sessionUser;
  const res = await auth.me();
  if (!res.user) throw new ApiError("UNAUTHENTICATED", undefined, 401);
  return res.user;
}

// ---------------------------------------------------------------------------
// Mitglieder-Dokument (Zwischenspeicher je Sitzung; PHP ist maßgeblich)
// ---------------------------------------------------------------------------

let cache: { doc: MemberDoc; revision: number; userId: string } | null = null;

async function loadDoc(force = false): Promise<{ doc: MemberDoc; revision: number }> {
  const user = await currentUser();
  if (!force && cache && cache.userId === user.id) return cache;
  const res = await php<{ doc: unknown; revision: number }>("me", "load");
  cache = { doc: normalizeMemberDoc(res.doc, user.id), revision: res.revision, userId: user.id };
  return cache;
}

function store(doc: MemberDoc, revision: number) {
  if (cache) cache = { ...cache, doc, revision };
}

/** Bei zwischenzeitlicher Änderung auf einem anderen Gerät: neu laden, neu berechnen, einmal wiederholen. */
async function withRetry<T>(fn: (current: { doc: MemberDoc; revision: number }) => Promise<T>): Promise<T> {
  try {
    return await fn(await loadDoc());
  } catch (error) {
    if (error instanceof ApiError && error.code === "CONFLICT") return fn(await loadDoc(true));
    throw error;
  }
}

let datasetCache: Promise<CourseDataset> | null = null;

function dataset(): Promise<CourseDataset> {
  datasetCache ??= getCourseDataset().catch((error) => {
    datasetCache = null;
    throw error;
  });
  return datasetCache;
}

const newId = () => crypto.randomUUID();

const ctx = (): MemberContext => ({
  courseLookup: async (courseId) => findCourse(await dataset(), courseId),
  newId,
});

async function profileData(doc: MemberDoc): Promise<MemberProfileData> {
  const me = await auth.me();
  if (!me.user) throw new ApiError("UNAUTHENTICATED", undefined, 401);
  return { user: me.user, profile: doc.profile, preferences: { favorites: doc.preferences.favorites, homeCourseId: doc.preferences.homeCourseId } };
}

async function savePrefs(doc: MemberDoc, withSummary = false): Promise<number> {
  const res = await php<{ revision: number }>("me", "prefs-save", { body: { preferences: doc.preferences, ...(withSummary ? { summary: summaryOf(doc) } : {}) } });
  return res.revision;
}

const member: MemberApi = {
  profile: async () => profileData((await loadDoc(true)).doc),
  async dashboard() {
    const user = await currentUser();
    const [data, ranking] = await Promise.all([loadDoc(true).then(({ doc }) => dashboardData(doc, user.firstName)), php<{ ranking: DashboardRanking }>("community", "my-ranking").catch(() => null)]);
    return { ...data, ranking: ranking?.ranking ?? null };
  },
  hcp: async () => computeHcp((await loadDoc()).doc),
  rounds: async (filter = {}) => listRounds((await loadDoc()).doc, filter),
  round: async (id) => roundDetail((await loadDoc()).doc, id),
  previewRound: async (input, roundId) => previewRoundInput((await loadDoc()).doc, input, ctx(), roundId),
  createRound: (input, draftId) =>
    withRetry(async ({ doc, revision }) => {
      const r = await createRound(doc, input, ctx(), draftId);
      const round = r.doc.rounds.find((x) => x.id === r.result.roundId);
      const res = await php<{ revision: number }>("me", "round-save", { body: { round, draftId: draftId ?? null, baseRevision: revision, summary: summaryOf(r.doc) } });
      store(r.doc, res.revision);
      return r.result;
    }),
  updateRound: (id, input) =>
    withRetry(async ({ doc, revision }) => {
      const r = await updateRound(doc, id, input, ctx());
      const round = r.doc.rounds.find((x) => x.id === id);
      const res = await php<{ revision: number }>("me", "round-save", { body: { round, baseRevision: revision, summary: summaryOf(r.doc) } });
      store(r.doc, res.revision);
      return r.result;
    }),
  deleteRound: (id) =>
    withRetry(async ({ doc, revision }) => {
      const next = deleteRound(doc, id);
      const res = await php<{ revision: number }>("me", "round-delete", { body: { id, baseRevision: revision, summary: summaryOf(next) } });
      store(next, res.revision);
    }),
  saveProfile: (input) =>
    withRetry(async ({ doc, revision }) => {
      const next = setStartHandicap(doc, input.startHandicapIndex, input.gender);
      const res = await php<{ revision: number }>("me", "profile-save", { body: { profile: next.profile, baseRevision: revision, summary: summaryOf(next) } });
      store(next, res.revision);
      return profileData(next);
    }),
  completeOnboarding: (input) =>
    withRetry(async ({ doc, revision }) => {
      const next = completeOnboarding(doc, input);
      let rev = revision;
      if (next.profile !== doc.profile) rev = (await php<{ revision: number }>("me", "profile-save", { body: { profile: next.profile, baseRevision: revision, summary: summaryOf(next) } })).revision;
      rev = await savePrefs(next, true);
      store(next, rev);
      return profileData(next);
    }),
  async courseLists() {
    const [{ doc }, ds] = await Promise.all([loadDoc(), dataset()]);
    return memberCourseLists(doc, (ids) => summarizeCourses(ds.courses, ids));
  },
  async setFavorite(courseId, favorite) {
    const { doc } = await loadDoc();
    const next = setFavorite(doc, courseId, favorite);
    store(next, await savePrefs(next));
    return { favorites: next.preferences.favorites, homeCourseId: next.preferences.homeCourseId };
  },
  async setHomeCourse(courseId) {
    const { doc } = await loadDoc();
    const next = setHomeCourse(doc, courseId);
    store(next, await savePrefs(next, true));
    return { favorites: next.preferences.favorites, homeCourseId: next.preferences.homeCourseId };
  },
  drafts: async () => (await loadDoc()).doc.drafts,
  async saveDraft(draft) {
    const { doc } = await loadDoc();
    const res = await php<{ draft: DraftRound; revision: number }>("me", "draft-save", { body: { draft } });
    store(saveDraft(doc, res.draft), res.revision);
    return res.draft;
  },
  async deleteDraft(id) {
    const { doc } = await loadDoc();
    const res = await php<{ revision: number }>("me", "draft-delete", { body: { id } });
    store({ ...doc, drafts: doc.drafts.filter((d) => d.id !== id) }, res.revision);
  },
  importPreview: async (csv) => previewRoundsImport((await loadDoc()).doc, csv, newId),
  importRounds: (csv) =>
    withRetry(async ({ doc, revision }) => {
      const r = importRounds(doc, csv, newId);
      if (r.imported === 0) return { imported: 0, skipped: r.skipped };
      const known = new Set(doc.rounds.map((x) => x.id));
      const rounds = r.doc.rounds.filter((x) => !known.has(x.id));
      const res = await php<{ revision: number; imported: number }>("me", "rounds-import", { body: { rounds, baseRevision: revision, summary: summaryOf(r.doc) } });
      store(r.doc, res.revision);
      return { imported: res.imported, skipped: r.skipped };
    }),
  statistics: async () => statistics((await loadDoc()).doc),
  performance: async (filter = {}) => performanceOf((await loadDoc()).doc, filter),
  saveRoundStats: (roundId, holeStats) =>
    withRetry(async ({ doc, revision }) => {
      const r = await saveRoundStats(doc, roundId, holeStats ?? [], ctx().courseLookup);
      const round = r.doc.rounds.find((x) => x.id === roundId);
      const res = await php<{ revision: number }>("me", "round-stats-save", {
        body: { id: roundId, holeStats: round?.holeStats ?? null, stats: round?.computed?.stats ?? null, baseRevision: revision, summary: summaryOf(r.doc) },
      });
      store(r.doc, res.revision);
      return { stats: r.stats, warnings: r.warnings };
    }),
  setRoundVisibility: (roundId, visibility) =>
    withRetry(async ({ doc }) => {
      const next = setRoundVisibility(doc, roundId, visibility);
      const res = await php<{ revision: number }>("me", "round-visibility", { body: { id: roundId, visibility } });
      store(next, res.revision);
    }),
  community: () => php<MyCommunity>("community", "my"),
  async saveCommunity(input) {
    const { doc } = await loadDoc();
    await php("me", "community-save", { body: { settings: input, summary: summaryOf(doc) } });
    await loadDoc(true);
    return php<MyCommunity>("community", "my");
  },
  async saveAvatar(dataUrl) {
    await php("me", "avatar-save", { body: { dataUrl } });
    await loadDoc(true);
    return php<MyCommunity>("community", "my");
  },
  async deleteAvatar() {
    await php("me", "avatar-delete", { body: {} });
    await loadDoc(true);
    return php<MyCommunity>("community", "my");
  },
  myRanking: () => php("community", "my-ranking"),
  simulate: async (sd) => simulateDifferential((await loadDoc()).doc, sd),
  target: async (t) => targetAnalysis((await loadDoc()).doc, t),
  gbe: async (input) => gbeTool(input),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const adminCall = <T>(action: string, body: object = {}) => php<T>("admin", action, { body });

type UserResponse = { user: AdminUserRow & { mustChangePassword: boolean; pendingEmail: string | null }; doc: unknown; canManage: boolean; canAssignRole: boolean };

const admin: AdminApi = {
  stats: () => adminCall("stats"),
  users: (f) => adminCall("users", f),
  async user(id) {
    const res = await adminCall<UserResponse>("user", { id });
    const detail: AdminUserDetail = adminUserDetail(res.user, normalizeMemberDoc(res.doc, id));
    return { ...detail, pendingEmail: res.user.pendingEmail, canManage: res.canManage, canAssignRole: res.canAssignRole };
  },
  createUser: (input) => adminCall("user-create", input),
  updateUser: (id, patch) => adminCall("user-update", { id, ...patch }),
  userPassword: (id, mode, password) => adminCall("user-password", { id, mode, password }),
  deleteUser: async (id, confirm) => {
    await adminCall("user-delete", { id, confirm });
  },
  async impersonate(id) {
    const res = await adminCall<UserResponse>("impersonate", { id });
    const doc = normalizeMemberDoc(res.doc, id);
    return { user: res.user, dashboard: dashboardData(doc, res.user.firstName), rounds: listRounds(doc) };
  },
  rounds: (f) => adminCall("rounds", f),
  async round(userId, roundId) {
    const res = await adminCall<{ user: { id: string; name: string; email: string | null }; doc: unknown }>("round", { userId, roundId });
    return adminRoundDetail(res.user, normalizeMemberDoc(res.doc, userId), roundId);
  },
  logs: (f) => adminCall("logs", f),
  async system() {
    const res = await adminCall<Awaited<ReturnType<AdminApi["system"]>>>("system");
    return { ...res, engine: { ruleSet: defaultRuleSet.label, version: res.engine.version || APP_VERSION, build: BUILD_INFO } };
  },
  rules: async () => rulesInfo(),
  async settings() {
    const res = await adminCall<AdminSettings>("settings");
    return { ...res, mail: { ...res.mail, editable: true } };
  },
  async saveSettings(input) {
    const res = await adminCall<AdminSettings>("settings-save", input);
    return { ...res, mail: { ...res.mail, editable: true } };
  },
  mailTest: (to) => adminCall("mail-test", { to }),
  async search(q) {
    const res = await adminCall<{ users: AdminUserRow[]; rounds: Awaited<ReturnType<AdminApi["search"]>>["rounds"] }>("search", { q });
    let courses: Awaited<ReturnType<AdminApi["search"]>>["courses"] = [];
    if (q.trim().length >= 2) {
      try {
        courses = runCourseSearch((await dataset()).courses, new URLSearchParams({ q, limit: "10" })).results;
      } catch {
        courses = [];
      }
    }
    return { users: res.users, rounds: res.rounds, courses };
  },
  async communityOverview() {
    const res = await adminCall<Omit<AdminCommunityOverview, "performance" | "dataQuality"> & { sums: StatSums; withWarnings: number }>("community");
    const { sums, withWarnings, ...rest } = res;
    return {
      ...rest,
      performance: ratesFromSums(sums),
      dataQuality: { roundsWithoutStats: sums.rounds - sums.detailedRounds, incompleteStats: sums.detailedRounds - sums.completeRounds, withWarnings },
    };
  },
  communityRanking: (f) => adminCall("community-ranking", f),
  communityRounds: (f) => adminCall("community-rounds", f),
  moderateRound: async (userId, roundId, action, reason) => {
    await adminCall("community-moderate", { userId, roundId, action, reason: reason ?? "" });
  },
  refreshRanking: () => adminCall("community-refresh"),
  hideUserCommunity: async (userId, patch) => {
    await adminCall("user-community", { id: userId, ...patch });
  },
};

// ---------------------------------------------------------------------------
// Community (nur Lesen; PHP filtert nach den Freigaben)
// ---------------------------------------------------------------------------

const cm = <T>(action: string, query: Record<string, string | number | null | undefined> = {}) => php<T>("community", action, {}, query);

const community: CommunityApi = {
  ranking: (p = {}) => cm("ranking", { scope: p.scope, page: p.page }),
  members: (p = {}) => cm("members", { q: p.q, sort: p.sort, page: p.page }),
  member: (id) => cm("member", { id }),
  memberRounds: (id, page) => cm("member-rounds", { id, page }),
  activity: (page) => cm("activity", { page }),
  async round(id, roundId) {
    const view = await cm<PublicRoundView>("round", { member: id, round: roundId });
    // Hinweistexte aus der vom Server gelieferten Statistik (reine Formulierung, keine Berechnung)
    return { ...view, insights: view.stats ? roundInsights(view.stats, { self: view.isMine }) : [] };
  },
};

export const webspaceApi: HcpApi = { auth, member, community, admin };
