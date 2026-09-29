/**
 * API-Adapter der Node-Edition: reine HTTP-Aufrufe – berechnet wird auf dem Server.
 */
import type { AdminApi, AuthApi, HcpApi, MemberApi } from "./client";
import { qs, request, setCsrf } from "./transport";

const auth: AuthApi = {
  async me() {
    const res = await request<Awaited<ReturnType<AuthApi["me"]>>>("/api/auth/me", { quietAuth: true });
    setCsrf(res.csrf);
    return res;
  },
  async login(email, password) {
    const res = await request<{ user: never; csrf: string }>("/api/auth/login", { body: { email, password }, quietAuth: true });
    setCsrf(res.csrf);
    return res;
  },
  async logout() {
    await request("/api/auth/logout", { body: {}, quietAuth: true });
    setCsrf(null);
  },
  async register(input) {
    const res = await request<Awaited<ReturnType<AuthApi["register"]>>>("/api/auth/register", { body: input, quietAuth: true });
    if (!res.verificationRequired) setCsrf(res.csrf);
    return res;
  },
  verifyEmail: (token) => request("/api/auth/verify-email", { body: { token }, quietAuth: true }),
  resendVerification: async (email) => {
    await request("/api/auth/resend-verification", { body: { email }, quietAuth: true });
  },
  forgotPassword: async (email) => {
    await request("/api/auth/forgot-password", { body: { email }, quietAuth: true });
  },
  resetPassword: async (token, password, passwordRepeat) => {
    await request("/api/auth/reset-password", { body: { token, password, passwordRepeat }, quietAuth: true });
  },
  async changePassword(input) {
    const res = await request<{ user: never; csrf: string }>("/api/auth/change-password", { body: input });
    setCsrf(res.csrf);
    return res;
  },
  updateProfile: (input) => request("/api/auth/update-profile", { body: input }),
  exportData: () => request("/api/auth/export", { body: {} }),
  deleteAccount: async (password, confirm) => {
    await request("/api/auth/delete-account", { body: { password, confirm } });
    setCsrf(null);
  },
};

const member: MemberApi = {
  profile: () => request("/api/me"),
  dashboard: () => request("/api/me/dashboard"),
  hcp: () => request("/api/me/hcp"),
  rounds: (filter = {}) => request(`/api/me/rounds${qs({ holes: filter.holes ?? null })}`),
  round: (id) => request(`/api/me/rounds/${encodeURIComponent(id)}`),
  previewRound: (input, roundId) => request("/api/me/rounds/preview", { body: { input, roundId } }),
  createRound: (input, draftId) => request("/api/me/rounds", { body: { input, draftId: draftId ?? null } }),
  updateRound: (id, input) => request(`/api/me/rounds/${encodeURIComponent(id)}`, { method: "PUT", body: { input } }),
  deleteRound: async (id) => {
    await request(`/api/me/rounds/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });
  },
  saveProfile: (input) => request("/api/me/profile", { method: "PUT", body: input }),
  completeOnboarding: (input) => request("/api/me/onboarding", { body: input }),
  courseLists: () => request("/api/me/courses"),
  setFavorite: (courseId, favorite) => request(`/api/me/favorites/${encodeURIComponent(courseId)}`, { method: "PUT", body: { favorite } }),
  setHomeCourse: (courseId) => request("/api/me/home-course", { method: "PUT", body: { courseId } }),
  drafts: () => request("/api/me/drafts"),
  saveDraft: (draft) => request(`/api/me/drafts/${encodeURIComponent(draft.id)}`, { method: "PUT", body: { label: draft.label, input: draft.input } }),
  deleteDraft: async (id) => {
    await request(`/api/me/drafts/${encodeURIComponent(id)}`, { method: "DELETE", body: {} });
  },
  importPreview: (csv) => request("/api/me/import/preview", { body: { csv } }),
  importRounds: (csv) => request("/api/me/import", { body: { csv } }),
  statistics: () => request("/api/me/statistics"),
  simulate: (scoreDifferential) => request("/api/me/tools/simulate", { body: { scoreDifferential } }),
  target: (target) => request("/api/me/tools/target", { body: { target } }),
  gbe: (input) => request("/api/me/tools/gbe", { body: input }),
};

const admin: AdminApi = {
  stats: () => request("/api/admin/stats"),
  users: (f) => request(`/api/admin/users${qs({ ...f })}`),
  user: (id) => request(`/api/admin/users/${encodeURIComponent(id)}`),
  createUser: (input) => request("/api/admin/users", { body: input }),
  updateUser: (id, patch) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  userPassword: (id, mode, password) => request(`/api/admin/users/${encodeURIComponent(id)}/password`, { body: { mode, password } }),
  deleteUser: async (id, confirm) => {
    await request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE", body: { confirm } });
  },
  impersonate: (id) => request(`/api/admin/users/${encodeURIComponent(id)}/view`),
  rounds: (f) => request(`/api/admin/rounds${qs({ ...f })}`),
  round: (userId, roundId) => request(`/api/admin/rounds/${encodeURIComponent(userId)}/${encodeURIComponent(roundId)}`),
  logs: (f) => request(`/api/admin/logs${qs({ ...f })}`),
  system: () => request("/api/admin/system"),
  rules: () => request("/api/admin/rules"),
  settings: () => request("/api/admin/settings"),
  saveSettings: (input) => request("/api/admin/settings", { method: "PUT", body: input }),
  mailTest: (to) => request("/api/admin/settings/mail-test", { body: { to } }),
  search: (q) => request(`/api/admin/search${qs({ q })}`),
};

export const nodeApi: HcpApi = { auth, member, admin };
