/**
 * Einfacher Admin-Schutz für die Pflege der Golfplatzdaten.
 * - ADMIN_PASSWORD gesetzt: Anmeldung erforderlich (HttpOnly-Cookie mit HMAC).
 * - nicht gesetzt: in der Entwicklung offen (mit Hinweis), in Produktion gesperrt.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

export async function isAdmin(): Promise<boolean> {
  const mode = adminMode();
  if (mode === "OPEN_DEV") return true;
  if (mode === "DISABLED") return false;
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  return Boolean(value && safeEqual(value, token()));
}

/** Für Seiten: leitet zur Anmeldung um. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Für Server Actions und Route Handler: wirft bei fehlender Berechtigung. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Nicht berechtigt");
}

export async function loginAdmin(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !safeEqual(password, expected)) return false;
  const store = await cookies();
  store.set(COOKIE, token(), {
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
