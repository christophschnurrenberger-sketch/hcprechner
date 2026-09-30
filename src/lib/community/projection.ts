/**
 * Projektion: Aus dem Mitglieder-Dokument entstehen die für andere Mitglieder freigegebenen Daten
 * (Community-Profil und öffentliche Runden). Nur hier wird entschieden, welche Felder das Dokument
 * verlassen – beide Backends speichern bzw. liefern ausschließlich dieses Ergebnis.
 * PHP-Gegenstück: webspace/php/api/_community.php (Paritätstest tests/community/php-parity.test.ts).
 */
import { roundInsights } from "@/lib/stats/insights";
import type { MemberRound } from "@/lib/member/round";
import type { HoleStat, PerformanceSummary } from "@/lib/stats/types";
import { effectiveDisplayName, initialsOf, levelWithFlags, normalizeSettings, roundLevel } from "./policy";
import type {
  CommunityFlags,
  CommunityProfileRecord,
  CommunitySettings,
  MemberSummary,
  PublicHole,
  PublicLevel,
  PublicMemberRef,
  PublicRoundRecord,
  PublicRoundSummary,
  PublicRoundView,
} from "./types";

/** Runde mit den Erweiterungen des Mitgliederbereichs (Sichtbarkeit, Lochstatistik, Moderation). */
export type CommunityRound = MemberRound;

export interface ProjectionInput {
  userId: string;
  account: { firstName: string; lastName: string };
  settings: CommunitySettings;
  summary: MemberSummary;
  rounds: readonly CommunityRound[];
  home: { id: string; name: string; region: string | null } | null;
  now: string;
}

function publicHole(h: HoleStat, withNotes: boolean): PublicHole {
  return {
    number: h.number,
    par: h.par,
    strokeIndex: h.strokeIndex ?? null,
    score: h.score,
    putts: h.putts,
    fir: h.fir,
    gir: h.gir,
    bunkerVisit: h.bunkerVisit,
    bunkerShots: h.bunkerShots,
    sandSave: h.sandSave,
    upAndDown: h.upAndDown,
    penaltyStrokes: h.penaltyStrokes,
    note: withNotes ? (h.note ?? null) : null,
  };
}

export function publicRoundRecord(userId: string, publicId: string, round: CommunityRound, level: PublicLevel, notesVisible: boolean): PublicRoundRecord {
  const stats = round.computed?.stats ?? null;
  const full = level === "FULL";
  const withNotes = full && notesVisible;
  return {
    userId,
    publicId,
    roundId: round.id,
    level,
    date: round.date,
    courseId: round.course.courseId ?? null,
    courseName: round.course.courseName,
    layoutName: round.course.layoutName ?? null,
    teeColor: round.course.teeColor ?? null,
    holes: round.holes,
    nine: round.rating.nine ?? null,
    par: round.rating.par ?? null,
    grossScore: stats?.grossScore ?? null,
    adjustedGrossScore: round.computed?.adjustedGrossScore ?? null,
    scoreDifferential: round.computed?.scoreDifferential ?? null,
    handicapIndexBefore: round.computed?.handicapIndexBefore ?? null,
    handicapIndexAfter: round.computed?.handicapIndexAfter ?? null,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    stats: full ? stats : null,
    holeStats: full && round.holeStats?.length ? round.holeStats.map((h) => publicHole(h, withNotes)) : null,
    notes: withNotes && round.notes ? round.notes : null,
  };
}

export function projectCommunity(input: ProjectionInput): { profile: CommunityProfileRecord; rounds: PublicRoundRecord[] } {
  const settings = normalizeSettings(input.settings);
  if (!settings.publicId) throw new Error("publicId fehlt");
  const publicId = settings.publicId;
  const displayName = effectiveDisplayName(settings, input.account);
  const rounds: PublicRoundRecord[] = [];
  for (const r of input.rounds) {
    const level = roundLevel(settings, r);
    if (level) rounds.push(publicRoundRecord(input.userId, publicId, r, level, settings.notesVisible));
  }
  const lastPublic = rounds.map((r) => r.createdAt).sort().at(-1) ?? null;
  const performance: PerformanceSummary | null = settings.statsVisible ? input.summary.performance : null;
  return {
    profile: {
      userId: input.userId,
      publicId,
      displayName,
      initials: initialsOf(displayName),
      avatarVersion: settings.avatarVersion,
      rankingVisible: settings.rankingVisible,
      profileVisible: settings.profileVisible,
      roundsVisible: settings.roundsVisible,
      statsVisible: settings.statsVisible,
      notesVisible: settings.notesVisible,
      handicapIndex: input.summary.handicapIndex,
      roundsCount: input.summary.roundsCount,
      publicRoundsCount: rounds.length,
      homeCourseId: input.home?.id ?? null,
      homeCourseName: input.home?.name ?? null,
      region: input.home?.region ?? null,
      performance,
      lastActivityAt: lastPublic ?? settings.updatedAt,
      updatedAt: input.now,
    },
    rounds,
  };
}

// ---------------------------------------------------------------------------
// Lesen (andere Mitglieder) – Admin-Schalter wirken hier
// ---------------------------------------------------------------------------

export function memberRef(p: Pick<CommunityProfileRecord, "publicId" | "displayName" | "initials" | "avatarVersion" | "profileVisible">, avatarUrl: (publicId: string, version: number) => string): PublicMemberRef {
  return {
    publicId: p.publicId,
    displayName: p.displayName,
    initials: p.initials,
    avatarUrl: p.avatarVersion ? avatarUrl(p.publicId, p.avatarVersion) : null,
    profileVisible: p.profileVisible,
  };
}

/** Öffentliche Runde für andere Mitglieder; null = (nicht mehr) sichtbar. */
export function roundSummaryFor(record: PublicRoundRecord, member: PublicMemberRef, flags: CommunityFlags): PublicRoundSummary | null {
  const level = levelWithFlags(record.level, flags);
  if (!level) return null;
  return {
    member,
    roundId: record.roundId,
    level,
    date: record.date,
    courseName: record.courseName,
    holes: record.holes,
    grossScore: record.grossScore,
    adjustedGrossScore: record.adjustedGrossScore,
    scoreDifferential: record.scoreDifferential,
    handicapIndexAfter: record.handicapIndexAfter,
    createdAt: record.createdAt,
  };
}

export function roundViewFor(record: PublicRoundRecord, member: PublicMemberRef, flags: CommunityFlags, isMine: boolean): PublicRoundView | null {
  const summary = roundSummaryFor(record, member, flags);
  if (!summary) return null;
  const full = summary.level === "FULL";
  const stats = full ? record.stats : null;
  return {
    ...summary,
    courseId: record.courseId,
    layoutName: record.layoutName,
    teeColor: record.teeColor,
    nine: record.nine,
    par: record.par,
    handicapIndexBefore: record.handicapIndexBefore,
    stats,
    holeStats: full ? record.holeStats : null,
    insights: stats ? roundInsights(stats, { self: isMine }) : [],
    notes: full ? record.notes : null,
    isMine,
  };
}
