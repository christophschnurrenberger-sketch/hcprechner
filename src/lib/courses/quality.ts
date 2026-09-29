import { addDays } from "@/lib/whs/dates";
import { findDuplicates, type DuplicatePair } from "./duplicates";
import { hasCompleteValues } from "./ratingSelection";
import type { CourseDto, RatingSetDto } from "./types";

export type QualityIssueCode =
  | "NO_LAYOUT"
  | "NO_RATING"
  | "NO_VERIFIED_RATING"
  | "NO_18_HOLE_RATING"
  | "NO_9_HOLE_RATING"
  | "MISSING_COURSE_RATING"
  | "MISSING_SLOPE"
  | "MISSING_PAR"
  | "MISSING_SOURCE"
  | "MISSING_CHECK_DATE"
  | "STALE_CHECK"
  | "CONTRADICTORY_VALUES"
  | "MISSING_TEE"
  | "MISSING_HOLES"
  | "DRIVING_RANGE_WITH_LAYOUT"
  | "NINE_SIDE_MISSING"
  | "POSSIBLE_DUPLICATE";

export interface QualityIssue {
  code: QualityIssueCode;
  severity: "error" | "warning" | "info";
  courseId: string;
  courseName: string;
  layoutId?: string;
  ratingSetId?: string;
  detail?: string;
}

export interface QualityReport {
  generatedAt: string;
  facilities: number;
  golfFacilities: number;
  drivingRanges: number;
  inactive: number;
  verifiedFacilities: number;
  facilitiesWithVerifiedRating: number;
  facilitiesWithoutCompleteRating: number;
  unverifiedFacilities: number;
  layouts: number;
  ratingSets: number;
  verifiedRatingSets: number;
  nineHoleRatingSets: number;
  eighteenHoleRatingSets: number;
  facilitiesWith18HoleRating: number;
  facilitiesWith9HoleRating: number;
  facilitiesWithMultipleTees: number;
  missingCourseRating: number;
  missingSlope: number;
  missingPar: number;
  missingSource: number;
  missingCheckDate: number;
  contradictory: number;
  duplicates: DuplicatePair[];
  byRegion: { region: string | null; facilities: number; withVerifiedRating: number }[];
  issues: QualityIssue[];
}

const STALE_DAYS = 730;

function overlaps(a: RatingSetDto, b: RatingSetDto): boolean {
  return (!a.validTo || !b.validFrom || a.validTo >= b.validFrom) && (!b.validTo || !a.validFrom || b.validTo >= a.validFrom);
}

