/**
 * Optionale Synchronisation: anonymes Profil, erreichbar nur mit einem geheimen
 * Schlüssel (nur dessen SHA-256-Hash wird gespeichert). Keine E-Mail, kein Name nötig.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { playerProfiles, rounds as roundsTable } from "@/db/schema";
import { exportSchema } from "@/lib/store/schema";
import type { PlayerProfile, Round } from "@/lib/whs/types";

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export class SyncAuthError extends Error {}

function toRow(profileId: string, r: Round) {
  return {
    id: r.id,
    profileId,
    date: r.date,
    sequence: r.sequence,
    title: r.title,
    category: r.category,
    format: r.format,
    resultStatus: r.resultStatus,
    holes: r.holes,
    holesPlayed: r.holesPlayed ?? null,
    courseId: null,
    layoutId: null,
    ratingSetId: null,
    pcc: r.pcc,
    courseSnapshot: r.course,
    ratingSnapshot: r.rating,
    nineHoleRatings: r.nineHoleRatings ?? null,
    holeData: r.holeData ?? null,
    entry: r.entry,
    notes: r.notes ?? null,
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

function fromRow(row: typeof roundsTable.$inferSelect): Round {
  return {
    id: row.id,
    date: row.date,
    sequence: row.sequence,
    title: row.title,
    category: row.category as Round["category"],
    format: row.format as Round["format"],
    resultStatus: row.resultStatus as Round["resultStatus"],
    holes: row.holes as 9 | 18,
    holesPlayed: row.holesPlayed,
    course: row.courseSnapshot as Round["course"],
    rating: row.ratingSnapshot as Round["rating"],
    nineHoleRatings: (row.nineHoleRatings ?? undefined) as Round["nineHoleRatings"],
    holeData: (row.holeData ?? undefined) as Round["holeData"],
    pcc: row.pcc as Round["pcc"],
    entry: row.entry as Round["entry"],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parsePayload(body: unknown): { profile: PlayerProfile; rounds: Round[] } {
  const parsed = exportSchema.parse({ version: 1, ...(body as object) });
  return { profile: parsed.profile as PlayerProfile, rounds: parsed.rounds as Round[] };
}

async function authorize(profileId: string, key: string) {
  const db = await getDb();
  const [row] = await db.select().from(playerProfiles).where(eq(playerProfiles.id, profileId));
  if (!row) throw new SyncAuthError("Profil nicht gefunden");
  const a = Buffer.from(row.keyHash, "hex");
  const b = Buffer.from(hash(key), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new SyncAuthError("Schlüssel ungültig");
  return row;
}

async function replaceRounds(profileId: string, list: Round[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(roundsTable).where(eq(roundsTable.profileId, profileId));
    if (list.length > 0) await tx.insert(roundsTable).values(list.map((r) => toRow(profileId, r)));
  });
}

export async function createSyncProfile(data: { profile: PlayerProfile; rounds: Round[] }) {
  const db = await getDb();
  const id = randomUUID();
  const key = randomBytes(24).toString("base64url");
  await db.insert(playerProfiles).values({ id, keyHash: hash(key), profile: data.profile });
  await replaceRounds(id, data.rounds);
  return { profileId: id, key };
}

export async function pushSyncProfile(profileId: string, key: string, data: { profile: PlayerProfile; rounds: Round[] }) {
  await authorize(profileId, key);
  const db = await getDb();
  await db.update(playerProfiles).set({ profile: data.profile, updatedAt: new Date() }).where(eq(playerProfiles.id, profileId));
  await replaceRounds(profileId, data.rounds);
  return { updatedAt: new Date().toISOString() };
}

export async function pullSyncProfile(profileId: string, key: string) {
  const row = await authorize(profileId, key);
  const db = await getDb();
  const list = await db.select().from(roundsTable).where(eq(roundsTable.profileId, profileId));
  return { profile: row.profile as PlayerProfile, rounds: list.map(fromRow), updatedAt: row.updatedAt.toISOString() };
}

export async function deleteSyncProfile(profileId: string, key: string) {
  await authorize(profileId, key);
  const db = await getDb();
  await db.delete(playerProfiles).where(eq(playerProfiles.id, profileId));
}
