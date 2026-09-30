/**
 * Datenverträge zwischen Frontend und Backend (beide Editionen liefern exakt diese Strukturen).
 * Das Frontend zeigt nur an – berechnet wird im Backend bzw. in der Service-Schicht (src/lib/member).
 */
import type { Permission, Role, UserStatus } from "@/lib/auth/permissions";
import type { CommunityFlags, CommunitySettings, MyRanking, RoundModeration, RoundVisibility } from "@/lib/community/types";
import type { HoleStat, RoundStatistics } from "@/lib/stats/types";
import type { MemberRound } from "@/lib/member/round";
import type { CourseSummary } from "@/lib/courses/summary";
import type { CourseDto } from "@/lib/courses/types";
import type {
  GameFormat,
  Gender,
  HandicapRevision,
  HoleInfo,
  HoleScore,
  IsoDate,
  NineSide,
  PccValue,
  PlayerProfile,
  ResultStatus,
  Round,
  RoundCategory,
  RoundResult,
} from "@/lib/whs/types";

// ---------------------------------------------------------------------------
// Konto
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  permissions: Permission[];
  emailVerified: boolean;
  mustChangePassword: boolean;
  /** Onboarding (Start-HCPI, Heimatplatz) abgeschlossen. */
  onboarded: boolean;
}

export interface PublicSettings {
  siteName: string;
  registrationOpen: boolean;
  emailVerificationRequired: boolean;
  /** Impressum/Datenschutz als Text (Absätze durch Leerzeilen) – wird nie als HTML ausgegeben. */
  imprintText: string | null;
  privacyText: string | null;
  contactEmail: string | null;
  /** Community-Schalter des Betreibers (nicht geheim; steuern Navigation und Anzeige) */
  community: CommunityFlags;
}

// ---------------------------------------------------------------------------
// Runden-Eingabe (Wizard → Backend)
// ---------------------------------------------------------------------------

export type RoundCourseInput =
  | {
      kind: "DB";
      courseId: string;
      layoutId: string;
      teeColor: string;
      gender: Gender;
      /** Nur bei ungeprüftem Rating: vom Spieler mit der Scorekarte bestätigte Werte (müssen exakt übereinstimmen). */
      confirmRating?: ConfirmedRating;
    }
  | {
      kind: "MANUAL";
      courseName: string;
      city?: string | null;
      country?: string;
      teeColor?: string | null;
      gender: Gender;
      par: number;
      courseRating: number;
      slopeRating: number;
    };

export type RoundScoreInput =
  | { mode: "GBE"; adjustedGrossScore: number }
  | { mode: "HOLES"; strokes: HoleScore[] }
  | { mode: "STABLEFORD_TOTAL"; points: number; playingHandicap?: number | null }
  | { mode: "STABLEFORD_HOLES"; points: (number | null)[]; playingHandicap?: number | null }
  | { mode: "DIFFERENTIAL"; scoreDifferential: number; officialHandicapIndexAfter?: number | null };

/** Werte eines ungeprüften Ratings, die der Spieler mit seiner Scorekarte verglichen und bestätigt hat. */
export interface ConfirmedRating {
  par: number;
  courseRating: number;
  slopeRating: number;
}

export interface RoundInput {
  date: IsoDate;
  title?: string;
  category: RoundCategory;
  format?: GameFormat;
  resultStatus?: ResultStatus;
  course: RoundCourseInput | null;
  holes: 9 | 18;
  /** 9 Loch auf einem 18-Loch-Platz: gespielte Hälfte. */
  nine?: NineSide | null;
  score: RoundScoreInput;
  /** Nur bei manueller Platzangabe mit Scorekarte: Par und Handicap je Loch. */
  holeData?: HoleInfo[] | null;
  pcc?: PccValue;
  notes?: string;
  /** Wer darf die Runde sehen? (Standard: privat) */
  visibility?: RoundVisibility;
  /**
   * Optionale Lochstatistik (Putts, GIR, FIR, Bunker, Up & Down, Strafschläge, Notiz). Reine Spielleistung –
   * ändert weder GBE noch Score Differential. Bei Eingabe „Loch für Loch“ gelten die WHS-Schläge.
   */
  holeStats?: HoleStat[] | null;
}

export interface DraftRound {
  id: string;
  updatedAt: string;
  /** Unvollständige Eingabe des Wizards (wird nicht berechnet). */
  input: Record<string, unknown> & { step?: string };
  label: string;
}

// ---------------------------------------------------------------------------
// Handicap
// ---------------------------------------------------------------------------

