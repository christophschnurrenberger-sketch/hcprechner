import { availableTees } from "./ratingSelection";
import { distanceKm, foldText } from "./normalize";
import type { CourseDto } from "./types";

export interface CourseSearchQuery {
  text?: string;
  region?: string | null;
  postalCode?: string | null;
  has9?: boolean;
  has18?: boolean;
  teeColor?: string | null;
  near?: { latitude: number; longitude: number } | null;
  maxDistanceKm?: number | null;
  includeInactive?: boolean;
  includeDrivingRanges?: boolean;
  onlyWithVerifiedRatings?: boolean;
}

export interface CourseSearchResult {
  course: CourseDto;
  score: number;
  distanceKm: number | null;
  has9: boolean;
  has18: boolean;
  verifiedRatingCount: number;
  teeColors: string[];
}

function haystack(course: CourseDto): string[] {
  return [course.name, course.officialName, course.clubName, course.city, course.postalCode, course.address]
    .filter((v): v is string => Boolean(v))
    .map((v) => foldText(v));
}

export function courseCapabilities(course: CourseDto) {
  const sets = course.layouts.filter((l) => l.active).flatMap((l) => l.ratingSets.filter((s) => s.active));
  return {
    has9: sets.some((s) => s.holes === 9) || course.layouts.some((l) => l.active && l.holesCount === 9),
    has18: sets.some((s) => s.holes === 18) || course.layouts.some((l) => l.active && l.holesCount >= 18),
    verifiedRatingCount: sets.filter((s) => s.verified).length,
    teeColors: [...new Set(course.layouts.flatMap((l) => availableTees(l).map((t) => t.teeColor)))],
  };
}

/** Golfplatzsuche nach Name, Ort, PLZ, Region, Entfernung, Lochzahl und Abschlagsfarbe. */
export function searchCourses(courses: readonly CourseDto[], query: CourseSearchQuery): CourseSearchResult[] {
  const tokens = foldText(query.text ?? "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
  const results: CourseSearchResult[] = [];
  for (const course of courses) {
    if (!query.includeInactive && !course.active) continue;
    if (!query.includeDrivingRanges && course.facilityType === "DRIVING_RANGE") continue;
    if (query.region) {
      if (query.region === "OBERBAYERN") {
        if (course.region !== "OBERBAYERN" && course.region !== "MUENCHEN") continue;
      } else if (course.region !== query.region) continue;
    }
    if (query.postalCode && !(course.postalCode ?? "").startsWith(query.postalCode.trim())) continue;
    const caps = courseCapabilities(course);
    if (query.has9 && !caps.has9) continue;
    if (query.has18 && !caps.has18) continue;
    if (query.teeColor && !caps.teeColors.includes(query.teeColor)) continue;
    if (query.onlyWithVerifiedRatings && caps.verifiedRatingCount === 0) continue;

    let score = 1;
    if (tokens.length > 0) {
      const hay = haystack(course);
      let matched = 0;
      for (const t of tokens) {
        if (hay.some((h) => h.split(/[^a-z0-9]+/).some((w) => w.startsWith(t)))) matched += 2;
        else if (hay.some((h) => h.includes(t))) matched += 1;
        else {
          matched = -1;
          break;
        }
      }
      if (matched < 0) continue;
      score = matched / (tokens.length * 2);
      if (foldText(course.name).startsWith(tokens.join(" "))) score += 0.5;
    }

    let dist: number | null = null;
    if (query.near && course.latitude != null && course.longitude != null) {
      dist = distanceKm(query.near.latitude, query.near.longitude, course.latitude, course.longitude);
      if (query.maxDistanceKm && dist > query.maxDistanceKm) continue;
    } else if (query.near && query.maxDistanceKm) {
      continue;
    }
    results.push({ course, score, distanceKm: dist, ...caps });
  }
  return results.sort(
    (a, b) =>
      (query.near ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : 0) ||
      b.score - a.score ||
      a.course.name.localeCompare(b.course.name, "de"),
  );
}
