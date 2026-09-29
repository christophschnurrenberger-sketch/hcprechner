/**
 * Webspace-Edition: Aufrufe von api/admin.php (Anmeldung, Datensatz laden/speichern).
 * Die Anmeldung erfolgt über eine PHP-Session; schreibende Aufrufe senden zusätzlich
 * das CSRF-Token der Session im Header X-CSRF-Token.
 */
import { phpApi } from "@/lib/runtime";
import type { AdminUserView, UserRole } from "@/lib/account/types";
import { parseDataset, type CourseDataset } from "./dataset";

/** owner = Haupt-Passwort (alles), editor = Benutzer mit Golfplatzpflege (ohne Benutzerverwaltung). */
export type AdminSessionRole = "owner" | "editor";

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface AdminStatus {
  installed: boolean;
  loggedIn: boolean;
  csrf: string | null;
  role: AdminSessionRole | null;
  syncEnabled: boolean;
  phpVersion?: string;
  appVersion?: string;
}

async function call<T>(action: string, body?: unknown, csrf?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(phpApi("admin", { action }), {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AdminApiError("Server nicht erreichbar", 0);
  }
  const text = await res.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AdminApiError(
      res.status === 404
        ? "api/admin.php nicht gefunden – wurde der Ordner „api“ vollständig hochgeladen?"
        : `Ungültige Antwort des Servers (HTTP ${res.status}). Ist PHP auf dem Webspace aktiv?`,
      res.status,
    );
  }
  if (!res.ok) throw new AdminApiError(json?.error ?? `Fehler (HTTP ${res.status})`, res.status);
  return json as T;
}

export const adminApi = {
  status: () => call<AdminStatus>("status"),
  login: (password: string, username = "") => call<{ ok: true; csrf: string; role: AdminSessionRole }>("login", { password, username }),
  logout: (csrf: string | null) => call<{ ok: true }>("logout", {}, csrf),
  async load(csrf: string | null): Promise<CourseDataset> {
    return parseDataset(await call<unknown>("load", {}, csrf));
  },
  save: (csrf: string | null, baseRevision: number, dataset: CourseDataset) =>
    call<{ ok: true; revision: number; updatedAt: string }>("save", { baseRevision, dataset }, csrf),
  changePassword: (csrf: string | null, current: string, next: string) => call<{ ok: true }>("password", { current, next }, csrf),
  users: (csrf: string | null) => call<{ users: AdminUserView[] }>("users", {}, csrf),
  userCreate: (csrf: string | null, input: { username: string; displayName: string; role: UserRole; password: string }) =>
    call<{ user: AdminUserView }>("user-create", input, csrf),
  userUpdate: (csrf: string | null, input: { id: string; displayName?: string; role?: UserRole; active?: boolean }) =>
    call<{ user: AdminUserView }>("user-update", input, csrf),
  userPassword: (csrf: string | null, id: string, password: string) => call<{ ok: true }>("user-password", { id, password }, csrf),
  userDelete: (csrf: string | null, id: string) => call<{ ok: true }>("user-delete", { id }, csrf),
};
