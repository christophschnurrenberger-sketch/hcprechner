import { z } from "zod";
import type { PlayerProfile, Round } from "@/lib/whs/types";

/** Validierung für JSON-Import und Synchronisation (tolerant, aber strukturgeprüft). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableNumber = z.number().nullable().optional();

const ratingSnapshot = z.object({
  holes: z.union([z.literal(9), z.literal(18)]),
  par: nullableNumber,
  courseRating: nullableNumber,
  slopeRating: nullableNumber,
  nine: z.enum(["FRONT", "BACK"]).nullable().optional(),
  ratingSetId: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  sourceType: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  checkedAt: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validTo: z.string().nullable().optional(),
  manual: z.boolean().optional(),
});

const holeScore = z.union([z.number(), z.literal("PICKUP"), z.null()]);

export const roundSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  sequence: z.number().int().min(0),
  title: z.string(),
  category: z.enum(["TOURNAMENT", "RPR", "OTHER"]),
  format: z.enum(["STROKE", "STABLEFORD", "MAX_SCORE", "PAR_BOGEY", "MATCHPLAY", "TEAM"]),
  resultStatus: z.enum(["NORMAL", "NA", "TA", "NR_A", "NR_O", "DQ_A", "DQ_O", "PENALTY"]),
  holes: z.union([z.literal(9), z.literal(18)]),
  holesPlayed: z.number().int().nullable().optional(),
  course: z.object({
    courseId: z.string().nullable().optional(),
    layoutId: z.string().nullable().optional(),
    courseName: z.string(),
    layoutName: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    country: z.string(),
    teeColor: z.string().nullable().optional(),
    teeName: z.string().nullable().optional(),
    gender: z.enum(["M", "F"]).nullable().optional(),
  }),
  rating: ratingSnapshot,
  nineHoleRatings: z.object({ FRONT: ratingSnapshot.optional(), BACK: ratingSnapshot.optional() }).partial().optional(),
  holeData: z
    .array(z.object({ number: z.number().int(), par: z.number().int(), strokeIndex: z.number().int().nullable() }))
    .optional(),
  pcc: z.union([z.literal(-1), z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  entry: z.object({
    mode: z.enum(["AGS", "HOLE_BY_HOLE", "STABLEFORD_HOLES", "STABLEFORD_TOTAL", "SCORE_DIFFERENTIAL"]),
    adjustedGrossScore: nullableNumber,
    holeScores: z.array(holeScore).optional(),
    stablefordPoints: z.array(z.number().nullable()).optional(),
    stablefordTotal: nullableNumber,
    stablefordPlayingHandicap: nullableNumber,
    stablefordFullAllowanceConfirmed: z.boolean().optional(),
    scoreDifferential: nullableNumber,
    officialHandicapIndexAfter: nullableNumber,
    suppressEsr: z.boolean().optional(),
  }),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const profileSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  gender: z.enum(["M", "F"]),
  startHandicapIndex: z.number().min(-10).max(54),
  startDate: isoDate.nullable().optional(),
  brake265LiftedAt: isoDate.nullable().optional(),
  homeCourseId: z.string().nullable().optional(),
  ruleSet: z.object({ country: z.string(), version: z.string() }),
});

export const settingsSchema = z.object({
  debugMode: z.boolean().default(false),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  sync: z
    .object({ profileId: z.string(), key: z.string(), lastSyncAt: z.string().nullable().optional() })
    .nullable()
    .optional(),
});

export const exportSchema = z.object({
  app: z.literal("hcp-rechner-bayern").optional(),
  version: z.number().int(),
  profile: profileSchema,
  rounds: z.array(roundSchema),
  settings: settingsSchema.optional(),
  exportedAt: z.string().optional(),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export interface StoredData {
  version: 1;
  profile: PlayerProfile;
  rounds: Round[];
  settings: AppSettings;
  updatedAt: string;
}
