import { z } from "zod";
import { BAVARIAN_REGIONS } from "./regions";
import { FACILITY_TYPES, GEO_SOURCES, LAYOUT_TYPES, SOURCE_TYPES } from "./types";

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

/** Leere Eingaben werden zu null – nie zu 0 (z. coerce würde "" als 0 lesen). */
const optionalNumber = <T extends z.ZodType<number, unknown>>(schema: T) =>
  z
    .preprocess((v) => (v === "" || v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable())
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

// ---------------------------------------------------------------------------
// GPS-Geodaten (Grün je Loch, unabhängig vom Abschlag)
// ---------------------------------------------------------------------------

/** WGS-84-Punkt: Breite −90…90, Länge −180…180 – ungültige Werte werden nie gespeichert. */
export const geoPointSchema = z.object({
  latitude: z.number().min(-90, "Breite muss zwischen −90 und 90 liegen").max(90, "Breite muss zwischen −90 und 90 liegen"),
  longitude: z.number().min(-180, "Länge muss zwischen −180 und 180 liegen").max(180, "Länge muss zwischen −180 und 180 liegen"),
});

/** GeoJSON-Polygon der Grünfläche (vorbereitet): Ringe aus [Länge, Breite], geschlossen (erster = letzter Punkt). */
export const greenPolygonSchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4)).min(1),
  })
  .refine((p) => p.coordinates.every((ring) => ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]), "Polygon muss geschlossen sein");

export const pinPositionSchema = geoPointSchema.extend({ setAt: z.string().min(1) });
export const teePositionSchema = geoPointSchema.extend({ teeColor: z.string().trim().min(1) });

/** Grün-Koordinaten eines Lochs (Admin-Formular, CSV-Import). */
export const greenInputSchema = z.object({
  holeNumber: z.coerce.number().int().min(1).max(36),
  front: geoPointSchema.nullable().default(null),
  center: geoPointSchema.nullable().default(null),
  back: geoPointSchema.nullable().default(null),
  source: z.enum(GEO_SOURCES as unknown as [string, ...string[]]).nullable().default(null),
});
export type GreenInput = z.infer<typeof greenInputSchema>;
