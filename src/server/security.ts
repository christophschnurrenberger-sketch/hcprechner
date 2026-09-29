/**
 * Sicherheitsbausteine der Node-Edition: Passwort-Hashing (scrypt), Einmal-Token, Signaturschlüssel,
 * einfache Begrenzung von Anfragen (je Prozess).
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appSettings } from "@/db/schema";

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

function scrypt(password: string, salt: Buffer, keyLen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keyLen, options, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Vergleichs-Hash für nicht vorhandene Konten (gleiche Laufzeit wie eine echte Prüfung). */
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    dummyHash ??= hashPassword("hcp-dummy-password");
    await verifyPassword(password, await dummyHash);
    return false;
  }
  const [kind, n, r, p, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Einmal-Token: Klartext für den Link, gespeichert wird nur der Hash. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Signaturschlüssel für Sitzungen: SESSION_SECRET oder – ohne Konfiguration – ein einmalig erzeugter,
 * in der Datenbank gespeicherter Zufallswert (wie in der Webspace-Edition).
 */
let secretPromise: Promise<string> | null = null;

export function sessionSecret(): Promise<string> {
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 16) return Promise.resolve(env);
  secretPromise ??= (async () => {
    const db = await getDb();
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "session_secret"));
    if (row && typeof row.value === "string") return row.value;
    const value = randomBytes(32).toString("hex");
    await db.insert(appSettings).values({ key: "session_secret", value }).onConflictDoNothing();
    const [stored] = await db.select().from(appSettings).where(eq(appSettings.key, "session_secret"));
    return String(stored.value);
  })().catch((error) => {
    secretPromise = null;
    throw error;
  });
  return secretPromise;
}

// ---------------------------------------------------------------------------
// Begrenzung von Anfragen (im Speicher des Server-Prozesses)
// ---------------------------------------------------------------------------

const buckets = new Map<string, number[]>();

function hits(bucket: string, key: string, windowS: number): number[] {
  const id = `${bucket}|${key}`;
  const now = Date.now();
  const list = (buckets.get(id) ?? []).filter((t) => t > now - windowS * 1000);
  buckets.set(id, list);
  if (buckets.size > 20000) buckets.clear();
  return list;
}

export function rateLimited(bucket: string, key: string, max: number, windowS: number): boolean {
  return hits(bucket, key, windowS).length >= max;
}

export function rateHit(bucket: string, key: string, windowS: number): void {
  hits(bucket, key, windowS).push(Date.now());
}

/** Nur für Tests. */
export function resetRateLimits(): void {
  buckets.clear();
}