export interface RoundListItem {
  id: string;
  date: IsoDate;
  title: string;
  courseName: string;
  courseId: string | null;
  layoutName: string | null;
  teeColor: string | null;
  gender: Gender | null;
  holes: 9 | 18;
  holesPlayed: number | null;
  category: RoundCategory;
  adjustedGrossScore: number | null;
  scoreDifferential: number | null;
  /** Score Differential nach rückwirkender ESR (maßgeblich im Scoring Record). */
  adjustedScoreDifferential: number | null;
  handicapIndexBefore: number;
  handicapIndexAfter: number | null;
  relevant: boolean;
  /** zählt aktuell zu den besten Ergebnissen */
  counted: boolean;
  inWindow: boolean;
  esr: number;
  /** Kurzer Grund, warum die Runde nicht zählt (verständlich formuliert). */
  note: string | null;
}

export interface HistoryPointDto {
  date: IsoDate;
  value: number;
  calculated: number | null;
  roundId: string | null;
  courseName: string | null;
  scoreDifferential: number | null;
}

export interface HcpResult {
  /** INITIAL = nur Ausgangshandicap (noch keine berechenbaren Ergebnisse). */
  status: "INITIAL" | "ACTIVE";
  currentHandicapIndex: number;
  calculatedHandicapIndex: number | null;
  startHandicapIndex: number;
  lowHandicapIndex: number | null;
  /** Ergebnisse im Scoring Record (max. 20). */
  scoringRecordCount: number;
  totalRelevantRounds: number;
  usedCount: number | null;
  adjustment: number | null;
  averageUnrounded: number | null;
  /** z. B. „Durchschnitt der besten 4 von 12 Score Differentials“ */
  calculationLabel: string;
  countedScoreDifferentials: { roundId: string; date: IsoDate; courseName: string; value: number; esr: number }[];
  /** Abweichung aktueller ↔ berechneter HCPI (Soft/Hard Cap, 26,5-Bremse …) */
  deviation: { reasons: string[]; text: string } | null;
  changeSinceLastRound: { before: number; after: number; delta: number; date: IsoDate } | null;
  brake265Active: boolean;
  history: HistoryPointDto[];
  /** Ergebnisse im Scoring Record, neueste zuerst (max. 20) */
  record: RoundListItem[];
  lastRound: RoundListItem | null;
  /** Rechenweg der letzten Revision (für „Warum?“) */
  latestRevision: HandicapRevision | null;
  asOf: IsoDate | null;
}

export interface DashboardData {
  user: { firstName: string };
  hcp: HcpResult;
  roundsCount: number;
  drafts: DraftRound[];
  /** Letzte Runde mit Lochstatistik (höchstens einige Kennzahlen auf der Startseite) */
  lastStats: { roundId: string; date: IsoDate; courseName: string; holes: 9 | 18; stats: RoundStatistics } | null;
  /** Ranking-Position (nur wenn Community aktiv) – vom Backend ergänzt */
  ranking?: MyRanking | null;
}

export interface RoundDetail {
  item: RoundListItem;
  round: Round;
  /** Eingabe zum Bearbeiten im Wizard */
  input: RoundInput;
  result: RoundResult;
  /** z. B. „Beste 4 von 12“ zum Zeitpunkt der Runde */
  recordLabelAtTime: string;
  visibility: RoundVisibility;
  /** Lochstatistik und daraus berechnete Werte (Spielleistung) */
  holeStats: HoleStat[] | null;
  stats: RoundStatistics | null;
  insights: string[];
  /** Schläge je Loch stammen aus der WHS-Eingabe und sind in der Statistik nicht änderbar */
  scoresLocked: boolean;
  /** Admin hat die Runde für andere Mitglieder verborgen */
  moderated: boolean;
}

export interface RoundPreview {
  item: RoundListItem;
  result: RoundResult;
  hcpBefore: number;
  hcpAfter: number;
  changed: boolean;
  /** Hinweise der Berechnung (verständlich formuliert). */
  issues: string[];
  /** true: Runde kann so nicht gespeichert werden (z. B. GBE über dem Netto-Doppelbogey-Maximum). */
  blocking: boolean;
  /** Hinweise zur Lochstatistik (ungewöhnliche, aber mögliche Angaben) */
  statsWarnings: string[];
  /** Statistik der Runde (falls Lochdaten erfasst) */
  stats: RoundStatistics | null;
}

export interface RoundSaveResult extends RoundPreview {
  roundId: string;
}

// ---------------------------------------------------------------------------
// Golfplätze
// ---------------------------------------------------------------------------

export interface CourseListResponse {
  total: number;
  totalCourses: number;
  results: CourseSummary[];
}

