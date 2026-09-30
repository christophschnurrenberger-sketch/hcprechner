import { z } from "zod";
import { holeStatSchema } from "@/lib/stats/holeStats";
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
  playerConfirmed: z.boolean().optional(),
});

const holeScore = z.union([z.number(), z.literal("PICKUP"), z.null()]);

export const roundSchema = z.object({
  id: z.string().min(1),
  /** Kennung des Entwurfs, aus dem die Runde entstand – macht das Speichern idempotent (keine Doppel bei Wiederholung) */
  clientRef: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
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
  /** Mitgliederbereich: gelöschte Runden bleiben erhalten (Soft Delete) und zählen nicht. */
  status: z.enum(["COMPLETED", "DELETED"]).optional(),
  deletedAt: z.string().nullable().optional(),
  /** Ergebnis zum Zeitpunkt der Speicherung (für Listen im Admin-Bereich; maßgeblich ist die Neuberechnung). */
  computed: z
    .object({
      scoreDifferential: z.number().nullable(),
      adjustedGrossScore: z.number().nullable(),
      handicapIndexBefore: z.number(),
      handicapIndexAfter: z.number(),
      engine: z.string(),
      computedAt: z.string(),
      /** Golfstatistik der Runde (aus den Lochdaten; unabhängig vom Handicap) */
      stats: z.record(z.string(), z.union([z.number(), z.boolean(), z.null()])).nullable().optional(),
    })
    .nullable()
    .optional(),
  /** Mitgliederbereich: Sichtbarkeit für andere Mitglieder (Standard: privat) */
  visibility: z.enum(["PRIVATE", "MEMBERS_BASIC", "MEMBERS_FULL"]).optional(),
  /** Lochstatistik (Putts, GIR, FIR …) – Spielleistung, fließt nicht ins Handicap ein */
  holeStats: z.array(holeStatSchema).optional(),
  /** Moderation durch den Admin */
  moderation: z.object({ hidden: z.boolean(), reason: z.string().nullable(), at: z.string(), by: z.string().nullable() }).nullable().optional(),
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
