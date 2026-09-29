/**
 * Daten eines Benutzerkontos (Profil, Runden, Einstellungen) – Umwandlung und Zusammenführung.
 * Die Runden selbst sind unveränderliche Snapshots (inkl. CR/Slope zum Spieltag); hier wird
 * nichts berechnet, nur gespeichert und zusammengeführt.
 */
import { defaultSettings } from "@/lib/store/localStore";
import { exportSchema, type StoredData } from "@/lib/store/schema";
import type { PlayerProfile, Round } from "@/lib/whs/types";

export interface UserDataPayload {
  profile: PlayerProfile;
  rounds: Round[];
  settings?: StoredData["settings"];
}

export interface UserDataResponse {
  data: UserDataPayload | null;
  revision: number;
  updatedAt: string | null;
}

/** Was auf dem Server gespeichert wird (ohne Zugangsdaten der anonymen Synchronisation). */
export function toUserPayload(data: StoredData): UserDataPayload {
  return { profile: data.profile, rounds: data.rounds, settings: { ...data.settings, sync: null } };
}

/** Serverdaten prüfen (gleiches Schema wie der JSON-Import). Wirft bei ungültigen Daten. */
export function fromUserPayload(payload: unknown): StoredData {
  const parsed = exportSchema.parse({ version: 1, ...(payload as object) });
  return {
    version: 1,
    profile: parsed.profile as PlayerProfile,
    rounds: parsed.rounds as Round[],
    settings: { ...defaultSettings(), ...(parsed.settings ?? {}), sync: null },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Führt lokale Änderungen und den Serverstand zusammen (z. B. wenn auf zwei Geräten
 * gleichzeitig Runden erfasst wurden): Runden werden über ihre ID vereinigt, bei gleicher
 * ID gewinnt die zuletzt geänderte Fassung. Profil und Einstellungen stammen aus `preferred`.
 */
export function mergeUserData(preferred: StoredData, other: StoredData): StoredData {
  const byId = new Map<string, Round>();
  for (const r of other.rounds) byId.set(r.id, r);
  for (const r of preferred.rounds) {
    const existing = byId.get(r.id);
    if (!existing || r.updatedAt >= existing.updatedAt) byId.set(r.id, r);
  }
  const rounds = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);
  return { ...preferred, rounds, updatedAt: new Date().toISOString() };
}

/** Speicherschlüssel des Browser-Zwischenspeichers je Benutzer (anonyme Daten bleiben getrennt). */
export function userStorageKey(base: string, userId: string): string {
  return `${base}:user:${userId}`;
}
