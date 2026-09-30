/**
 * Benutzerkonten der Node-Edition (Tabelle users) und Einmal-Token.
 */
import { and, asc, count, desc, eq, gt, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { authTokens, memberData, users, type UserRow } from "@/db/schema";
import type { AdminUserRow, Page } from "@/lib/api/types";
import { activeRounds, normalizeMemberDoc } from "@/lib/member/doc";
import { hashToken, newToken } from "./security";

export type TokenPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID.test(id);
}

export async function userById(id: string): Promise<UserRow | null> {
  if (!isUuid(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

export async function userByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  return row ?? null;
}

/** Benutzername ohne Beachtung der Groß-/Kleinschreibung (Konten der Version 1 können Großbuchstaben enthalten). */
export async function userByUsername(username: string): Promise<UserRow | null> {
  const value = username.trim().toLowerCase();
  if (!value) return null;
  const db = await getDb();
  const [row] = await db.select().from(users).where(sql`lower(${users.username}) = ${value}`);
  return row ?? null;
}

/** E-Mail-Adresse oder Benutzername (vom Admin angelegte Konten ohne E-Mail, übernommene Konten der Version 1). */
export async function userByLogin(login: string): Promise<UserRow | null> {
  const value = login.trim().toLowerCase();
  if (!value) return null;
  return value.includes("@") ? userByEmail(value) : userByUsername(value);
}

export async function updateUser(id: string, patch: Partial<typeof users.$inferInsert>): Promise<UserRow> {
  const db = await getDb();
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function countActiveSuperAdmins(): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE")));
  return Number(n);
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export async function createToken(userId: string, purpose: TokenPurpose, hours: number): Promise<string> {
  const db = await getDb();
  const { token, hash } = newToken();
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
  await db.insert(authTokens).values({ userId, purpose, tokenHash: hash, expiresAt: new Date(Date.now() + hours * 3600_000) });
  return token;
}

/** Löst ein Token ein (einmalig). */
export async function consumeToken(token: string, purpose: TokenPurpose): Promise<UserRow | null> {
  if (!token || token.length > 200) return null;
  const db = await getDb();
  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(token)), eq(authTokens.purpose, purpose), gt(authTokens.expiresAt, new Date())))
    .returning();
  if (!row) return null;
  return userById(row.userId);
}

export async function purgeExpiredTokens(): Promise<void> {
  const db = await getDb();
  await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date()));
}

// ---------------------------------------------------------------------------
// Admin-Listen
// ---------------------------------------------------------------------------

async function roundCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const db = await getDb();
  const rows = await db
    .select({ userId: memberData.userId, n: sql<number>`coalesce((select count(*) from jsonb_array_elements(${memberData.data}->'rounds') r where coalesce(r->>'status', 'COMPLETED') <> 'DELETED'), 0)` })
    .from(memberData)
    .where(sql`${memberData.userId} in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  for (const r of rows) out.set(r.userId, Number(r.n));
  return out;
}

export function toAdminRow(u: UserRow, rounds: number): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role as AdminUserRow["role"],
    status: u.status as AdminUserRow["status"],
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastActivityAt: u.lastActivityAt?.toISOString() ?? null,
    rounds,
  };
}

export async function adminRow(u: UserRow): Promise<AdminUserRow> {
  return toAdminRow(u, (await roundCounts([u.id])).get(u.id) ?? 0);
}

export interface UserFilter {
  q?: string;
  role?: string;
  status?: string;
  verified?: string;
  sort?: string;
}

export async function listUsers(filter: UserFilter, page: number, pageSize: number): Promise<Page<AdminUserRow>> {
  const db = await getDb();
  const where: SQL[] = [];
  if (filter.role) where.push(eq(users.role, filter.role));
  if (filter.status) where.push(eq(users.status, filter.status));
  if (filter.verified === "yes") where.push(eq(users.emailVerified, true));
  if (filter.verified === "no") where.push(eq(users.emailVerified, false));
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(users.firstName, like), ilike(users.lastName, like), ilike(users.email, like), ilike(users.username, like), sql`${users.id}::text = ${filter.q}`)!);
  }
  const cond = where.length ? and(...where) : undefined;
  const order =
    filter.sort === "created"
      ? [desc(users.createdAt)]
      : filter.sort === "lastLogin"
        ? [sql`${users.lastLoginAt} desc nulls last`]
        : filter.sort === "lastActivity"
          ? [sql`${users.lastActivityAt} desc nulls last`]
          : filter.sort === "role"
            ? [sql`case ${users.role} when 'SUPER_ADMIN' then 0 when 'ADMIN' then 1 when 'SUPPORT' then 2 else 3 end`, asc(users.lastName)]
            : [asc(users.lastName), asc(users.firstName)];
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(users).where(cond).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(users).where(cond),
  ]);
  const counts = await roundCounts(rows.map((r) => r.id));
  return { items: rows.map((r) => toAdminRow(r, counts.get(r.id) ?? 0)), total: Number(total), page, pageSize };
}

/** Alle Mitglieder-Dokumente mit Konto (für Rundenlisten im Admin-Bereich). */
export async function allMemberDocs(userId?: string) {
  const db = await getDb();
  const rows = await db
    .select({ user: users, data: memberData.data, updatedAt: memberData.updatedAt })
    .from(memberData)
    .innerJoin(users, eq(users.id, memberData.userId))
    .where(userId && isUuid(userId) ? eq(users.id, userId) : undefined);
  return rows.map((r) => {
    let doc;
    try {
      doc = normalizeMemberDoc(r.data, r.user.id);
    } catch {
      doc = null;
    }
    return { user: r.user, doc, updatedAt: r.updatedAt };
  });
}

export async function totalRounds(): Promise<number> {
  let n = 0;
  for (const { doc } of await allMemberDocs()) if (doc) n += activeRounds(doc).length;
  return n;
}
