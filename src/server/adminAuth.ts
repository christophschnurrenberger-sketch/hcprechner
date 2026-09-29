/**
 * Einfacher Admin-Schutz für die Pflege der Golfplatzdaten.
 * - ADMIN_PASSWORD gesetzt: Anmeldung erforderlich (HttpOnly-Cookie mit HMAC).
 * - nicht gesetzt: in der Entwicklung offen (mit Hinweis), in Produktion gesperrt.
 * - Zusätzlich: Benutzer mit der Rolle „editor“ melden sich mit Benutzername + Passwort an und
 *   dürfen die Golfplatzdaten pflegen (nicht die Benutzerverwaltung).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, getUser } from "./userRepository";

const COOKIE = "hcp_admin";

export type AdminMode = "PROTECTED" | "OPEN_DEV" | "DISABLED";

export function adminMode(): AdminMode {
  if (process.env.ADMIN_PASSWORD) return "PROTECTED";
  return process.env.NODE_ENV === "production" ? "DISABLED" : "OPEN_DEV";
}

function token(): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "";
  return createHmac("sha256", secret).update("hcp-admin-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type AdminRole = "owner" | "editor";

function editorToken(id: string, pwv: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "";
  const value = `e.${id}.${pwv}`;
  return `${value}.${createHmac("sha256", secret).update(`hcp-admin-editor-v1|${value}`).digest("hex")}`;
}

/** Rolle der aktuellen Admin-Sitzung oder null. */
export async function adminRole(): Promise<AdminRole | null> {
  const mode = adminMode();
  if (mode === "OPEN_DEV") return "owner";
  if (mode === "DISABLED") return null;
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  if (!value) return null;
  if (safeEqual(value, token())) return "owner";
  const parts = value.split(".");
  if (parts.length === 4 && parts[0] === "e") {
    const [, id, pwv] = parts;
    if (!safeEqual(value, editorToken(id, pwv))) return null;
    try {
      const user = await getUser(id);
      if (user && user.active && user.role === "editor" && String(user.passwordChangedAt.getTime()) === pwv) return "editor";
    } catch {
      return null;
    }
  }
  return null;
}

export async function isAdmin(): Promise<boolean> {
  return (await adminRole()) !== null;
}

/** Benutzerverwaltung und Admin-Passwort: nur mit dem Haupt-Passwort. */
export async function requireOwner(): Promise<void> {
  if ((await adminRole()) !== "owner") throw new Error("Nur mit dem Haupt-Passwort des Admin-Bereichs möglich");
}

export async function requireOwnerPage(): Promise<void> {
  const role = await adminRole();
  if (role === null) redirect("/admin/login");
  if (role !== "owner") redirect("/admin");
}

/** Für Seiten: leitet zur Anmeldung um. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Für Server Actions und Route Handler: wirft bei fehlender Berechtigung. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Nicht berechtigt");
}

export async function loginAdmin(password: string, username = ""): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  let value: string;
  if (username.trim()) {
    const user = await authenticate(username, password, "editor").catch(() => null);
    if (!user) return false;
    value = editorToken(user.id, String(user.passwordChangedAt.getTime()));
  } else {
    if (!safeEqual(password, expected)) return false;
    value = token();
  }
  const store = await cookies();
  store.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return true;
}

export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
