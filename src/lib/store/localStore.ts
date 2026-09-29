import { DEFAULT_RULESET_REF } from "@/rules/whs/registry";
import { addDays, todayIso } from "@/lib/whs/dates";
import type { PlayerProfile, Round } from "@/lib/whs/types";
import { exportSchema, type AppSettings, type StoredData } from "./schema";

/**
 * Local Mode: Alle persönlichen Daten (Profil, Runden) bleiben im Browser.
 * Es werden keine personenbezogenen Daten an den Server übertragen, solange
 * die optionale Synchronisation nicht aktiviert ist.
 */
export const STORAGE_KEY = "hcp-rechner-bayern:v1";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultProfile(): PlayerProfile {
  return {
    id: newId(),
    gender: "M",
    startHandicapIndex: 54,
    startDate: null,
    brake265LiftedAt: null,
    ruleSet: { ...DEFAULT_RULESET_REF },
  };
}

export function defaultSettings(): AppSettings {
  return { debugMode: false, theme: "system", sync: null };
}

export function emptyData(): StoredData {
  return { version: 1, profile: defaultProfile(), rounds: [], settings: defaultSettings(), updatedAt: new Date().toISOString() };
}

export function loadData(key = STORAGE_KEY): StoredData {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyData();
    const parsed = exportSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("Gespeicherte Daten konnten nicht gelesen werden", parsed.error.issues.slice(0, 3));
      return emptyData();
    }
    return {
      version: 1,
      profile: parsed.data.profile as PlayerProfile,
      rounds: parsed.data.rounds as Round[],
      settings: { ...defaultSettings(), ...(parsed.data.settings ?? {}) },
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return emptyData();
  }
}

export function saveData(data: StoredData, key = STORAGE_KEY): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Entfernt gespeicherte Daten (z. B. den Zwischenspeicher eines Kontos beim Abmelden). */
export function removeData(key: string): void {
  try {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}:dirty`);
  } catch {
    // Speicher nicht verfügbar
  }
}

/** Anzahl der unter `key` gespeicherten Runden (ohne vollständiges Einlesen der Runden). */
export function countStoredRounds(key = STORAGE_KEY): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { rounds?: unknown };
    return Array.isArray(parsed.rounds) ? parsed.rounds.length : 0;
  } catch {
    return 0;
  }
}

/** Kennzeichen „noch nicht mit dem Server synchronisiert“ für den Zwischenspeicher eines Kontos. */
export function setDirty(key: string, dirty: boolean): void {
  try {
    if (dirty) window.localStorage.setItem(`${key}:dirty`, "1");
    else window.localStorage.removeItem(`${key}:dirty`);
  } catch {
    // Speicher nicht verfügbar
  }
}

export function isDirty(key: string): boolean {
  try {
    return window.localStorage.getItem(`${key}:dirty`) === "1";
  } catch {
    return false;
  }
}

export function toExport(data: StoredData) {
  return {
    app: "hcp-rechner-bayern" as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: data.profile,
    rounds: data.rounds,
    settings: { ...data.settings, sync: null },
  };
}

export function parseImport(json: string): { ok: true; data: StoredData } | { ok: false; error: string } {
  try {
    const parsed = exportSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return { ok: false, error: `Ungültige Datei: ${first?.path.join(".")} – ${first?.message}` };
    }
    return {
      ok: true,
      data: {
        version: 1,
        profile: parsed.data.profile as PlayerProfile,
        rounds: parsed.data.rounds as Round[],
        settings: { ...defaultSettings(), ...(parsed.data.settings ?? {}), sync: null },
        updatedAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, error: "Die Datei ist kein gültiges JSON." };
  }
}

export const EXAMPLE_PREFIX = "beispiel-";

/**
 * Beispiel-Scoring-Record: fiktive Score Differentials ohne Platzdaten
 * (es werden keine Course- oder Slope-Ratings erfunden). Klar als Beispiel markiert.
 */
export function exampleRounds(today = todayIso()): Round[] {
  const values = [33.4, 31.9, 35.2, 30.8, 29.7, 32.6, 28.9, 34.1, 30.2, 27.8, 31.5, 29.1, 33.0, 28.4, 30.9, 27.2, 32.2, 29.6, 26.9, 30.4, 28.1, 25.8];
  const start = addDays(today, -7 * values.length);
  const now = new Date().toISOString();
  return values.map((sd, i) => ({
    id: `${EXAMPLE_PREFIX}${i + 1}`,
    date: addDays(start, i * 7),
    sequence: 0,
    title: `Beispielrunde ${i + 1}`,
    category: i % 4 === 3 ? "RPR" : "TOURNAMENT",
    format: i % 2 === 0 ? "STABLEFORD" : "STROKE",
    resultStatus: "NORMAL",
    holes: 18,
    course: { courseName: "Beispiel (fiktiv, nur Score Differential)", country: "DE" },
    rating: { holes: 18, par: null, courseRating: null, slopeRating: null },
    pcc: 0,
    entry: { mode: "SCORE_DIFFERENTIAL", scoreDifferential: sd },
    notes: "Fiktive Beispieldaten zum Ausprobieren – ohne echte Platzdaten.",
    createdAt: now,
    updatedAt: now,
  }));
}

export function nextSequence(rounds: readonly Round[], date: string, excludeId?: string): number {
  const same = rounds.filter((r) => r.date === date && r.id !== excludeId);
  return same.length === 0 ? 0 : Math.max(...same.map((r) => r.sequence)) + 1;
}
