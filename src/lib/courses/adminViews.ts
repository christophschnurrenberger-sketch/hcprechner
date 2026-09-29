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
