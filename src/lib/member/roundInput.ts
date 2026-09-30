/**
 * Runden-Eingabe (vom Wizard) → gespeicherte Runde.
 *
 * Verbindlich im Backend: Bei Plätzen aus der Datenbank werden Par, Course Rating, Slope und Lochdaten
 * hier aus den Golfplatzdaten aufgelöst (zum Spieldatum gültiges, verifiziertes Rating) – Werte aus dem
 * Client werden dafür nicht übernommen. Ein ungeprüftes Rating wird nur verwendet, wenn der Spieler genau
 * diese Werte mit seiner Scorekarte bestätigt hat (`confirmRating`). Es wird nie ein 9-Loch-Rating aus
 * einem 18-Loch-Rating abgeleitet.
 */
import { z } from "zod";
import { apiError } from "@/lib/api/errors";
import type { RoundInput } from "@/lib/api/types";
import { holesFor, selectRatingSet, toRatingSnapshot } from "@/lib/courses/ratingSelection";
import type { CourseDto } from "@/lib/courses/types";
import { holeNumbersFor, holeStatsSchema, hasAnyStat, validateHoleStats } from "@/lib/stats/holeStats";
import type { HoleStat } from "@/lib/stats/types";
import { isIsoDate } from "@/lib/whs/dates";
import type { EntryMode, HoleInfo, HoleScore, RatingSnapshot } from "@/lib/whs/types";
import { fieldErrors } from "@/lib/auth/validation";
import type { MemberRound } from "./round";

const gender = z.enum(["M", "F"]);
const holeScore = z.union([z.number().int().min(1).max(20), z.literal("PICKUP"), z.null()]);

const courseInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DB"),
    courseId: z.string().min(1),
    layoutId: z.string().min(1),
    teeColor: z.string().min(1),
    gender,
    confirmRating: z.object({ par: z.number().int(), courseRating: z.number(), slopeRating: z.number().int() }).optional(),
  }),
  z.object({
    kind: z.literal("MANUAL"),
    courseName: z.string().trim().min(2, "Bitte den Namen des Golfplatzes eingeben.").max(120),
    city: z.string().trim().max(80).nullable().optional(),
    country: z.string().trim().length(2).default("DE"),
    teeColor: z.string().trim().max(30).nullable().optional(),
    gender,
    par: z.number().int().min(27, "Par ungültig").max(80, "Par ungültig"),
    courseRating: z.number().min(20, "Course Rating ungültig").max(90, "Course Rating ungültig"),
    slopeRating: z.number().int().min(55, "Slope Rating zwischen 55 und 155").max(155, "Slope Rating zwischen 55 und 155"),
  }),
]);

const scoreInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("GBE"), adjustedGrossScore: z.number().int().min(18, "GBE ungültig").max(250, "GBE ungültig") }),
  z.object({ mode: z.literal("HOLES"), strokes: z.array(holeScore).min(9).max(18) }),
  z.object({ mode: z.literal("STABLEFORD_TOTAL"), points: z.number().int().min(0).max(120), playingHandicap: z.number().nullable().optional() }),
  z.object({ mode: z.literal("STABLEFORD_HOLES"), points: z.array(z.number().int().min(0).max(10).nullable()).min(9).max(18), playingHandicap: z.number().nullable().optional() }),
  z.object({ mode: z.literal("DIFFERENTIAL"), scoreDifferential: z.number().min(-15).max(80), officialHandicapIndexAfter: z.number().min(-10).max(54).nullable().optional() }),
]);

