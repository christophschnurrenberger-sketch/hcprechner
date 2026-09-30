/**
 * Mitglieder-Dokument ↔ Community und Golfstatistik (rein funktional, ohne I/O).
 * Node-Edition: auf dem Server. Webspace-Edition: im API-Adapter; PHP prüft und speichert.
 */
import { apiError } from "@/lib/api/errors";
import { holesFor } from "@/lib/courses/ratingSelection";
import { COMMUNITY_POLICY, normalizeSettings, sanitizeDisplayName } from "@/lib/community/policy";
import type { CommunitySettings, CommunitySettingsInput, MemberSummary, RoundVisibility } from "@/lib/community/types";
import { ROUND_VISIBILITIES } from "@/lib/community/types";
import { performanceReport, summarize, type StatRound } from "@/lib/stats/aggregate";
import { holeNumbersFor, validateHoleStats } from "@/lib/stats/holeStats";
import { hasStatistics, roundStatistics } from "@/lib/stats/roundStatistics";
import type { PerformanceFilter, PerformanceReport, RoundStatistics } from "@/lib/stats/types";
import { todayIso } from "@/lib/whs/dates";
import type { HoleInfo } from "@/lib/whs/types";
import { activeRounds, type MemberDoc } from "./doc";
import { computeHcp, statsOf } from "./hcp";
import type { MemberRound } from "./round";
import { alignHoleStats, checkedHoleStats, parseHoleStats, type CourseLookup } from "./roundInput";

// ---------------------------------------------------------------------------
// Golfstatistik
// ---------------------------------------------------------------------------

export function statRoundsOf(doc: Pick<MemberDoc, "rounds">): StatRound[] {
  return activeRounds(doc).map((r) => ({
    id: r.id,
    date: r.date,
    sequence: r.sequence,
    courseName: r.course.courseName,
    courseId: r.course.courseId ?? null,
    teeColor: r.course.teeColor ?? null,
    holes: r.holes,
    stats: statsOf(r),
  }));
}

export function performanceOf(doc: Pick<MemberDoc, "rounds">, filter: PerformanceFilter = {}, today = todayIso()): PerformanceReport {
  return performanceReport(statRoundsOf(doc), filter, today);
}

/**
 * „Statistiken ergänzen“: Lochdaten einer gespeicherten Runde erfassen oder ändern. Das Handicap bleibt
 * unverändert – Score Differential, GBE und Scoring Record werden hier bewusst nicht neu berechnet.
 * Bei Eingabe „Loch für Loch“ bleiben die Schläge die der WHS-Eingabe.
 */
export async function saveRoundStats(
  doc: MemberDoc,
  roundId: string,
  raw: unknown,
  lookup?: CourseLookup,
  now = new Date().toISOString(),
): Promise<{ doc: MemberDoc; stats: RoundStatistics | null; warnings: string[] }> {
  const round = doc.rounds.find((r) => r.id === roundId && r.status !== "DELETED");
  if (!round) throw apiError("ROUND_NOT_FOUND");
  const numbers = holeNumbersFor(round.holes, round.rating.nine ?? null);
  const strokes = round.entry.mode === "HOLE_BY_HOLE" ? round.entry.holeScores ?? null : null;
  const aligned = alignHoleStats(parseHoleStats(raw), round.holeData ?? (await courseHolesOf(round, lookup)), strokes);
  const holeStats = checkedHoleStats(aligned, numbers);
  const stats = holeStats ? roundStatistics(holeStats) : null;
  const next: MemberRound = { ...round, updatedAt: now, computed: round.computed ? { ...round.computed, stats } : round.computed };
  if (holeStats) next.holeStats = holeStats;
  else delete next.holeStats;
  const warnings = holeStats ? validateHoleStats(holeStats, numbers).warnings.map((w) => w.message) : [];
  return { doc: { ...doc, rounds: doc.rounds.map((r) => (r.id === roundId ? next : r)) }, stats, warnings };
}

