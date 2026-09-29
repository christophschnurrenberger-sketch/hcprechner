import { searchCourses, type CourseSearchQuery, type CourseSearchResult } from "./search";
import type { CourseDto, LayoutType } from "./types";
import type { Gender, IsoDate, NineSide } from "@/lib/whs/types";

/** Kompakte Darstellung einer Anlage für Suchlisten (Node-API und Webspace-Edition identisch). */
export interface CourseSummary {
  id: string;
  slug: string;
  name: string;
  officialName: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
  facilityType: string;
  verified: boolean;
  has9: boolean;
  has18: boolean;
  teeColors: string[];
  verifiedRatingCount: number;
  distanceKm: number | null;
  layouts: CourseSummaryLayout[];
}

export interface CourseSummaryLayout {
  id: string;
  name: string;
  type: LayoutType;
  holesCount: number;
  ratings: {
    gender: Gender;
    teeColor: string;
    holes: 9 | 18;
    nine: NineSide | null;
    par: number | null;
    courseRating: number | null;
    slopeRating: number | null;
    verified: boolean;
    validFrom: IsoDate | null;
    validTo: IsoDate | null;
  }[];
}

export interface CourseSearchResponse {
  total: number;
  totalCourses: number;
  results: CourseSummary[];
}

export const DEFAULT_SEARCH_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 500;

export function toCourseSummary(r: CourseSearchResult): CourseSummary {
  return {
    id: r.course.id,
    slug: r.course.slug,
    name: r.course.name,
    officialName: r.course.officialName,
    city: r.course.city,
    postalCode: r.course.postalCode,
    region: r.course.region,
    facilityType: r.course.facilityType,
    verified: r.course.verified,
    has9: r.has9,
    has18: r.has18,
    teeColors: r.teeColors,
    verifiedRatingCount: r.verifiedRatingCount,
    distanceKm: r.distanceKm,
    layouts: r.course.layouts
      .filter((l) => l.active)
      .map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        holesCount: l.holesCount,
        ratings: l.ratingSets
          .filter((s) => s.active)
          .map((s) => ({
            gender: s.gender,
            teeColor: s.teeColor,
            holes: s.holes,
            nine: s.nine,
            par: s.par,
            courseRating: s.courseRating,
            slopeRating: s.slopeRating,
            verified: s.verified,
            validFrom: s.validFrom,
            validTo: s.validTo,
          })),
      })),
  };
}

/** Übersetzt die URL-Parameter der Golfplatzsuche (q, region, plz, has9, has18, tee, lat, lon, maxKm, verified, limit). */
export function parseCourseSearchParams(p: URLSearchParams): { query: CourseSearchQuery; limit: number } {
  const lat = p.get("lat");
  const lon = p.get("lon");
  const limitRaw = Number(p.get("limit") ?? DEFAULT_SEARCH_LIMIT);
  return {
    query: {
      text: p.get("q") ?? undefined,
      region: p.get("region") || null,
      postalCode: p.get("plz") || null,
      has9: p.get("has9") === "1",
      has18: p.get("has18") === "1",
      teeColor: p.get("tee") || null,
      near: lat && lon ? { latitude: Number(lat), longitude: Number(lon) } : null,
      maxDistanceKm: p.get("maxKm") ? Number(p.get("maxKm")) : null,
      onlyWithVerifiedRatings: p.get("verified") === "1",
    },
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_SEARCH_LIMIT) : DEFAULT_SEARCH_LIMIT,
  };
}

/** Suche + Zusammenfassung – gemeinsame Logik von Node-API und Webspace-Client. */
export function runCourseSearch(courses: readonly CourseDto[], params: URLSearchParams): CourseSearchResponse {
  const { query, limit } = parseCourseSearchParams(params);
  const results = searchCourses(courses, query);
  return {
    total: results.length,
    totalCourses: courses.length,
    results: results.slice(0, limit).map(toCourseSummary),
  };
}
