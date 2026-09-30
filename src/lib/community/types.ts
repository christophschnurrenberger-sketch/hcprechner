/**
 * Community (Ranking, Mitglieder, öffentliche Runden) – Datenverträge.
 *
 * Grundsatz: Andere Mitglieder erhalten ausschließlich freigegebene Daten. Diese Strukturen enthalten nie
 * E-Mail, Adresse, Geburtsdatum, interne Benutzer-ID oder Admin-Informationen. Öffentliche Verweise laufen
 * über eine zufällige `publicId`.
 */
import type { PerformanceSummary, RoundStatistics } from "@/lib/stats/types";
import type { IsoDate } from "@/lib/whs/types";

export type RoundVisibility = "PRIVATE" | "MEMBERS_BASIC" | "MEMBERS_FULL";
export const ROUND_VISIBILITIES: readonly RoundVisibility[] = ["PRIVATE", "MEMBERS_BASIC", "MEMBERS_FULL"];

/** Sichtbarkeitsstufe einer Runde für andere Mitglieder (nach Anwendung aller Einstellungen). */
export type PublicLevel = "BASIC" | "FULL";

/** Community- und Privatsphäre-Einstellungen eines Mitglieds (im Mitglieder-Dokument). */
export interface CommunitySettings {
  /** Öffentlicher Anzeigename, z. B. „Christoph S.“; null = aus dem Konto abgeleitet */
  displayName: string | null;
  rankingVisible: boolean;
  profileVisible: boolean;
  roundsVisible: boolean;
  statsVisible: boolean;
  notesVisible: boolean;
  /** Vorauswahl „Wer darf diese Runde sehen?“ im Runden-Assistenten */
  defaultRoundVisibility: RoundVisibility;
  /** Zufällige öffentliche Kennung (vom Server vergeben) */
  publicId: string | null;
  /** Profilbild vorhanden (Version für Cache), vom Server gesetzt */
  avatarVersion: number | null;
  updatedAt: string | null;
}

/** Vom Mitglied änderbare Einstellungen. */
export type CommunitySettingsInput = Partial<Pick<CommunitySettings, "displayName" | "rankingVisible" | "profileVisible" | "roundsVisible" | "statsVisible" | "notesVisible" | "defaultRoundVisibility">>;

/** Schalter des Betreibers (Admin → Einstellungen). */
export interface CommunityFlags {
  communityEnabled: boolean;
  rankingEnabled: boolean;
  publicRoundsEnabled: boolean;
  statsSharingEnabled: boolean;
  activityFeedEnabled: boolean;
}

/** Vom Backend berechnete Kennzahlen eines Mitglieds (Grundlage für Ranking und Profil). */
export interface MemberSummary {
  handicapIndex: number;
  lowHandicapIndex: number | null;
  roundsCount: number;
  lastRoundDate: IsoDate | null;
  /** Letzte 20 Runden mit Lochstatistik; null = keine */
  performance: PerformanceSummary | null;
  computedAt: string;
}

/** Moderation einer Runde durch den Admin. */
export interface RoundModeration {
  hidden: boolean;
  reason: string | null;
  at: string;
  by: string | null;
}

// ---------------------------------------------------------------------------
// Materialisierte Community-Daten (Backend-intern)
// ---------------------------------------------------------------------------

export interface CommunityProfileRecord {
  /** intern – wird nie an andere Mitglieder ausgeliefert */
  userId: string;
  publicId: string;
  displayName: string;
  initials: string;
  avatarVersion: number | null;
  rankingVisible: boolean;
  profileVisible: boolean;
  roundsVisible: boolean;
  statsVisible: boolean;
  notesVisible: boolean;
  handicapIndex: number | null;
  roundsCount: number;
  publicRoundsCount: number;
  homeCourseId: string | null;
  homeCourseName: string | null;
  region: string | null;
  /** nur gespeichert, wenn Statistiken freigegeben sind */
  performance: PerformanceSummary | null;
  lastActivityAt: string | null;
  updatedAt: string;
}

export interface PublicHole {
  number: number;
  par: number | null;
  strokeIndex: number | null;
  score: number | null;
  putts: number | null;
  fir: boolean | null;
  gir: boolean | null;
  bunkerVisit: boolean | null;
  bunkerShots: number | null;
  sandSave: boolean | null;
  upAndDown: boolean | null;
  penaltyStrokes: number | null;
  /** nur bei freigegebenen Notizen */
  note: string | null;
}

