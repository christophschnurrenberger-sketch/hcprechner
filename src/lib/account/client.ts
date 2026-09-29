/**
 * Benutzerkonto im Browser – Aufrufe je nach Build-Variante.
 *
 * - Node-Edition:     /api/account (GET Status, POST Aktionen) und /api/account/data (GET/PUT)
 * - Webspace-Edition: api/account.php?action=… (nur POST; CSRF-Token der Sitzung im Header)
 */
import { IS_WEBSPACE, phpApi } from "@/lib/runtime";
import type { AccountUser } from "./types";
import type { UserDataPayload, UserDataResponse } from "./userData";

export class AccountApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

export interface AccountStatus {
  /** false: Benutzerkonten auf diesem Server nicht verfügbar (z. B. ohne PHP/Datenbank). */
  enabled: boolean;
  user: AccountUser | null;
  csrf: string | null;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new AccountApiError("Server nicht erreichbar", 0);
  }
  const text = await res.text();
  let json: (T & { error?: string }) | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new AccountApiError(`Ungültige Antwort des Servers (HTTP ${res.status})`, res.status);
  }
  if (!res.ok) throw new AccountApiError(json?.error ?? `Fehler (HTTP ${res.status})`, res.status, json);
  return json as T;
}

function webspace<T>(action: string, body: unknown, csrf: string | null): Promise<T> {
  return request<T>(phpApi("account", { action }), {
    method: "POST",
    headers: { "content-type": "application/json", ...(csrf ? { "x-csrf-token": csrf } : {}) },
    body: JSON.stringify(body ?? {}),
  });
}

function node<T>(action: string, body: unknown): Promise<T> {
  return request<T>("/api/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...(body as object) }),
  });
}

export const accountApi = {
  async status(): Promise<AccountStatus> {
    try {
      return IS_WEBSPACE ? await webspace<AccountStatus>("status", {}, null) : await request<AccountStatus>("/api/account");
    } catch (error) {
      // Kein Backend (reines Static Hosting, Datenbank nicht erreichbar): Konten ausblenden
      if (error instanceof AccountApiError && (error.status === 0 || error.status === 404 || error.status >= 500 || error.status === 200)) {
        return { enabled: false, user: null, csrf: null };
      }
      throw error;
    }
  },

  login(username: string, password: string): Promise<{ user: AccountUser; csrf: string | null }> {
    return IS_WEBSPACE ? webspace("login", { username, password }, null) : node("login", { username, password });
  },

  logout(csrf: string | null): Promise<{ ok: true }> {
    return IS_WEBSPACE ? webspace("logout", {}, csrf) : node("logout", {});
  },

  changePassword(csrf: string | null, current: string, next: string): Promise<{ ok: true; user: AccountUser; csrf?: string | null }> {
    return IS_WEBSPACE ? webspace("password", { current, next }, csrf) : node("password", { current, next });
  },

  loadData(csrf: string | null): Promise<UserDataResponse> {
    return IS_WEBSPACE ? webspace("load", {}, csrf) : request("/api/account/data");
  },

  /** Speichert mit Revisionsprüfung; bei zwischenzeitlicher Änderung HTTP 409 mit aktuellem Serverstand im Body. */
  saveData(csrf: string | null, baseRevision: number, data: UserDataPayload): Promise<{ ok: true; revision: number; updatedAt: string }> {
    const body = { baseRevision, data };
    return IS_WEBSPACE
      ? webspace("save", body, csrf)
      : request("/api/account/data", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  },
};