export interface MemberCourseLists {
  favorites: CourseSummary[];
  recent: CourseSummary[];
  home: CourseSummary | null;
}

export type RoundEntryMode = "ASK" | "QUICK" | "DETAILED";

export interface MemberPreferences {
  favorites: string[];
  homeCourseId: string | null;
  /** Rundeneingabe auf dem Smartphone: Standard „Schnell“, „Detailliert“ oder bei jeder Runde fragen */
  roundEntryMode: RoundEntryMode;
}

export interface MemberProfileData {
  user: SessionUser;
  profile: PlayerProfile;
  preferences: MemberPreferences;
}

export type CourseDetailDto = CourseDto;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string | null;
  username: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  rounds: number;
}

export interface AdminUserDetail extends AdminUserRow {
  mustChangePassword: boolean;
  /** Initial Handicap (keine Runden) oder aktiver WHS Scoring Record */
  hcpState: "INITIAL" | "ACTIVE";
  hcp: HcpResult;
  rounds: number;
  lastRoundDate: IsoDate | null;
  profile: PlayerProfile;
  allRounds: RoundListItem[];
  pendingEmail?: string | null;
  /** Darf der angemeldete Admin dieses Konto bearbeiten / die Rolle ändern? (serverseitig ermittelt) */
  canManage?: boolean;
  canAssignRole?: boolean;
  /** Community- und Privatsphäre-Status */
  community: {
    settings: CommunitySettings;
    displayName: string;
    publicRounds: number;
    hiddenRounds: number;
    detailedRounds: number;
  };
}

/** Lesende Benutzeransicht für Support (wird im Audit-Log protokolliert). */
export interface AdminImpersonation {
  user: AdminUserRow;
  dashboard: DashboardData;
  rounds: RoundListItem[];
}

export interface AdminRoundRow {
  userId: string;
  userName: string;
  roundId: string;
  date: IsoDate;
  courseName: string;
  holes: 9 | 18;
  status: "COMPLETED" | "DELETED";
  scoreDifferential: number | null;
  adjustedGrossScore: number | null;
  handicapIndexAfter: number | null;
  engine: string | null;
  updatedAt: string;
}

export interface AdminRoundDetail {
  user: { id: string; name: string; email: string | null };
  /** Runde inkl. Lochstatistik, Sichtbarkeit und Moderation */
  round: MemberRound;
  /** Neu berechnet mit der aktuellen Engine */
  result: RoundResult | null;
  item: RoundListItem | null;
  engine: string;
  computedAt: string;
  stats: RoundStatistics | null;
  visibility: RoundVisibility;
  moderation: RoundModeration | null;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminStats {
  users: number;
  activeUsers: number;
  unverifiedUsers: number;
  admins: number;
  rounds: number;
  courses: number;
  ratings: number;
  verifiedRatings: number;
  dataQualityPercent: number;
  lastCourseUpdate: string | null;
  recentActions: AuditEntry[];
  recentActivity: AuditEntry[];
}

export type HealthState = "OK" | "WARNING" | "ERROR";

export interface SystemStatus {
  checks: { key: string; label: string; state: HealthState; detail: string }[];
  engine: { ruleSet: string; version: string; build: string | null };
  errorsLast24h: number;
  recentErrors: { timestamp: string; message: string }[];
  storage: string;
  mail: { mode: string; recent: { timestamp: string; to: string; subject: string; status: string }[] };
}

export interface RulesInfo {
  active: { country: string; version: string; label: string };
  available: { country: string; version: string; label: string }[];
  engineVersion: string;
  build: string | null;
  parameters: { group: string; items: { label: string; value: string }[] }[];
}

export interface AdminSearchResult {
  users: AdminUserRow[];
  courses: CourseSummary[];
  rounds: AdminRoundRow[];
}

export interface AdminSettings extends PublicSettings {
  mailFrom: string | null;
  /** Öffentliche Adresse für Links in E-Mails */
  siteUrl: string;
  mail: {
    mode: string;
    host: string;
    port: number;
    secure: string;
    user: string;
    hasPassword: boolean;
    /** false: in der Node-Edition per Umgebungsvariablen festgelegt */
    editable: boolean;
  };
}

export interface AdminSettingsInput extends Partial<Omit<AdminSettings, "mail">> {
  mail?: { mode?: string; host?: string; port?: number; secure?: string; user?: string; pass?: string };
}

export interface AdminUserInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** leer: Einladung per E-Mail */
  password?: string;
}

export interface AdminUserPatch {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: Role;
  status?: UserStatus;
  emailVerified?: true;
}