export interface PublicRoundRecord {
  userId: string;
  publicId: string;
  roundId: string;
  level: PublicLevel;
  date: IsoDate;
  courseId: string | null;
  courseName: string;
  layoutName: string | null;
  teeColor: string | null;
  holes: 9 | 18;
  nine: "FRONT" | "BACK" | null;
  par: number | null;
  grossScore: number | null;
  adjustedGrossScore: number | null;
  scoreDifferential: number | null;
  handicapIndexBefore: number | null;
  handicapIndexAfter: number | null;
  /** Zeitpunkt der Erfassung (Reihenfolge der Aktivität) */
  createdAt: string;
  updatedAt: string;
  /** nur Stufe FULL */
  stats: RoundStatistics | null;
  holeStats: PublicHole[] | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// DTOs für andere Mitglieder
// ---------------------------------------------------------------------------

export interface PublicMemberRef {
  publicId: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  /** Profil darf geöffnet werden */
  profileVisible: boolean;
}

export type RankingScope = "ALL" | "HOME" | "REGION";

export interface RankingEntry extends PublicMemberRef {
  position: number;
  handicapIndex: number;
  homeCourseName: string | null;
  roundsCount: number;
  /** Plätze gegenüber dem letzten Ranking-Stand (+ = verbessert); null = kein Vergleich */
  trend: number | null;
  isMe: boolean;
}

export interface MyRanking {
  /** nimmt am Ranking teil */
  participating: boolean;
  /** Position (bei Nicht-Teilnahme: nur für dich berechnet, „wärst du im Ranking“) */
  position: number | null;
  handicapIndex: number;
  trend: number | null;
  trendSince: IsoDate | null;
  total: number;
}

export interface RankingResponse {
  scope: RankingScope;
  scopeLabel: string | null;
  page: number;
  pageSize: number;
  total: number;
  items: RankingEntry[];
  top: RankingEntry[];
  me: MyRanking | null;
  /** Filter, die für dich möglich sind (Heimatclub/Region nur mit Heimatplatz) */
  scopes: { scope: RankingScope; label: string }[];
  previousSnapshotDate: IsoDate | null;
}

export interface MemberListItem extends PublicMemberRef {
  handicapIndex: number | null;
  homeCourseName: string | null;
  roundsCount: number;
  lastActivityAt: string | null;
  isMe: boolean;
}

export interface PublicRoundSummary {
  member: PublicMemberRef;
  roundId: string;
  level: PublicLevel;
  date: IsoDate;
  courseName: string;
  holes: 9 | 18;
  grossScore: number | null;
  adjustedGrossScore: number | null;
  scoreDifferential: number | null;
  handicapIndexAfter: number | null;
  createdAt: string;
}

export interface PublicRoundView extends PublicRoundSummary {
  courseId: string | null;
  layoutName: string | null;
  teeColor: string | null;
  nine: "FRONT" | "BACK" | null;
  par: number | null;
  handicapIndexBefore: number | null;
  stats: RoundStatistics | null;
  holeStats: PublicHole[] | null;
  insights: string[];
  notes: string | null;
  isMine: boolean;
}

export interface PublicProfileView extends PublicMemberRef {
  handicapIndex: number | null;
  homeCourseName: string | null;
  roundsCount: number;
  publicRoundsCount: number;
  rankingPosition: number | null;
  performance: PerformanceSummary | null;
  isMe: boolean;
}

export interface ActivityItem {
  type: "ROUND";
  round: PublicRoundSummary;
}

export interface CommunityPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Eigene Community-Ansicht (Profil → Community & Privatsphäre). */
export interface MyCommunity {
  settings: CommunitySettings;
  effectiveDisplayName: string;
  avatarUrl: string | null;
  flags: CommunityFlags;
}

// ---------------------------------------------------------------------------
// Admin-Bereich (nur mit community.read / community.moderate)
// ---------------------------------------------------------------------------

export interface AdminCommunityOverview {
  flags: CommunityFlags;
  members: number;
  profilesVisible: number;
  rankingOptIn: number;
  roundsVisibleUsers: number;
  statsVisibleUsers: number;
  publicRounds: number;
  publicRoundsFull: number;
  hiddenRounds: number;
  /** aggregierte Spielleistung aller Runden mit Lochstatistik (keine Einzelwerte) */
  performance: import("@/lib/stats/aggregate").AggregatePerformance;
  dataQuality: { roundsWithoutStats: number; incompleteStats: number; withWarnings: number };
  lastSnapshotDate: IsoDate | null;
}

export interface AdminRankingRow {
  userId: string;
  name: string;
  displayName: string;
  publicId: string | null;
  position: number | null;
  handicapIndex: number | null;
  rankingVisible: boolean;
  profileVisible: boolean;
  roundsVisible: boolean;
  statsVisible: boolean;
  status: string;
  publicRoundsCount: number;
}

export interface AdminPublicRoundRow {
  userId: string;
  userName: string;
  displayName: string;
  roundId: string;
  date: IsoDate;
  courseName: string;
  holes: 9 | 18;
  visibility: RoundVisibility;
  hidden: boolean;
  detailed: boolean;
  /** tatsächlich sichtbare Stufe (null = nicht sichtbar, z. B. Freigaben aus) */
  level: PublicLevel | null;
}

/**
 * Moderation: HIDE = für andere verbergen („deaktivieren“), UNHIDE = wieder freigeben, MAKE_PRIVATE = aus der
 * Community entfernen (Sichtbarkeit „Nur ich“), REMOVE_NOTES = Notizen löschen. Runden werden durch die
 * Moderation nie gelöscht – das Handicap des Mitglieds bleibt unverändert.
 */
export type ModerationAction = "HIDE" | "UNHIDE" | "MAKE_PRIVATE" | "REMOVE_NOTES";
export const MODERATION_ACTIONS: readonly ModerationAction[] = ["HIDE", "UNHIDE", "MAKE_PRIVATE", "REMOVE_NOTES"];