export const roundInputSchema = z
  .object({
    date: z.string().refine(isIsoDate, "Bitte ein gültiges Datum wählen."),
    title: z.string().trim().max(120).optional(),
    category: z.enum(["TOURNAMENT", "RPR", "OTHER"]),
    format: z.enum(["STROKE", "STABLEFORD", "MAX_SCORE", "PAR_BOGEY", "MATCHPLAY", "TEAM"]).optional(),
    resultStatus: z.enum(["NORMAL", "NA", "TA", "NR_A", "NR_O", "DQ_A", "DQ_O", "PENALTY"]).optional(),
    course: courseInputSchema.nullable(),
    holes: z.union([z.literal(9), z.literal(18)]),
    nine: z.enum(["FRONT", "BACK"]).nullable().optional(),
    score: scoreInputSchema,
    holeData: z
      .array(z.object({ number: z.number().int().min(1).max(18), par: z.number().int().min(3).max(6), strokeIndex: z.number().int().min(1).max(18).nullable() }))
      .nullable()
      .optional(),
    pcc: z.union([z.literal(-1), z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
    notes: z.string().trim().max(1000).optional(),
    visibility: z.enum(["PRIVATE", "MEMBERS_BASIC", "MEMBERS_FULL"]).optional(),
    holeStats: z.unknown().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.score.mode !== "DIFFERENTIAL" && !v.course) ctx.addIssue({ code: "custom", path: ["course"], message: "Bitte einen Golfplatz wählen." });
    if ((v.score.mode === "HOLES" || v.score.mode === "STABLEFORD_HOLES") && (v.score.mode === "HOLES" ? v.score.strokes : v.score.points).length !== v.holes) {
      ctx.addIssue({ code: "custom", path: ["score"], message: `Bitte ${v.holes} Löcher erfassen.` });
    }
  });

/** Stimmen die bestätigten Werte exakt mit dem hinterlegten Rating überein? */
function sameRatingValues(set: { par: number | null; courseRating: number | null; slopeRating: number | null }, c: { par: number; courseRating: number; slopeRating: number }): boolean {
  return set.par === c.par && set.slopeRating === c.slopeRating && set.courseRating !== null && Math.abs(set.courseRating - c.courseRating) < 1e-9;
}

export interface CourseLookup {
  (courseId: string): CourseDto | null | Promise<CourseDto | null>;
}

export interface ResolveOptions {
  /** Runde, die bearbeitet wird (ID, Erstellzeit und Tagesreihenfolge bleiben erhalten). */
  existing?: MemberRound | null;
  id: string;
  sequence: number;
  now?: Date;
}

/** Prüft die Eingabe; wirft ApiError(VALIDATION) mit Feldmeldungen. */
export function parseRoundInput(raw: unknown): RoundInput {
  const parsed = roundInputSchema.safeParse(raw);
  if (!parsed.success) throw apiError("VALIDATION", undefined, fieldErrors(parsed.error));
  return parsed.data as RoundInput;
}

function entryModeFor(input: RoundInput): EntryMode {
  switch (input.score.mode) {
    case "GBE":
      return "AGS";
    case "HOLES":
      return "HOLE_BY_HOLE";
    case "STABLEFORD_TOTAL":
      return "STABLEFORD_TOTAL";
    case "STABLEFORD_HOLES":
      return "STABLEFORD_HOLES";
    case "DIFFERENTIAL":
      return "SCORE_DIFFERENTIAL";
  }
}

/** Prüft Lochstatistik aus einer Eingabe; wirft VALIDATION mit verständlicher Meldung. */
export function parseHoleStats(raw: unknown): HoleStat[] {
  const parsed = holeStatsSchema.safeParse(raw);
  if (!parsed.success) throw apiError("VALIDATION", "Die Lochstatistik ist unvollständig oder ungültig.", { holeStats: "Bitte die Angaben je Loch prüfen." });
  return parsed.data.map((h) => ({ ...h, strokeIndex: h.strokeIndex ?? null, note: h.note ? h.note : null }));
}

/**
 * Lochstatistik an die Runde anpassen: Par/Handicap aus den Platzdaten (falls vorhanden), bei Eingabe
 * „Loch für Loch“ die WHS-Schläge als Schlagzahl (diese sind maßgeblich und hier nicht änderbar).
 */
export function alignHoleStats(stats: readonly HoleStat[], base: readonly HoleInfo[] | null, whsStrokes: readonly HoleScore[] | null): HoleStat[] {
  const info = new Map((base ?? []).map((h, i) => [h.number, { h, i }]));
  return stats.map((s) => {
    const b = info.get(s.number);
    let next: HoleStat = b ? { ...s, par: b.h.par, strokeIndex: b.h.strokeIndex ?? null } : s;
    if (whsStrokes) {
      const raw = b ? whsStrokes[b.i] : undefined;
      next = { ...next, score: typeof raw === "number" ? raw : null };
    }
    return next;
  });
}

/** Lochstatistik prüfen (Fehler → VALIDATION); leere Statistik → undefined. */
export function checkedHoleStats(stats: HoleStat[], numbers: number[]): HoleStat[] | undefined {
  const v = validateHoleStats(stats, numbers);
  if (v.errors.length > 0) throw apiError("VALIDATION", v.errors[0].message, { holeStats: v.errors.map((e) => e.message).join(" ") });
  return stats.some((h) => hasAnyStat(h)) ? stats : undefined;
}

/**
 * Baut die unveränderliche Runde (Snapshot aller verwendeten Werte). Bei DB-Plätzen gilt das zum
 * Spieldatum gültige, verifizierte Rating; fehlt es, wird die Runde mit einem klaren Fehler abgelehnt.
 * Lochstatistik und Sichtbarkeit werden getrennt davon übernommen und beeinflussen die Berechnung nicht.
 */
export async function resolveRound(input: RoundInput, lookup: CourseLookup, options: ResolveOptions): Promise<MemberRound> {
  const now = (options.now ?? new Date()).toISOString();
  const entryMode = entryModeFor(input);
  const usesHoles = entryMode === "HOLE_BY_HOLE" || entryMode === "STABLEFORD_HOLES";
  let rating: RatingSnapshot = { holes: input.holes, par: null, courseRating: null, slopeRating: null };
  let holeData: HoleInfo[] | undefined;
  let courseHoles: HoleInfo[] | null = null;
  let nineForNumbers: "FRONT" | "BACK" | null = null;
  let course: MemberRound["course"] = { courseName: "Ohne Platzangabe", country: "DE" };

  if (input.course?.kind === "DB") {
    const ci = input.course;
    const dto = await lookup(ci.courseId);
    if (!dto || !dto.active) throw apiError("COURSE_NOT_FOUND");
    const layout = dto.layouts.find((l) => l.id === ci.layoutId && l.active);
    if (!layout) throw apiError("COURSE_NOT_FOUND", "Dieser Platz (Layout) ist nicht mehr verfügbar.");
    const nine = input.holes === 9 && layout.holesCount >= 18 ? input.nine ?? "FRONT" : null;
    nineForNumbers = nine;
    courseHoles = holesFor(layout, { gender: ci.gender, teeColor: ci.teeColor, holes: input.holes, nine });
    const selection = selectRatingSet(layout.ratingSets, { date: input.date, gender: ci.gender, teeColor: ci.teeColor, holes: input.holes, nine });
    let playerConfirmed = false;
    if (selection.status === "NOT_VERIFIED" && selection.ratingSet) {
      if (!ci.confirmRating) throw apiError("RATING_NOT_VERIFIED");
      if (!sameRatingValues(selection.ratingSet, ci.confirmRating)) throw apiError("RATING_CHANGED");
      playerConfirmed = true;
    } else if (selection.status === "NINE_HOLE_RATING_MISSING") {
      throw apiError("NINE_HOLE_RATING_MISSING");
    } else if (selection.status !== "OK" || !selection.ratingSet) {
      throw apiError("COURSE_RATING_MISSING");
    }
    const ratingSet = selection.ratingSet!;
    rating = playerConfirmed ? { ...toRatingSnapshot(ratingSet), playerConfirmed: true } : toRatingSnapshot(ratingSet);
    if (usesHoles) {
      if (!courseHoles) throw apiError("HOLE_DATA_MISSING");
      holeData = courseHoles;
    }
    course = {
      courseId: dto.id,
      layoutId: layout.id,
      courseName: dto.name,
      layoutName: layout.name,
      city: dto.city,
      region: dto.region,
      country: dto.country,
      teeColor: ci.teeColor,
      teeName: ratingSet.teeName,
      gender: ci.gender,
    };
  } else if (input.course?.kind === "MANUAL") {
    const ci = input.course;
    nineForNumbers = input.holes === 9 ? input.nine ?? null : null;
    rating = {
      holes: input.holes,
      par: ci.par,
      courseRating: ci.courseRating,
      slopeRating: ci.slopeRating,
      nine: input.holes === 9 ? input.nine ?? null : null,
      manual: true,
      verified: false,
      sourceType: "MANUAL_IMPORT",
    };
    if (usesHoles) {
      if (!input.holeData || input.holeData.length !== input.holes) throw apiError("HOLE_DATA_MISSING", "Bitte Par und Handicap für jedes Loch angeben.");
      holeData = input.holeData;
    }
    courseHoles = input.holeData && input.holeData.length === input.holes ? input.holeData : null;
    course = { courseName: ci.courseName, city: ci.city ?? null, country: ci.country ?? "DE", teeColor: ci.teeColor ?? null, gender: ci.gender };
  }

  const score = input.score;
  const strokes: HoleScore[] | undefined = score.mode === "HOLES" ? score.strokes : undefined;
  const played = strokes ? strokes.filter((s) => s !== null).length : null;
  const partial = input.holes === 18 && strokes && played !== null && played < 18 ? played : null;

  // Golfstatistik (getrennt von den WHS-Daten): aus der Eingabe oder – beim Bearbeiten ohne Angabe – bisherige
  const numbers = holeNumbersFor(input.holes, nineForNumbers);
  const align = (stats: HoleStat[]) => alignHoleStats(stats, holeData ?? courseHoles, strokes ?? null);
  let holeStats: HoleStat[] | undefined;
  if (input.holeStats !== undefined && input.holeStats !== null) {
    holeStats = checkedHoleStats(align(parseHoleStats(input.holeStats)), numbers);
  } else if (input.holeStats === undefined && options.existing?.holeStats?.length) {
    // bisherige Statistik übernehmen, solange sie zu den Löchern passt (sonst entfällt sie – Hinweis in der Vorschau)
    const kept = align(options.existing.holeStats);
    const fits = kept.length === numbers.length && validateHoleStats(kept, numbers).errors.length === 0;
    holeStats = fits ? kept : undefined;
  }

  return {
    id: options.id,
    date: input.date,
    sequence: options.sequence,
    title: input.title?.trim() || (input.category === "TOURNAMENT" ? "Turnier" : input.category === "RPR" ? "Registrierte Privatrunde" : "Runde"),
    category: input.category,
    format: input.format ?? (score.mode === "STABLEFORD_TOTAL" || score.mode === "STABLEFORD_HOLES" ? "STABLEFORD" : "STROKE"),
    resultStatus: input.resultStatus ?? "NORMAL",
    holes: input.holes,
    holesPlayed: partial,
    course,
    rating,
    holeData,
    pcc: input.pcc ?? 0,
    entry: {
      mode: entryMode,
      adjustedGrossScore: score.mode === "GBE" ? score.adjustedGrossScore : null,
      holeScores: strokes ?? (score.mode === "STABLEFORD_HOLES" ? Array(input.holes).fill(null) : undefined),
      stablefordPoints: score.mode === "STABLEFORD_HOLES" ? score.points : undefined,
      stablefordTotal: score.mode === "STABLEFORD_TOTAL" ? score.points : null,
      stablefordFullAllowanceConfirmed: score.mode === "STABLEFORD_TOTAL" ? true : undefined,
      stablefordPlayingHandicap: score.mode === "STABLEFORD_TOTAL" || score.mode === "STABLEFORD_HOLES" ? score.playingHandicap ?? null : null,
      scoreDifferential: score.mode === "DIFFERENTIAL" ? score.scoreDifferential : null,
      officialHandicapIndexAfter: score.mode === "DIFFERENTIAL" ? score.officialHandicapIndexAfter ?? null : null,
    },
    notes: input.notes?.trim() || undefined,
    createdAt: options.existing?.createdAt ?? now,
    updatedAt: now,
    status: "COMPLETED",
    deletedAt: null,
    visibility: input.visibility ?? options.existing?.visibility ?? "PRIVATE",
    ...(holeStats ? { holeStats } : {}),
    ...(options.existing?.moderation ? { moderation: options.existing.moderation } : {}),
  };
}

/** Eingabe aus einer gespeicherten Runde (zum Bearbeiten im Wizard). */
export function roundToInput(round: MemberRound): RoundInput {
  const course: RoundInput["course"] =
    round.entry.mode === "SCORE_DIFFERENTIAL" && round.rating.courseRating == null
      ? null
      : round.course.courseId && round.course.layoutId && round.course.teeColor && !round.rating.manual
        ? {
            kind: "DB",
            courseId: round.course.courseId,
            layoutId: round.course.layoutId,
            teeColor: round.course.teeColor,
            gender: round.course.gender ?? "M",
            ...(round.rating.playerConfirmed && round.rating.par != null && round.rating.courseRating != null && round.rating.slopeRating != null
              ? { confirmRating: { par: round.rating.par, courseRating: round.rating.courseRating, slopeRating: round.rating.slopeRating } }
              : {}),
          }
        : {
            kind: "MANUAL",
            courseName: round.course.courseName,
            city: round.course.city ?? null,
            country: round.course.country,
            teeColor: round.course.teeColor ?? null,
            gender: round.course.gender ?? "M",
            par: round.rating.par ?? 72,
            courseRating: round.rating.courseRating ?? 72,
            slopeRating: round.rating.slopeRating ?? 113,
          };
  const e = round.entry;
  const score: RoundInput["score"] =
    e.mode === "AGS"
      ? { mode: "GBE", adjustedGrossScore: e.adjustedGrossScore ?? 0 }
      : e.mode === "HOLE_BY_HOLE"
        ? { mode: "HOLES", strokes: e.holeScores ?? [] }
        : e.mode === "STABLEFORD_TOTAL"
          ? { mode: "STABLEFORD_TOTAL", points: e.stablefordTotal ?? 0, playingHandicap: e.stablefordPlayingHandicap ?? null }
          : e.mode === "STABLEFORD_HOLES"
            ? { mode: "STABLEFORD_HOLES", points: e.stablefordPoints ?? [], playingHandicap: e.stablefordPlayingHandicap ?? null }
            : { mode: "DIFFERENTIAL", scoreDifferential: e.scoreDifferential ?? 0, officialHandicapIndexAfter: e.officialHandicapIndexAfter ?? null };
  return {
    date: round.date,
    title: round.title,
    category: round.category,
    format: round.format,
    resultStatus: round.resultStatus,
    course,
    holes: round.holes,
    nine: round.rating.nine ?? null,
    score,
    holeData: round.rating.manual ? round.holeData ?? null : null,
    pcc: round.pcc,
    notes: round.notes,
    visibility: round.visibility ?? "PRIVATE",
    holeStats: round.holeStats ?? null,
  };
}