/** Par und Handicap je Loch aus den Platzdaten (für Runden ohne gespeicherte Lochdaten, z. B. GBE-Eingabe). */
async function courseHolesOf(round: MemberRound, lookup?: CourseLookup): Promise<HoleInfo[] | null> {
  if (!lookup || !round.course.courseId || !round.course.layoutId) return null;
  const course = await lookup(round.course.courseId);
  const layout = course?.layouts.find((l) => l.id === round.course.layoutId);
  if (!layout) return null;
  const nine = round.holes === 9 && layout.holesCount >= 18 ? round.rating.nine ?? "FRONT" : null;
  return holesFor(layout, { gender: round.course.gender ?? "M", teeColor: round.course.teeColor ?? null, holes: round.holes, nine });
}

export function setRoundVisibility(doc: MemberDoc, roundId: string, visibility: unknown, now = new Date().toISOString()): MemberDoc {
  if (typeof visibility !== "string" || !ROUND_VISIBILITIES.includes(visibility as RoundVisibility)) throw apiError("VALIDATION", "Ungültige Sichtbarkeit.");
  if (!doc.rounds.some((r) => r.id === roundId && r.status !== "DELETED")) throw apiError("ROUND_NOT_FOUND");
  return { ...doc, rounds: doc.rounds.map((r) => (r.id === roundId ? { ...r, visibility: visibility as RoundVisibility, updatedAt: now } : r)) };
}

// ---------------------------------------------------------------------------
// Community-Einstellungen
// ---------------------------------------------------------------------------

/** Vom Mitglied änderbare Einstellungen übernehmen (publicId und Profilbild setzt nur der Server). */
export function updateCommunitySettings(doc: MemberDoc, input: CommunitySettingsInput, now = new Date().toISOString()): MemberDoc {
  const cur = doc.community;
  const next: CommunitySettings = { ...cur };
  if (input.displayName !== undefined) {
    if (input.displayName === null || input.displayName === "") next.displayName = null;
    else {
      const name = sanitizeDisplayName(input.displayName);
      if (!name) throw apiError("VALIDATION", "Anzeigename: 2–40 Zeichen, keine E-Mail-Adresse oder Links.", { displayName: "2–40 Zeichen, keine E-Mail-Adresse oder Links." });
      next.displayName = name;
    }
  }
  for (const key of ["rankingVisible", "profileVisible", "roundsVisible", "statsVisible", "notesVisible"] as const) {
    if (input[key] !== undefined) next[key] = input[key] === true;
  }
  if (input.defaultRoundVisibility !== undefined) {
    if (!ROUND_VISIBILITIES.includes(input.defaultRoundVisibility)) throw apiError("VALIDATION", "Ungültige Sichtbarkeit.");
    next.defaultRoundVisibility = input.defaultRoundVisibility;
  }
  return { ...doc, community: { ...normalizeSettings(next), updatedAt: now } };
}

/** Öffentliche Kennung vergeben (nur serverseitig bzw. von PHP; nie aus einer Anfrage übernommen). */
export function ensurePublicId(doc: MemberDoc, newId: () => string): MemberDoc {
  if (doc.community.publicId) return doc;
  return { ...doc, community: { ...doc.community, publicId: newId() } };
}

/** Kennzahlen für Ranking und Profil – aus dem Scoring Record (Handicap) und getrennt davon der Statistik. */
export function memberSummary(doc: MemberDoc, today = todayIso(), now = new Date().toISOString()): MemberSummary {
  const hcp = computeHcp(doc, today);
  const rounds = activeRounds(doc);
  const withStats = statRoundsOf(doc)
    .filter((r) => hasStatistics(r.stats))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.sequence ?? 0) - (a.sequence ?? 0))
    .slice(0, COMMUNITY_POLICY.profileStatsRounds);
  return {
    handicapIndex: hcp.currentHandicapIndex,
    lowHandicapIndex: hcp.lowHandicapIndex,
    roundsCount: rounds.length,
    lastRoundDate: rounds.map((r) => r.date).sort().at(-1) ?? null,
    performance: withStats.length ? summarize(withStats) : null,
    computedAt: now,
  };
}

/** Zusammenfassung ins Dokument übernehmen (bei jeder Änderung, die HCPI oder Statistik betrifft). */
export function withSummary(doc: MemberDoc, today = todayIso(), now = new Date().toISOString()): MemberDoc {
  return { ...doc, summary: memberSummary(doc, today, now) };
}
