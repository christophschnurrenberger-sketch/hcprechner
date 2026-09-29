/**
 * API-Adapter: die einzige Schnittstelle der Oberfläche zum Backend.
 *
 * - Node-Edition:     Route Handler unter /api/auth, /api/me, /api/admin (Berechnung auf dem Server)
 * - Webspace-Edition: PHP (Anmeldung, Rollen, Datentrennung, Speicherung, Audit) + gemeinsame
 *                     Service-Schicht src/lib/member für die Berechnung (PHP kann kein TypeScript ausführen)
 *
 * Komponenten importieren nur `api` und die Datentypen – nie die WHS-Engine.
 */
import { IS_WEBSPACE } from "@/lib/runtime";
import type {
  AdminImpersonation,
  AdminRoundDetail,
  AdminRoundRow,
  AdminSearchResult,
  AdminSettings,
  AdminSettingsInput,
  AdminStats,
  AdminUserDetail,
  AdminUserInput,
  AdminUserPatch,
  AdminUserRow,
  AuditEntry,
  DashboardData,
  DraftRound,
  HcpResult,
  MemberCourseLists,
  MemberPreferences,
  MemberProfileData,
  Page,
  PublicSettings,
  RoundDetail,
  RoundInput,
  RoundListItem,
  RoundPreview,
  RoundSaveResult,
  RulesInfo,
  SessionUser,
  SystemStatus,
} from "./types";
import type { PlayerStatistics } from "@/lib/whs/statistics";
import type { TargetAnalysis, WhatIfResult } from "@/lib/whs/simulation";
import type { Gender, HoleInfo, HoleScore, PccValue, RoundEvaluation } from "@/lib/whs/types";

export interface MeResponse {
  installed: boolean;
  user: SessionUser | null;
  csrf: string | null;
  settings: PublicSettings;
  appVersion?: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordRepeat: string;
  handicapIndex: string | number | null;
  acceptTerms: boolean;
}

export type RegisterResult =
  | { verificationRequired: true; mailSent: boolean; email: string }
  | { verificationRequired: false; user: SessionUser; csrf: string };

export interface AuthApi {
  me(): Promise<MeResponse>;
  login(email: string, password: string): Promise<{ user: SessionUser; csrf: string }>;
  logout(): Promise<void>;
  register(input: RegisterInput): Promise<RegisterResult>;
  verifyEmail(token: string): Promise<{ email: string }>;
  resendVerification(email: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string, passwordRepeat: string): Promise<void>;
  changePassword(input: { currentPassword: string; newPassword: string; newPasswordRepeat: string }): Promise<{ user: SessionUser; csrf: string }>;
  updateProfile(input: { firstName: string; lastName: string; email: string; currentPassword?: string }): Promise<{ user: SessionUser; pendingEmail: string | null }>;
  exportData(): Promise<unknown>;
  deleteAccount(password: string, confirm: string): Promise<void>;
}

export interface ImportPreview {
  rows: { rowNumber: number; date: string | null; courseName: string | null; holes: number | null; errors: string[]; warnings: string[] }[];
  missing: string[];
  valid: number;
}

export interface GbeToolInput {
  handicapIndex: number;
  holes: 9 | 18;
  par: number | null;
  courseRating: number;
  slopeRating: number;
  pcc?: PccValue;
  holeData: HoleInfo[];
  strokes: HoleScore[];
}

export interface MemberApi {
  profile(): Promise<MemberProfileData>;
  dashboard(): Promise<DashboardData>;
  hcp(): Promise<HcpResult>;
  rounds(filter?: { holes?: 9 | 18 | null }): Promise<RoundListItem[]>;
  round(id: string): Promise<RoundDetail>;
  previewRound(input: RoundInput, roundId?: string): Promise<RoundPreview>;
  createRound(input: RoundInput, draftId?: string | null): Promise<RoundSaveResult>;
  updateRound(id: string, input: RoundInput): Promise<RoundSaveResult>;
  deleteRound(id: string): Promise<void>;
  saveProfile(input: { gender: Gender; startHandicapIndex: number }): Promise<MemberProfileData>;
  completeOnboarding(input: { startHandicapIndex: number | null; homeCourseId: string | null; gender?: Gender }): Promise<MemberProfileData>;
  courseLists(): Promise<MemberCourseLists>;
  setFavorite(courseId: string, favorite: boolean): Promise<MemberPreferences>;
  setHomeCourse(courseId: string | null): Promise<MemberPreferences>;
  drafts(): Promise<DraftRound[]>;
  saveDraft(draft: { id: string; label: string; input: DraftRound["input"] }): Promise<DraftRound>;
  deleteDraft(id: string): Promise<void>;
  importPreview(csv: string): Promise<ImportPreview>;
  importRounds(csv: string): Promise<{ imported: number; skipped: number }>;
  statistics(): Promise<PlayerStatistics>;
  simulate(scoreDifferential: number): Promise<WhatIfResult>;
  target(target: number): Promise<TargetAnalysis>;
  gbe(input: GbeToolInput): Promise<RoundEvaluation>;
}

export interface UserListFilter {
  q?: string;
  role?: string;
  status?: string;
  verified?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface RoundListFilter {
  q?: string;
  userId?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface LogFilter {
  action?: string;
  group?: "" | "admin" | "member";
  actorId?: string;
  userId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminApi {
  stats(): Promise<AdminStats>;
  users(filter: UserListFilter): Promise<Page<AdminUserRow>>;
  user(id: string): Promise<AdminUserDetail>;
  createUser(input: AdminUserInput): Promise<{ user: AdminUserRow; invite: boolean; mailSent: boolean | null }>;
  updateUser(id: string, patch: AdminUserPatch): Promise<{ user: AdminUserRow }>;
  userPassword(id: string, mode: "mail" | "temporary", password?: string): Promise<{ ok: true; mailSent?: boolean }>;
  deleteUser(id: string, confirm: string): Promise<void>;
  impersonate(id: string): Promise<AdminImpersonation>;
  rounds(filter: RoundListFilter): Promise<Page<AdminRoundRow>>;
  round(userId: string, roundId: string): Promise<AdminRoundDetail>;
  logs(filter: LogFilter): Promise<Page<AuditEntry>>;
  system(): Promise<SystemStatus>;
  rules(): Promise<RulesInfo>;
  settings(): Promise<AdminSettings>;
  saveSettings(input: AdminSettingsInput): Promise<AdminSettings>;
  mailTest(to: string): Promise<{ ok: boolean; mode: string }>;
  search(q: string): Promise<AdminSearchResult>;
}

export interface HcpApi {
  auth: AuthApi;
  member: MemberApi;
  admin: AdminApi;
}

/** Lädt die Implementierung erst bei Bedarf (die Node-Edition lädt den Webspace-Adapter nie). */
function lazy<T extends object>(load: () => Promise<T>): T {
  let loaded: Promise<T> | null = null;
  return new Proxy({} as T, {
    get(_target, prop) {
      return async (...args: unknown[]) => {
        loaded ??= load();
        const impl = (await loaded) as Record<PropertyKey, (...a: unknown[]) => unknown>;
        return impl[prop](...args);
      };
    },
  });
}

const loadImpl = (): Promise<HcpApi> => (IS_WEBSPACE ? import("./webspace").then((m) => m.webspaceApi) : import("./node").then((m) => m.nodeApi));

export const api: HcpApi = {
  auth: lazy(() => loadImpl().then((i) => i.auth)),
  member: lazy(() => loadImpl().then((i) => i.member)),
  admin: lazy(() => loadImpl().then((i) => i.admin)),
};
