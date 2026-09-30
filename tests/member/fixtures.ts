/** Gemeinsame Test-Daten: fiktiver Testplatz (keine realen Ratings). */
import { expect } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { RoundInput } from "@/lib/api/types";
import type { CourseDto, RatingSetDto } from "@/lib/courses/types";
import type { MemberContext } from "@/lib/member/service";

// Fiktiver Testplatz (keine realen Ratings)
export const COURSE_ID = "11111111-1111-4111-8111-111111111111";
export const LAYOUT_ID = "22222222-2222-4222-8222-222222222222";
export const PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 5, 3, 4, 4];

export function rating(p: Partial<RatingSetDto>): RatingSetDto {
  return {
    id: `r-${Math.random()}`,
    layoutId: LAYOUT_ID,
    gender: "M",
    teeColor: "Gelb",
    teeName: null,
    holes: 18,
    nine: null,
    par: 72,
    courseRating: 71.8,
    slopeRating: 135,
    yardage: null,
    validFrom: null,
    validTo: null,
    sourceType: "OFFICIAL_SCORECARD",
    sourceUrl: null,
    checkedAt: "2026-01-01",
    verified: true,
    lastVerifiedAt: "2026-01-01",
    confidence: "HIGH",
    active: true,
    notes: null,
    ...p,
  };
}

export const course: CourseDto = {
  id: COURSE_ID,
  slug: "testclub",
  name: "Testclub Musterstadt",
  officialName: null,
  clubName: null,
  facilityType: "GOLF_COURSE",
  city: "Musterstadt",
  postalCode: null,
  address: null,
  federalState: "BY",
  country: "DE",
  region: "SCHWABEN",
  latitude: null,
  longitude: null,
  website: null,
  officialSourceUrl: null,
  bayernGolfverbandUrl: null,
  externalClubId: null,
  active: true,
  verified: true,
  lastVerifiedAt: null,
  notes: null,
  layouts: [
    {
      id: LAYOUT_ID,
      courseId: COURSE_ID,
      name: "18-Loch-Platz",
      type: "18_HOLE",
      combinationName: null,
      holesCount: 18,
      active: true,
      notes: null,
      ratingSets: [
        rating({}),
        rating({ holes: 9, nine: "FRONT", par: 36, courseRating: 35.9, slopeRating: 133 }),
        rating({ gender: "F", teeColor: "Rot", courseRating: 73.5, slopeRating: 128, verified: false }),
      ],
      holes: PARS.map((par, i) => ({ id: `h${i}`, layoutId: LAYOUT_ID, holeNumber: i + 1, par, strokeIndex: ((i * 7) % 18) + 1, lengthMen: null, lengthWomen: null, teeColor: null, gender: null })),
      holeGeo: [],
    },
  ],
};

let counter = 0;
export const ctx: MemberContext = { courseLookup: (id) => (id === COURSE_ID ? course : null), newId: () => `round-${++counter}` };

export function input(p: Partial<RoundInput> = {}): RoundInput {
  return {
    date: "2026-09-01",
    category: "TOURNAMENT",
    course: { kind: "DB", courseId: COURSE_ID, layoutId: LAYOUT_ID, teeColor: "Gelb", gender: "M" },
    holes: 18,
    score: { mode: "GBE", adjustedGrossScore: 94 },
    ...p,
  };
}

export async function expectApiError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code);
}
