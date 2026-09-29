/**
 * Sitzungen der Node-Edition: signiertes HttpOnly-Cookie „hcp_session“ (14 Tage, gleitend).
 * Bei jeder Anfrage werden Konto, Status, Rolle und Passwortstand aus der Datenbank geprüft –
 * die Rolle stammt nie aus dem Browser. Schreibende Anfragen benötigen zusätzlich den
 * CSRF-Token (Header X-CSRF-Token), der an Konto und Passwortstand gebunden ist.
 */
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { apiError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/api/types";
import { can, isRole, permissionsOf, type Permission, type Role } from "@/lib/auth/permissions";
import type { UserRow } from "@/db/schema";
import { safeEqual, sessionSecret } from "./security";
import { updateUser, userById } from "./users";
import { loadMemberDoc } from "./members";

export const SESSION_COOKIE = "hcp_session";
const SESSION_DAYS = 14;

interface Payload {
  uid: string;
  pwv: string;
  iat: number;
  exp: number;
}

function b64(data: string): string {
  return Buffer.from(data).toString("base64url");
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(`session|${value}`).digest("base64url");
}

function pwv(user: UserRow): string {
  return String(user.passwordChangedAt.getTime());
}

export async function csrfToken(user: UserRow): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(`csrf|${user.id}|${pwv(user)}`).digest("hex");
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "false" ? false : process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

/** Setzt das Sitzungscookie und liefert den CSRF-Token. */
export async function issueSession(user: UserRow): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64(JSON.stringify({ uid: user.id, pwv: pwv(user), iat: now, exp: now + SESSION_DAYS * 86400 } satisfies Payload));
  const store = await cookies();
  store.set(SESSION_COOKIE, `${payload}.${await sign(payload)}`, cookieOptions(SESSION_DAYS * 86400));
  return csrfToken(user);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}

export type SessionReason = "none" | "invalid" | "expired" | "disabled" | "locked";

/** Angemeldeter Benutzer (aktiv, gültiger Passwortstand) oder null mit Grund. */
export async function sessionUser(): Promise<{ user: UserRow | null; reason: SessionReason | null }> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value ?? "";
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return { user: null, reason: "none" };
  if (!safeEqual(sig, await sign(payload))) return { user: null, reason: "invalid" };
  let data: Payload;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return { user: null, reason: "invalid" };
  }
  if (!data?.uid || data.exp * 1000 < Date.now()) return { user: null, reason: "expired" };
  const user = await userById(data.uid);
  if (!user || pwv(user) !== data.pwv) return { user: null, reason: "expired" };
  if (user.status !== "ACTIVE") return { user: null, reason: user.status === "LOCKED" ? "locked" : "disabled" };
  // Gleitende Sitzung: Cookie täglich erneuern (in Server Components nicht möglich → ignorieren)
  if (data.iat * 1000 < Date.now() - 86400_000) {
    try {
      await issueSession(user);
    } catch {
      // Aufruf aus einer Server Component
    }
  }
  if (!user.lastActivityAt || user.lastActivityAt.getTime() < Date.now() - 3600_000) {
    await updateUser(user.id, { lastActivityAt: new Date() });
  }
  return { user, reason: null };
}

const REASON_CODES = { expired: "SESSION_EXPIRED", invalid: "UNAUTHENTICATED", none: "UNAUTHENTICATED", disabled: "ACCOUNT_DISABLED", locked: "ACCOUNT_LOCKED" } as const;

/**
 * Für geschützte API-Aufrufe. Schreibende Methoden (alles außer GET/HEAD) prüfen den CSRF-Token
 * und – als zweite Schutzschicht – die Herkunft (Origin), falls der Browser sie mitsendet.
 */
export async function requireUser(req: Request): Promise<UserRow> {
  const { user, reason } = await sessionUser();
  if (!user) throw apiError(REASON_CODES[reason ?? "none"], undefined);
  if (req.method !== "GET" && req.method !== "HEAD") {
    const token = req.headers.get("x-csrf-token") ?? "";
    if (!token || !safeEqual(token, await csrfToken(user))) throw apiError("SESSION_EXPIRED", "Sicherheitstoken ungültig – bitte neu anmelden");
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL?.replace(/\/+$/, "")) throw apiError("FORBIDDEN", "Ungültige Herkunft der Anfrage");
  }
  return user;
}

export function roleOf(user: UserRow): Role {
  return isRole(user.role) ? user.role : "USER";
}

export async function requirePermission(req: Request, permission: Permission): Promise<UserRow> {
  const user = await requireUser(req);
  if (!can(roleOf(user), permission)) throw apiError("FORBIDDEN");
  return user;
}

export async function sessionView(user: UserRow): Promise<SessionUser> {
  const { doc } = await loadMemberDoc(user.id);
  const role = roleOf(user);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role,
    permissions: permissionsOf(role),
    emailVerified: user.emailVerified,
    mustChangePassword: user.mustChangePassword,
    onboarded: Boolean(doc.preferences.onboardedAt),
  };
}

/** Für Server-Layouts: angemeldeter Benutzer oder null (keine Weiterleitung hier). */
export async function pageUser(): Promise<{ user: UserRow | null; reason: SessionReason | null }> {
  try {
    return await sessionUser();
  } catch {
    return { user: null, reason: "none" };
  }
}
