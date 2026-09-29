/**
 * Mitglieder-Dokumente der Node-Edition (Tabelle member_data). Jede Änderung läuft in einer Transaktion
 * mit Zeilensperre; die Berechnung übernimmt die gemeinsame Service-Schicht (src/lib/member).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { memberData } from "@/db/schema";
import { emptyMemberDoc, normalizeMemberDoc, type MemberDoc } from "@/lib/member/doc";
import type { MemberContext } from "@/lib/member/service";
import { getCourse } from "./courseRepository";

export interface StoredDoc {
  doc: MemberDoc;
  revision: number;
  updatedAt: Date | null;
}

export async function loadMemberDoc(userId: string): Promise<StoredDoc> {
  const db = await getDb();
  const [row] = await db.select().from(memberData).where(eq(memberData.userId, userId));
  if (!row) return { doc: emptyMemberDoc(userId), revision: 0, updatedAt: null };
  return { doc: normalizeMemberDoc(row.data, userId), revision: row.revision, updatedAt: row.updatedAt };
}

export async function createMemberDoc(userId: string, startHandicapIndex = 54): Promise<void> {
  const db = await getDb();
  await db.insert(memberData).values({ userId, data: emptyMemberDoc(userId, startHandicapIndex), revision: 1 }).onConflictDoNothing();
}

/**
 * Ändert das Dokument unter Sperre. `fn` liefert das neue Dokument (oder null = unverändert) und ein Ergebnis.
 */
export async function withMemberDoc<T>(userId: string, fn: (doc: MemberDoc) => Promise<{ doc: MemberDoc | null; result: T }> | { doc: MemberDoc | null; result: T }): Promise<{ result: T; revision: number }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.insert(memberData).values({ userId, data: emptyMemberDoc(userId), revision: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(memberData).where(eq(memberData.userId, userId)).for("update");
    const current = normalizeMemberDoc(row.data, userId);
    const { doc, result } = await fn(current);
    if (!doc) return { result, revision: row.revision };
    const revision = row.revision + 1;
    await tx.update(memberData).set({ data: doc, revision, updatedAt: new Date() }).where(eq(memberData.userId, userId));
    return { result, revision };
  });
}

export const memberContext: MemberContext = {
  courseLookup: (courseId) => getCourse(courseId),
  newId: () => randomUUID(),
};

/**
 * Kontext für Änderungen unter Zeilensperre: Der Golfplatz wird vorher geladen, damit innerhalb der
 * Transaktion keine weitere Datenbankabfrage nötig ist (PGlite hat nur eine Verbindung).
 */
export async function prefetchedContext(rawInput: unknown): Promise<MemberContext> {
  const course = (rawInput as { course?: { kind?: unknown; courseId?: unknown } } | null)?.course;
  const courseId = course?.kind === "DB" && typeof course.courseId === "string" ? course.courseId : null;
  const dto = courseId ? await getCourse(courseId) : null;
  return { courseLookup: (id) => (id === courseId ? dto : null), newId: () => randomUUID() };
}