/** Datenqualitätsbericht – alle Zahlen werden aus den tatsächlichen Daten berechnet. */
export function buildQualityReport(courses: readonly CourseDto[], today: string): QualityReport {
  const issues: QualityIssue[] = [];
  const staleBefore = addDays(today, -STALE_DAYS);
  let missingCourseRating = 0;
  let missingSlope = 0;
  let missingPar = 0;
  let missingSource = 0;
  let missingCheckDate = 0;
  let contradictory = 0;

  const active = courses.filter((c) => c.active);
  const golf = active.filter((c) => c.facilityType !== "DRIVING_RANGE");

  for (const course of active) {
    const push = (i: Omit<QualityIssue, "courseId" | "courseName">) =>
      issues.push({ ...i, courseId: course.id, courseName: course.name });
    if (course.facilityType === "DRIVING_RANGE") {
      if (course.layouts.length > 0) push({ code: "DRIVING_RANGE_WITH_LAYOUT", severity: "error" });
      continue;
    }
    const layouts = course.layouts.filter((l) => l.active);
    if (layouts.length === 0) {
      push({ code: "NO_LAYOUT", severity: "warning" });
      continue;
    }
    const sets = layouts.flatMap((l) => l.ratingSets.filter((s) => s.active));
    if (sets.length === 0) push({ code: "NO_RATING", severity: "warning" });
    else if (!sets.some((s) => s.verified && hasCompleteValues(s))) push({ code: "NO_VERIFIED_RATING", severity: "warning" });

    for (const layout of layouts) {
      const lsets = layout.ratingSets.filter((s) => s.active);
      if (layout.holesCount >= 18 && lsets.length > 0 && !lsets.some((s) => s.holes === 18)) {
        push({ code: "NO_18_HOLE_RATING", severity: "info", layoutId: layout.id, detail: layout.name });
      }
      if (lsets.length > 0 && !lsets.some((s) => s.holes === 9)) {
        push({ code: "NO_9_HOLE_RATING", severity: "info", layoutId: layout.id, detail: layout.name });
      }
      if (layout.holes.length === 0) {
        push({ code: "MISSING_HOLES", severity: "info", layoutId: layout.id, detail: layout.name });
      }
      for (const s of lsets) {
        const base = { layoutId: layout.id, ratingSetId: s.id, detail: `${layout.name} · ${s.teeColor} ${s.gender === "F" ? "Damen" : "Herren"} · ${s.holes} Loch` };
        if (s.courseRating === null) {
          missingCourseRating += 1;
          push({ code: "MISSING_COURSE_RATING", severity: "warning", ...base });
        }
        if (s.slopeRating === null) {
          missingSlope += 1;
          push({ code: "MISSING_SLOPE", severity: "warning", ...base });
        }
        if (s.par === null) {
          missingPar += 1;
          push({ code: "MISSING_PAR", severity: "warning", ...base });
        }
        if (!s.sourceType) {
          missingSource += 1;
          push({ code: "MISSING_SOURCE", severity: "warning", ...base });
        }
        if (!s.checkedAt) {
          missingCheckDate += 1;
          push({ code: "MISSING_CHECK_DATE", severity: "info", ...base });
        } else if (s.checkedAt < staleBefore) {
          push({ code: "STALE_CHECK", severity: "info", ...base });
        }
        if (!s.teeColor) push({ code: "MISSING_TEE", severity: "error", ...base });
        if (s.holes === 9 && layout.holesCount >= 18 && !s.nine) {
          push({ code: "NINE_SIDE_MISSING", severity: "error", ...base });
        }
      }
      // widersprüchliche Werte: gleicher Abschlag, überlappende Gültigkeit, andere Werte
      for (let i = 0; i < lsets.length; i++) {
        for (let j = i + 1; j < lsets.length; j++) {
          const a = lsets[i];
          const b = lsets[j];
          if (
            a.gender === b.gender && a.teeColor === b.teeColor && a.holes === b.holes &&
            (a.nine ?? null) === (b.nine ?? null) && overlaps(a, b) &&
            (a.courseRating !== b.courseRating || a.slopeRating !== b.slopeRating || a.par !== b.par)
          ) {
            contradictory += 1;
            push({
              code: "CONTRADICTORY_VALUES",
              severity: "error",
              layoutId: layout.id,
              ratingSetId: a.id,
              detail: `${layout.name} · ${a.teeColor} ${a.gender === "F" ? "Damen" : "Herren"} · ${a.holes} Loch: ${a.courseRating}/${a.slopeRating} vs. ${b.courseRating}/${b.slopeRating}`,
            });
          }
        }
      }
    }
  }

  const duplicates = findDuplicates(active.map((c) => ({ ...c })));
  for (const d of duplicates) {
    const a = active.find((c) => c.id === d.a)!;
    const b = active.find((c) => c.id === d.b)!;
    issues.push({
      code: "POSSIBLE_DUPLICATE",
      severity: "warning",
      courseId: a.id,
      courseName: a.name,
      detail: `${b.name} (${Math.round(d.score * 100)} %)`,
    });
  }

  const allSets = golf.flatMap((c) => c.layouts.filter((l) => l.active).flatMap((l) => l.ratingSets.filter((s) => s.active)));
  const withVerified = (c: CourseDto, holes?: 9 | 18) =>
    c.layouts.some((l) => l.active && l.ratingSets.some((s) => s.active && s.verified && hasCompleteValues(s) && (!holes || s.holes === holes)));
  const regions = [...new Set(golf.map((c) => c.region))];

  return {
    generatedAt: new Date().toISOString(),
    facilities: active.length,
    golfFacilities: golf.length,
    drivingRanges: active.length - golf.length,
    inactive: courses.length - active.length,
    verifiedFacilities: golf.filter((c) => c.verified).length,
    facilitiesWithVerifiedRating: golf.filter((c) => withVerified(c)).length,
    facilitiesWithoutCompleteRating: golf.filter((c) => !withVerified(c)).length,
    unverifiedFacilities: golf.filter((c) => !c.verified).length,
    layouts: golf.reduce((n, c) => n + c.layouts.filter((l) => l.active).length, 0),
    ratingSets: allSets.length,
    verifiedRatingSets: allSets.filter((s) => s.verified).length,
    nineHoleRatingSets: allSets.filter((s) => s.holes === 9).length,
    eighteenHoleRatingSets: allSets.filter((s) => s.holes === 18).length,
    facilitiesWith18HoleRating: golf.filter((c) => withVerified(c, 18)).length,
    facilitiesWith9HoleRating: golf.filter((c) => withVerified(c, 9)).length,
    facilitiesWithMultipleTees: golf.filter(
      (c) => new Set(c.layouts.flatMap((l) => l.ratingSets.filter((s) => s.active && s.verified).map((s) => `${s.gender}|${s.teeColor}`))).size > 1,
    ).length,
    missingCourseRating,
    missingSlope,
    missingPar,
    missingSource,
    missingCheckDate,
    contradictory,
    duplicates,
    byRegion: regions
      .map((region) => ({
        region,
        facilities: golf.filter((c) => c.region === region).length,
        withVerifiedRating: golf.filter((c) => c.region === region && withVerified(c)).length,
      }))
      .sort((a, b) => b.facilities - a.facilities),
    issues,
  };
}
