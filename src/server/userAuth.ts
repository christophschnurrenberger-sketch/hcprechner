/**
 * Anmeldung für Benutzerkonten (Node-Edition): signiertes HttpOnly-Cookie (30 Tage).
 * Das Cookie enthält Benutzer-ID, Passwortstand und Ablaufzeit; ein Passwortwechsel
 * (auch ein Zurücksetzen durch den Admin) macht alle bestehenden Anmeldungen ungültig.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getUser } from "./userRepository";

const COOKIE = "hcp_user";
const MAX_AGE_S = 30 * 24 * 3600;

/** Geheimnis für die Signatur; ohne Konfiguration sind Benutzerkonten in Produktion abgeschaltet. */
function secret(): string | null {
  const s = process.env.USER_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "hcp-dev-only-secret";
}

export function accountsEnabled(): boolean {
  return secret() !== null;
}

function sign(value: string): string {
  return createHmac("sha256", secret() ?? "").update(`hcp-user-session-v1|${value}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function issueUserCookie(user: { id: string; passwordChangedAt: Date }): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const value = `${user.id}.${user.passwordChangedAt.getTime()}.${exp}`;
  const store = await cookies();
  store.set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearUserCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Angemeldeter, aktiver Benutzer oder null. */
export async function currentUser() {
  if (!accountsEnabled()) return null;
  const store = await cookies();
  const raw = store.get(COOKIE)?.value ?? "";
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [id, pwv, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${id}.${pwv}.${exp}`))) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  const user = await getUser(id);
  if (!user || !user.active || String(user.passwordChangedAt.getTime()) !== pwv) return null;
  return user;
}
