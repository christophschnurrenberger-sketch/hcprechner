/**
 * HTTP-Transport des API-Adapters: JSON, CSRF-Token (nur im Speicher, nie in localStorage/sessionStorage),
 * strukturierte Fehler und zentrale Behandlung abgelaufener Sitzungen.
 */
import { ApiError, type ApiErrorCode } from "./errors";

let csrf: string | null = null;

export function setCsrf(token: string | null): void {
  csrf = token;
}

export function getCsrf(): string | null {
  return csrf;
}

type SessionListener = (code: ApiErrorCode) => void;
const listeners = new Set<SessionListener>();

/** Benachrichtigung bei abgelaufener/ungültiger Sitzung (z. B. Weiterleitung zur Anmeldung). */
export function onSessionLost(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SESSION_CODES: ApiErrorCode[] = ["UNAUTHENTICATED", "SESSION_EXPIRED", "ACCOUNT_DISABLED", "ACCOUNT_LOCKED"];

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Fehler 401 nicht als „Sitzung verloren“ melden (z. B. Anmeldung, Prüfung beim Start). */
  quietAuth?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && csrf) headers["x-csrf-token"] = csrf;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError("NETWORK", undefined, 0);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError("SERVER", res.status === 404 ? "Schnittstelle nicht gefunden – ist die Anwendung vollständig installiert?" : `Ungültige Antwort des Servers (HTTP ${res.status}).`, res.status || 500);
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; message?: string; fields?: Record<string, string> };
    const code = (body.error && /^[A-Z_]+$/.test(body.error) ? body.error : res.status === 401 ? "UNAUTHENTICATED" : res.status === 403 ? "FORBIDDEN" : res.status === 404 ? "NOT_FOUND" : res.status === 409 ? "CONFLICT" : res.status === 429 ? "RATE_LIMITED" : "SERVER") as ApiErrorCode;
    const error = new ApiError(code, body.message, res.status, body.fields);
    if (!options.quietAuth && SESSION_CODES.includes(code)) for (const l of listeners) l(code);
    throw error;
  }
  return data as T;
}

/** Query-String ohne leere Werte. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
