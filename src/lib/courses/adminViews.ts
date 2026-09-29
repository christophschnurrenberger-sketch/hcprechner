/** Aufbereitete, serialisierbare Daten für die Admin-Ansichten (beide Editionen). */
import { findDuplicates, type DuplicateReason } from "./duplicates";
import { courseHasVerifiedRating } from "./ratingSelection";
import type { CourseDto } from "./types";

export interface AdminCourseRow {
  id: string;
  name: string;
  officialName: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  facilityType: string;
  layouts: number;
  ratings: number;
  verifiedRatings: number;
  hasVerifiedRating: boolean;
  active: boolean;
  verified: boolean;
}

export function toAdminCourseRows(courses: readonly CourseDto[]): AdminCourseRow[] {
  return courses.map((c) => {
    const sets = c.layouts.flatMap((l) => l.ratingSets.filter((s) => s.active));
    return {
      id: c.id,
      name: c.name,
      officialName: c.officialName,
      city: c.city,
      postalCode: c.postalCode,
      region: c.region,
      facilityType: c.facilityType,
      layouts: c.layouts.length,
      ratings: sets.length,
      verifiedRatings: sets.filter((s) => s.verified).length,
      hasVerifiedRating: courseHasVerifiedRating(c),
      active: c.active,
      verified: c.verified,
    };
  });
}

export interface DuplicateCourseInfo {
  id: string;
  name: string;
  city: string | null;
  layouts: number;
}

export interface DuplicateView {
  a: DuplicateCourseInfo;
  b: DuplicateCourseInfo;
  score: number;
  reasons: DuplicateReason[];
}

/** Duplikat-Verdachtsfälle unter den aktiven Anlagen. */
export function toDuplicateViews(courses: readonly CourseDto[]): DuplicateView[] {
  const active = courses.filter((c) => c.active);
  const byId = new Map(active.map((c) => [c.id, c]));
  const info = (c: CourseDto): DuplicateCourseInfo => ({ id: c.id, name: c.name, city: c.city, layouts: c.layouts.length });
  return findDuplicates(active.map((c) => ({ ...c }))).map((p) => ({
    a: info(byId.get(p.a)!),
    b: info(byId.get(p.b)!),
    score: p.score,
    reasons: p.reasons,
  }));
}

export interface ChangeView {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  source: string;
  changes: unknown;
  createdAt: string;
}

export interface ImportRunView {
  id: string;
  kind: string;
  status: string;
  startedAt: string;
}

export interface AdminRatingRow {
  id: string;
  courseId: string;
  courseName: string;
  layoutName: string;
  teeColor: string;
  teeName: string | null;
  gender: "M" | "F";
  holes: 9 | 18;
  nine: "FRONT" | "BACK" | null;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  verified: boolean;
  active: boolean;
  sourceType: string | null;
  sourceUrl: string | null;
  checkedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
  /** Werte vollständig (CR, Slope, Par vorhanden) */
  complete: boolean;
}

/** Alle Rating-Sets (für Übersicht, Filter und Versionierung nach Gültigkeit). */
export function toRatingRows(courses: readonly CourseDto[]): AdminRatingRow[] {
  const rows: AdminRatingRow[] = [];
  for (const c of courses) {
    for (const l of c.layouts) {
      for (const s of l.ratingSets) {
        rows.push({
          id: s.id,
          courseId: c.id,
          courseName: c.name,
          layoutName: l.name,
          teeColor: s.teeColor,
          teeName: s.teeName,
          gender: s.gender,
          holes: s.holes,
          nine: s.nine,
          par: s.par,
          courseRating: s.courseRating,
          slopeRating: s.slopeRating,
          verified: s.verified,
          active: s.active,
          sourceType: s.sourceType,
          sourceUrl: s.sourceUrl,
          checkedAt: s.checkedAt,
          validFrom: s.validFrom,
          validTo: s.validTo,
          complete: s.courseRating !== null && s.slopeRating !== null && s.par !== null,
        });
      }
    }
  }
  return rows.sort((a, b) => a.courseName.localeCompare(b.courseName, "de") || a.layoutName.localeCompare(b.layoutName, "de") || a.teeColor.localeCompare(b.teeColor, "de"));
}

export interface AdminSourceRow {
  key: string;
  sourceType: string | null;
  host: string | null;
  ratings: number;
  verified: number;
  courses: number;
  lastChecked: string | null;
  examples: string[];
}

/** Herkunft der Ratingdaten: je Quellentyp und Website, mit Anteil geprüfter Werte. */
export function toSourceRows(courses: readonly CourseDto[]): AdminSourceRow[] {
  const map = new Map<string, AdminSourceRow & { courseSet: Set<string> }>();
  for (const r of toRatingRows(courses)) {
    if (!r.active) continue;
    let host: string | null = null;
    try {
      host = r.sourceUrl ? new URL(r.sourceUrl).hostname.replace(/^www\./, "") : null;
    } catch {
      host = null;
    }
    const key = `${r.sourceType ?? "–"}|${host ?? "–"}`;
    const row = map.get(key) ?? { key, sourceType: r.sourceType, host, ratings: 0, verified: 0, courses: 0, lastChecked: null, examples: [], courseSet: new Set<string>() };
    row.ratings++;
    if (r.verified) row.verified++;
    row.courseSet.add(r.courseId);
    if (r.checkedAt && (!row.lastChecked || r.checkedAt > row.lastChecked)) row.lastChecked = r.checkedAt;
    if (row.examples.length < 3 && !row.examples.includes(r.courseName)) row.examples.push(r.courseName);
    map.set(key, row);
  }
  return [...map.values()].map(({ courseSet, ...row }) => ({ ...row, courses: courseSet.size })).sort((a, b) => b.ratings - a.ratings);
}
