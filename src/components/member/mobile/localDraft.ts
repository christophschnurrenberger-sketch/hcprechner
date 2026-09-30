/**
 * Laufende Runde auf dem Gerät (localStorage): Schutz vor Funklöchern, Browser-Abstürzen und geschlossenen Tabs.
 * Enthält nur die Eingaben der Runde – keine Zugangsdaten, keine Tokens. Schlüssel je Benutzer; nach dem
 * Speichern oder Verwerfen wird der Eintrag gelöscht. Alle Zugriffe sind abgesichert (privater Modus,
 * gesperrter Speicher): Dann arbeitet die Eingabe ohne lokale Sicherung weiter.
 */
import type { RoundInput } from "@/lib/api/types";
import type { EntryMode, FlowPos } from "@/lib/rounds/holeFlow";
import type { WizardState } from "@/components/member/wizard/wizardState";

export interface LocalRoundDraft {
  v: 1;
  userId: string;
  /** zugleich Entwurfs-ID auf dem Server und Kennung für idempotentes Speichern */
  draftId: string;
  state: WizardState;
  mode: EntryMode;
  pos: FlowPos;
  courseName: string | null;
  updatedAt: string;
  /** Runde abgeschlossen, aber noch nicht beim Server angekommen */
  pendingSave: { input: RoundInput; at: string } | null;
}

const PREFIX = "hcp.activeRound.";
const LAST_MODE = "hcp.entryMode.last";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function localDraftKey(userId: string): string {
  return PREFIX + userId;
}

export function readLocalDraftRaw(userId: string): string | null {
  try {
    return storage()?.getItem(PREFIX + userId) ?? null;
  } catch {
    return null;
  }
}

export function parseLocalDraft(raw: string | null, userId: string): LocalRoundDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as LocalRoundDraft;
    return d && d.v === 1 && d.userId === userId && typeof d.draftId === "string" && d.state ? d : null;
  } catch {
    return null;
  }
}

export function loadLocalDraft(userId: string): LocalRoundDraft | null {
  return parseLocalDraft(readLocalDraftRaw(userId), userId);
}

/** false = konnte nicht lokal gesichert werden (Speicher voll/gesperrt). */
export function saveLocalDraft(d: LocalRoundDraft): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(PREFIX + d.userId, JSON.stringify({ ...d, updatedAt: d.updatedAt || new Date().toISOString() }));
    window.dispatchEvent(new Event("hcp-local-draft"));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(userId: string, draftId?: string): void {
  try {
    const s = storage();
    if (!s) return;
    if (draftId) {
      const cur = loadLocalDraft(userId);
      if (cur && cur.draftId !== draftId) return;
    }
    s.removeItem(PREFIX + userId);
    window.dispatchEvent(new Event("hcp-local-draft"));
  } catch {
    /* ohne Speicher nichts zu tun */
  }
}

/** Zuletzt gewählte Erfassungsart (reine Bequemlichkeit auf diesem Gerät). */
export function lastEntryMode(): "QUICK" | "DETAILED" | null {
  try {
    const v = storage()?.getItem(LAST_MODE);
    return v === "QUICK" || v === "DETAILED" ? v : null;
  } catch {
    return null;
  }
}

export function rememberEntryMode(mode: EntryMode): void {
  if (mode === "TOTAL") return;
  try {
    storage()?.setItem(LAST_MODE, mode);
  } catch {
    /* egal */
  }
}
