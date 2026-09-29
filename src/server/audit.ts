/**
 * Audit-Log und Fehlerprotokoll der Node-Edition.
 * Einträge: Zeitpunkt, Aktion, Akteur, betroffener Benutzer, Objekt, alter und neuer Wert.
 */
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, errorLog, type AuditRow } from "@/db/schema";
import type { AuditAction } from "@/lib/audit/actions";
import { ADMIN_ACTIONS, MEMBER_ACTIVITY } from "@/lib/audit/actions";
import type { AuditEntry, Page } from "@/lib/api/types";

export interface Actor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AuditData {
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function audit(action: AuditAction, actor: Actor | null, data: AuditData = {}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLog).values({
      action,
      actorId: actor?.id ?? null,
      actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : null,
      userId: data.userId ?? null,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      oldValue: (data.oldValue ?? null) as never,
      newValue: (data.newValue ?? null) as never,
    });
  } catch (error) {
    console.error("Audit-Log konnte nicht geschrieben werden", error);
  }
}

export function toAuditEntry(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    timestamp: r.createdAt.toISOString(),
    action: r.action,
    actorId: r.actorId,
    actorName: r.actorName,
    userId: r.userId,
    entityType: r.entityType,
    entityId: r.entityId,
    oldValue: r.oldValue,
    newValue: r.newValue,
  };
}

export interface AuditFilter {
  action?: string;
  group?: "admin" | "member" | "";
  actorId?: string;
  userId?: string;
  q?: string;
  from?: string;
  to?: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function auditEntries(filter: AuditFilter, page: number, pageSize: number): Promise<Page<AuditEntry>> {
  const db = await getDb();
  const where: SQL[] = [];
  if (filter.action) where.push(eq(auditLog.action, filter.action));
  if (filter.group === "admin") where.push(inArray(auditLog.action, [...ADMIN_ACTIONS]));
  if (filter.group === "member") where.push(inArray(auditLog.action, [...MEMBER_ACTIVITY]));
  if (filter.actorId && UUID.test(filter.actorId)) where.push(eq(auditLog.actorId, filter.actorId));
  if (filter.userId && UUID.test(filter.userId)) where.push(eq(auditLog.userId, filter.userId));
  if (filter.from && /^\d{4}-\d{2}-\d{2}$/.test(filter.from)) where.push(gte(auditLog.createdAt, new Date(`${filter.from}T00:00:00Z`)));
  if (filter.to && /^\d{4}-\d{2}-\d{2}$/.test(filter.to)) where.push(lte(auditLog.createdAt, new Date(`${filter.to}T23:59:59Z`)));
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(auditLog.actorName, like), ilike(auditLog.entityId, like), ilike(auditLog.action, like), sql`${auditLog.newValue}::text ilike ${like}`, sql`${auditLog.oldValue}::text ilike ${like}`)!);
  }
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(auditLog).where(cond).orderBy(desc(auditLog.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(auditLog).where(cond),
  ]);
  return { items: rows.map(toAuditEntry), total: Number(total), page, pageSize };
}

export async function logServerError(message: string): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(errorLog).values({ message: message.slice(0, 500) });
  } catch {
    // Protokollierung darf nie selbst einen Fehler auslösen
  }
}
