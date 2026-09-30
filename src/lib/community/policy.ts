/**
 * Zentrale Produktentscheidungen der Community. Beide Backends (Node und PHP) setzen genau diese Regeln
 * um; die PHP-Fassung steht in webspace/php/api/_community.php und wird per Paritätstest abgeglichen.
 *
 * - Alles ist Opt-in: Ohne aktive Zustimmung ist ein Mitglied nirgends sichtbar.
 * - Ranking: nur Teilnehmer; Sortierung nach Handicap Index aufsteigend. Gleichstand = gleicher Platz
 *   (Wettkampf-Rang 1, 1, 3). Wer nicht teilnimmt, erscheint nicht – sieht aber für sich, wo er stünde.
 * - Profil: Anzeigename, HCPI, Heimatplatz und Rundenzahl. Runden- und Statistikfreigabe setzen ein
 *   sichtbares Profil voraus.
 * - Runde: PRIVATE / MEMBERS_BASIC / MEMBERS_FULL. Ohne Statistikfreigabe wird FULL zu BASIC.
 *   Notizen nur bei FULL und ausdrücklich freigegebenen Notizen.
 * - Admin-Schalter wirken zusätzlich beim Lesen (z. B. Statistikfreigabe global aus → nur BASIC).
 */
import type { CommunityFlags, CommunitySettings, PublicLevel, RoundModeration, RoundVisibility } from "./types";

export type TieMode = "COMPETITION" | "DENSE";

export const COMMUNITY_POLICY = {
  ranking: {
    /** Sortierung: niedrigster Handicap Index zuerst */
    order: "HANDICAP_INDEX_ASC" as const,
    /** COMPETITION: 1, 1, 3 · DENSE: 1, 1, 2 */
    ties: "COMPETITION" as TieMode,
    pageSize: 25,
    /** Nicht-Teilnehmer sehen ihre hypothetische Position (nur für sich) */
    hiddenUserSeesOwnPosition: true,
  },
  feedPageSize: 20,
  membersPageSize: 24,
  /** Mindestanzahl Runden für aggregierte Community-Werte (keine Rückschlüsse auf Einzelne) */
  minRoundsForAggregates: 5,
  /** Performance-Zusammenfassung im Profil: letzte n Runden mit Statistik */
  profileStatsRounds: 20,
  avatarMaxBytes: 150 * 1024,
} as const;

export const DEFAULT_FLAGS: CommunityFlags = {
  communityEnabled: true,
  rankingEnabled: true,
  publicRoundsEnabled: true,
  statsSharingEnabled: true,
  activityFeedEnabled: true,
};

export function defaultCommunitySettings(): CommunitySettings {
  return {
    displayName: null,
    rankingVisible: false,
    profileVisible: false,
    roundsVisible: false,
    statsVisible: false,
    notesVisible: false,
    defaultRoundVisibility: "PRIVATE",
    publicId: null,
    avatarVersion: null,
    updatedAt: null,
  };
}

/** Abhängigkeiten der Schalter: Runden, Statistik und Notizen nur mit sichtbarem Profil (bzw. Runden). */
export function normalizeSettings(s: CommunitySettings): CommunitySettings {
  const profileVisible = s.profileVisible;
  const roundsVisible = profileVisible && s.roundsVisible;
  const statsVisible = profileVisible && s.statsVisible;
  const notesVisible = roundsVisible && statsVisible && s.notesVisible;
  return { ...s, roundsVisible, statsVisible, notesVisible };
}

/** „Christoph S.“ aus Vor- und Nachname. */
export function defaultDisplayName(firstName: string, lastName: string): string {
  const first = firstName.trim() || "Mitglied";
  const last = lastName.trim();
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

const DISPLAY_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{1,39}$/u;

/** Prüft einen gewünschten Anzeigenamen; null = ungültig. Keine E-Mail-Adressen oder Links. */
export function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().replace(/\s+/g, " ");
  if (!DISPLAY_NAME.test(v) || /@|https?:|www\./i.test(v)) return null;
  return v;
}

export function effectiveDisplayName(settings: Pick<CommunitySettings, "displayName">, account: { firstName: string; lastName: string }): string {
  return settings.displayName ?? defaultDisplayName(account.firstName, account.lastName);
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
  return letters.join("") || "?";
}

/**
 * Stufe, mit der andere Mitglieder eine Runde sehen – nur nach den Einstellungen des Mitglieds
 * (Admin-Schalter wirken zusätzlich beim Lesen, siehe `levelWithFlags`). null = nicht sichtbar.
 */
export function roundLevel(
  settings: CommunitySettings,
  round: { visibility?: RoundVisibility | null; status?: string | null; moderation?: RoundModeration | null },
): PublicLevel | null {
  const s = normalizeSettings(settings);
  if (!s.roundsVisible) return null;
  if (round.status === "DELETED" || round.moderation?.hidden) return null;
  const v = round.visibility ?? "PRIVATE";
  if (v === "PRIVATE") return null;
  return v === "MEMBERS_FULL" && s.statsVisible ? "FULL" : "BASIC";
}

export function levelWithFlags(level: PublicLevel, flags: CommunityFlags): PublicLevel | null {
  if (!flags.communityEnabled || !flags.publicRoundsEnabled) return null;
  return level === "FULL" && !flags.statsSharingEnabled ? "BASIC" : level;
}

export const VISIBILITY_LABELS: Record<RoundVisibility, { label: string; description: string }> = {
  PRIVATE: { label: "Nur ich", description: "Niemand sonst sieht diese Runde." },
  MEMBERS_BASIC: { label: "Alle Mitglieder – Basisdaten", description: "Datum, Platz, Löcher, Score und Score Differential." },
  MEMBERS_FULL: { label: "Alle Mitglieder – Details", description: "Zusätzlich Scorekarte und Statistik (Putts, GIR, FIR …)." },
};
