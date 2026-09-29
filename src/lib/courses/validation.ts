import { z } from "zod";
import { BAVARIAN_REGIONS } from "./regions";
import { FACILITY_TYPES, LAYOUT_TYPES, SOURCE_TYPES } from "./types";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null))
  .transform((v) => v ?? null);

const optionalNumber = <T extends z.ZodType<number, unknown>>(schema: T) =>
  z
    .union([schema, z.literal("").transform(() => null), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v));

export const courseInputSchema = z.object({
  name: z.string().trim().min(2, "Name fehlt"),
  officialName: optionalText,
  clubName: optionalText,
  facilityType: z.enum(FACILITY_TYPES as unknown as [string, ...string[]]).default("GOLF_COURSE"),
  city: optionalText,
  postalCode: optionalText,
  address: optionalText,
  federalState: z.string().trim().default("BY"),
  country: z.string().trim().length(2).default("DE"),
  region: z
    .enum(BAVARIAN_REGIONS.map((r) => r.key) as [string, ...string[]])
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null))
    .transform((v) => v ?? null),
  latitude: optionalNumber(z.coerce.number().min(-90).max(90)),
  longitude: optionalNumber(z.coerce.number().min(-180).max(180)),
  website: optionalText,
  officialSourceUrl: optionalText,
  bayernGolfverbandUrl: optionalText,
  externalClubId: optionalText,
  active: z.boolean().default(true),
  verified: z.boolean().default(false),
  lastVerifiedAt: isoDate,
  notes: optionalText,
});
export type CourseInput = z.infer<typeof courseInputSchema>;

export const layoutInputSchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().trim().min(1, "Name fehlt"),
  type: z.enum(LAYOUT_TYPES as unknown as [string, ...string[]]),
  combinationName: optionalText,
  holesCount: z.coerce.number().int().min(1).max(36),
  active: z.boolean().default(true),
  notes: optionalText,
});
export type LayoutInput = z.infer<typeof layoutInputSchema>;

export const ratingSetInputSchema = z
  .object({
    layoutId: z.string().uuid(),
    gender: z.enum(["M", "F"]),
    teeColor: z.string().trim().min(1, "Abschlagsfarbe fehlt"),
    teeName: optionalText,
    holes: z.coerce.number().int().refine((v) => v === 9 || v === 18, "9 oder 18 Löcher"),
    nine: z
      .enum(["FRONT", "BACK"])
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    par: optionalNumber(z.coerce.number().int().min(27).max(108)),
    courseRating: optionalNumber(z.coerce.number().min(20).max(90)),
    slopeRating: optionalNumber(z.coerce.number().int().min(55).max(155)),
    yardage: optionalNumber(z.coerce.number().int().min(100).max(9000)),
    validFrom: isoDate,
    validTo: isoDate,
    sourceType: z
      .enum(SOURCE_TYPES as unknown as [string, ...string[]])
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    sourceUrl: optionalText,
    checkedAt: isoDate,
    verified: z.boolean().default(false),
    confidence: z
      .enum(["HIGH", "MEDIUM", "LOW"])
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    active: z.boolean().default(true),
    notes: optionalText,
  })
  .superRefine((v, ctx) => {
    if (v.verified && (v.courseRating === null || v.slopeRating === null || v.par === null)) {
      ctx.addIssue({ code: "custom", path: ["verified"], message: "„Verifiziert“ nur mit Course Rating, Slope und Par" });
    }
    if (v.verified && !v.sourceType) {
      ctx.addIssue({ code: "custom", path: ["sourceType"], message: "„Verifiziert“ nur mit Datenquelle" });
    }
    if (v.holes === 18 && v.nine) {
      ctx.addIssue({ code: "custom", path: ["nine"], message: "Hälfte nur bei 9-Loch-Ratings" });
    }
    if (v.par !== null && (v.par < v.holes * 3 || v.par > v.holes * 6)) {
      ctx.addIssue({ code: "custom", path: ["par"], message: `Par passt nicht zu ${v.holes} Löchern` });
    }
    if (v.courseRating !== null && (v.courseRating / v.holes < 2.5 || v.courseRating / v.holes > 6.5)) {
      ctx.addIssue({ code: "custom", path: ["courseRating"], message: `Course Rating passt nicht zu ${v.holes} Löchern` });
    }
    if (v.validFrom && v.validTo && v.validFrom > v.validTo) {
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "Gültig bis liegt vor Gültig ab" });
    }
  });
export type RatingSetInput = z.infer<typeof ratingSetInputSchema>;

export const holeInputSchema = z.object({
  holeNumber: z.coerce.number().int().min(1).max(36),
  par: z.coerce.number().int().min(3).max(6),
  strokeIndex: optionalNumber(z.coerce.number().int().min(1).max(36)),
  lengthMen: optionalNumber(z.coerce.number().int().min(30).max(800)),
  lengthWomen: optionalNumber(z.coerce.number().int().min(30).max(800)),
  teeColor: optionalText,
  gender: z
    .enum(["M", "F"])
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null))
    .transform((v) => v ?? null),
});
export type HoleInput = z.infer<typeof holeInputSchema>;
