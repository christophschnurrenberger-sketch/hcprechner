/**
 * Benutzerkonten (Node-Edition): vom Admin angelegte Zugänge, Passwörter mit scrypt,
 * Kontodaten (Profil, Runden, Einstellungen) als ein Dokument mit Revisionsnummer.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appUserData, appUsers } from "@/db/schema";
import {
  isUserRole,
  normalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername,
  type AccountUser,
  type AdminUserView,
  type UserRole,
} from "@/lib/account/types";
import type { UserDataPayload, UserDataResponse } from "@/lib/account/userData";

export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type UserRow = typeof appUsers.$inferSelect;

// ---------------------------------------------------------------------------
// Passwörter
// ---------------------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

function scrypt(password: string, salt: Buffer, keyLen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keyLen, options, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

export function toAccountUser(u: UserRow): AccountUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role as UserRole, mustChangePassword: u.mustChangePassword };
}

export async function getUser(id: string): Promise<UserRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  return row ?? null;
}

export async function listUsers(): Promise<AdminUserView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      user: appUsers,
      dataUpdatedAt: appUserData.updatedAt,
      rounds: sql<number>`coalesce(jsonb_array_length(${appUserData.data} -> 'rounds'), 0)`,
    })
    .from(appUsers)
    .leftJoin(appUserData, eq(appUserData.userId, appUsers.id))
    .orderBy(appUsers.username);
  return rows.map(({ user, dataUpdatedAt, rounds }) => ({
    ...toAccountUser(user),
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    dataUpdatedAt: dataUpdatedAt?.toISOString() ?? null,
    rounds: Number(rounds ?? 0),
  }));
}

function check(error: string | null) {
  if (error) throw new UserError(error);
}

export async function createUser(input: { username: string; displayName: string; role: string; password: string }): Promise<UserRow> {
  const username = normalizeUsername(input.username);
  check(validateUsername(username));
  check(validateDisplayName(input.displayName));
  check(validatePassword(input.password));
  const role: UserRole = isUserRole(input.role) ? input.role : "player";
  const db = await getDb();
  const [existing] = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.username, username));
  if (existing) throw new UserError(`Der Benutzername „${username}“ ist bereits vergeben.`, 409);
  const [row] = await db
    .insert(appUsers)
    .values({ username, displayName: input.displayName.trim(), role, passwordHash: await hashPassword(input.password), mustChangePassword: true })
    .returning();
  return row;
}

export async function updateUser(id: string, patch: { displayName?: string; role?: string; active?: boolean }): Promise<void> {
  const values: Partial<typeof appUsers.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) {
    check(validateDisplayName(patch.displayName));
    values.displayName = patch.displayName.trim();
  }
  if (patch.role !== undefined) values.role = isUserRole(patch.role) ? patch.role : "player";
  if (patch.active !== undefined) values.active = patch.active;
  const db = await getDb();
  const updated = await db.update(appUsers).set(values).where(eq(appUsers.id, id)).returning({ id: appUsers.id });
  if (updated.length === 0) throw new UserError("Benutzer nicht gefunden", 404);
}

/** Neues Passwort durch den Admin: muss bei der nächsten Anmeldung geändert werden; meldet alle Geräte ab. */
export async function resetUserPassword(id: string, password: string): Promise<void> {
  check(validatePassword(password));
  const db = await getDb();
  const now = new Date();
  const updated = await db
    .update(appUsers)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true, passwordChangedAt: now, updatedAt: now })
    .where(eq(appUsers.id, id))
    .returning({ id: appUsers.id });
  if (updated.length === 0) throw new UserError("Benutzer nicht gefunden", 404);
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  const deleted = await db.delete(appUsers).where(eq(appUsers.id, id)).returning({ id: appUsers.id });
  if (deleted.length === 0) throw new UserError("Benutzer nicht gefunden", 404);
}

/** Anmeldung: aktives Konto und korrektes Passwort (optional mit bestimmter Rolle). */
export async function authenticate(usernameRaw: string, password: string, requiredRole?: UserRole): Promise<UserRow | null> {
  const username = normalizeUsername(usernameRaw);
  const db = await getDb();
  const [row] = await db.select().from(appUsers).where(eq(appUsers.username, username));
  if (!row || !row.active || (requiredRole && row.role !== requiredRole)) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, row.id));
  return row;
}

export async function changeOwnPassword(id: string, current: string, next: string): Promise<UserRow> {
  const row = await getUser(id);
  if (!row) throw new UserError("Benutzer nicht gefunden", 404);
  if (!(await verifyPassword(current, row.passwordHash))) throw new UserError("Aktuelles Passwort falsch.");
  check(validatePassword(next));
  const db = await getDb();
  const now = new Date();
  const [updated] = await db
    .update(appUsers)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: now, updatedAt: now })
    .where(eq(appUsers.id, id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Kontodaten
// ---------------------------------------------------------------------------

export async function loadUserData(userId: string): Promise<UserDataResponse> {
  const db = await getDb();
  const [row] = await db.select().from(appUserData).where(eq(appUserData.userId, userId));
  if (!row) return { data: null, revision: 0, updatedAt: null };
  return { data: row.data as UserDataPayload, revision: row.revision, updatedAt: row.updatedAt.toISOString() };
}

export type SaveUserDataResult = { ok: true; revision: number; updatedAt: string } | { ok: false; conflict: UserDataResponse };

/** Speichert nur, wenn der Stand des Geräts (baseRevision) noch aktuell ist. */
export async function saveUserData(userId: string, baseRevision: number, data: UserDataPayload): Promise<SaveUserDataResult> {
  const db = await getDb();
  const now = new Date();
  const payload = { profile: data.profile, rounds: data.rounds, settings: data.settings ?? null };
  if (baseRevision === 0) {
    const inserted = await db
      .insert(appUserData)
      .values({ userId, data: payload, revision: 1, updatedAt: now })
      .onConflictDoNothing()
      .returning({ revision: appUserData.revision });
    if (inserted.length === 1) return { ok: true, revision: 1, updatedAt: now.toISOString() };
  } else {
    const updated = await db
      .update(appUserData)
      .set({ data: payload, revision: sql`${appUserData.revision} + 1`, updatedAt: now })
      .where(and(eq(appUserData.userId, userId), eq(appUserData.revision, baseRevision)))
      .returning({ revision: appUserData.revision });
    if (updated.length === 1) return { ok: true, revision: updated[0].revision, updatedAt: now.toISOString() };
  }
  return { ok: false, conflict: await loadUserData(userId) };
}
