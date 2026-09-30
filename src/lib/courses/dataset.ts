/**
 * Golfplatzdatenbank als JSON-Datensatz (Webspace-Edition).
 *
 * Auf einem klassischen PHP-Webspace gibt es keine PostgreSQL-Datenbank. Die Golfplatzdaten
 * liegen dort als ein JSON-Dokument, das der Admin-Bereich im Browser bearbeitet und über
 * api/admin.php veröffentlicht. Die Operationen hier sind rein (kein I/O) und bilden die
 * Regeln von src/server/courseRepository.ts nach: gleiche Validierung (Zod-Schemas), gleiche
 * Sperren (keine Plätze auf einer Driving Range, 9-Loch-Rating auf 18-Loch-Platz nur mit Hälfte,
 * „verifiziert“ nur mit CR/Slope/Par/Quelle) und ein Änderungsprotokoll.
 *
 * Harte Regel: Es werden keine CR-/Slope-Werte erzeugt oder abgeleitet – fehlende Werte bleiben null.
 */
import { z } from "zod";
import type { CsvImportPlan, ParsedCsvRow } from "./csv";
import { mergeGreenUpdates, type GreenUpdate } from "./geo";
import type { GreenCsvPlan } from "./greenCsv";
import { normalizeCourseName, slugify } from "./normalize";
import type { CourseDto, FacilityType, GeoSource, HoleDto, LayoutDto, LayoutType, RatingSetDto } from "./types";
import {
  courseInputSchema,
  geoPointSchema,
  greenInputSchema,
  greenPolygonSchema,
  holeInputSchema,
  layoutInputSchema,
  pinPositionSchema,
  ratingSetInputSchema,
  teePositionSchema,
  type RatingSetInput,
} from "./validation";
import type { Gender, NineSide } from "@/lib/whs/types";

export const DATASET_FORMAT = "golf-hcp-rechner/courses";
/** 2: GPS-Geodaten je Loch (layouts[].holeGeo). Ältere Datensätze (1) werden ohne Änderung gelesen. */
export const DATASET_SCHEMA_VERSION = 2;
/** Anzahl der aufbewahrten Einträge im Änderungsprotokoll. */
export const CHANGE_LOG_LIMIT = 1000;
export const IMPORT_RUN_LIMIT = 50;

export type ChangeSource = "ADMIN" | "CSV_IMPORT" | "IMPORTER" | "SEED";

export interface ChangeLogEntry {
  id: string;
  entityType: "course" | "layout" | "rating_set";
  entityId: string | null;
  action: string;
  source: ChangeSource;
  changes: unknown;
  actor: string | null;
  createdAt: string;
}

export interface ImportRunEntry {
  id: string;
  kind: string;
  status: string;
  summary: unknown;
  startedAt: string;
  finishedAt: string | null;
}

export interface CourseDataset {
  format: typeof DATASET_FORMAT;
  schemaVersion: number;
  /** Wird bei jeder Veröffentlichung um 1 erhöht (Schutz vor gleichzeitigen Änderungen). */
  revision: number;
  updatedAt: string | null;
  courses: CourseDto[];
  changes: ChangeLogEntry[];
  importRuns: ImportRunEntry[];
}

export function emptyDataset(): CourseDataset {
  return { format: DATASET_FORMAT, schemaVersion: DATASET_SCHEMA_VERSION, revision: 0, updatedAt: null, courses: [], changes: [], importRuns: [] };
}

// ---------------------------------------------------------------------------
// Einlesen / Prüfen
// ---------------------------------------------------------------------------

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
const isoDateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const ratingSetDtoSchema = z.object({
  id: z.string().min(1),
  layoutId: z.string().min(1),
  gender: z.enum(["M", "F"]),
  teeColor: z.string().min(1),
  teeName: nullableString,
  holes: z.union([z.literal(9), z.literal(18)]),
  nine: z.enum(["FRONT", "BACK"]).nullable(),
  par: nullableNumber,
  courseRating: nullableNumber,
  slopeRating: nullableNumber,
  yardage: nullableNumber,
  validFrom: isoDateOrNull,
  validTo: isoDateOrNull,
  sourceType: z.enum(["DGV", "BGV", "CLUB_OFFICIAL", "OFFICIAL_SCORECARD", "SECONDARY_SOURCE", "MANUAL_IMPORT"]).nullable(),
  sourceUrl: nullableString,
  checkedAt: isoDateOrNull,
  verified: z.boolean(),
  lastVerifiedAt: isoDateOrNull,
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).nullable(),
  active: z.boolean(),
  notes: nullableString,
});

const holeDtoSchema = z.object({
  id: z.string().min(1),
  layoutId: z.string().min(1),
  holeNumber: z.number().int(),
  par: z.number().int(),
  strokeIndex: nullableNumber,
  lengthMen: nullableNumber,
  lengthWomen: nullableNumber,
  teeColor: nullableString,
  gender: z.enum(["M", "F"]).nullable(),
});

const holeGeoDtoSchema = z.object({
  layoutId: z.string().min(1),
  holeNumber: z.number().int().min(1).max(36),
  green: z.object({
    front: geoPointSchema.nullable(),
    center: geoPointSchema.nullable(),
    back: geoPointSchema.nullable(),
    polygon: greenPolygonSchema.nullable().default(null),
    pin: pinPositionSchema.nullable().default(null),
  }),
  tees: z.array(teePositionSchema).default([]),
  source: z.enum(["MANUAL", "DEVICE_GPS", "CSV_IMPORT", "MAP"]).nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});

const layoutDtoSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["9_HOLE", "18_HOLE", "27_HOLE", "36_HOLE", "SHORT_COURSE"]),
  combinationName: nullableString,
  holesCount: z.number().int(),
  active: z.boolean(),
  notes: nullableString,
  ratingSets: z.array(ratingSetDtoSchema),
  holes: z.array(holeDtoSchema),
  holeGeo: z.array(holeGeoDtoSchema).default([]),
});

const courseDtoSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  officialName: nullableString,
  clubName: nullableString,
  facilityType: z.enum(["GOLF_COURSE", "SHORT_COURSE", "PAR3", "DRIVING_RANGE"]),
  city: nullableString,
  postalCode: nullableString,
  address: nullableString,
  federalState: z.string(),
  country: z.string(),
  region: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  website: nullableString,
  officialSourceUrl: nullableString,
  bayernGolfverbandUrl: nullableString,
  externalClubId: nullableString,
  active: z.boolean(),
  verified: z.boolean(),
  lastVerifiedAt: isoDateOrNull,
  notes: nullableString,
  layouts: z.array(layoutDtoSchema),
});

const datasetSchema = z.object({
  format: z.literal(DATASET_FORMAT),
  schemaVersion: z.number().int().min(1).max(DATASET_SCHEMA_VERSION),
  revision: z.number().int().min(0),
  updatedAt: z.string().nullable(),
  courses: z.array(courseDtoSchema),
  changes: z.array(z.any()).default([]),
  importRuns: z.array(z.any()).default([]),
});

/** Prüft einen geladenen Datensatz. Wirft bei ungültiger Struktur. */
export function parseDataset(raw: unknown): CourseDataset {
  return datasetSchema.parse(raw) as CourseDataset;
}

/** Lädt einen Export der Node-Edition ({ courses: [...] }) oder einen kompletten Datensatz. */
export function datasetFromImport(raw: unknown, base: CourseDataset): CourseDataset {
  if (raw && typeof raw === "object" && (raw as { format?: unknown }).format === DATASET_FORMAT) {
    const parsed = parseDataset(raw);
    return { ...parsed, revision: base.revision };
  }
  const courses = z.object({ courses: z.array(courseDtoSchema) }).parse(raw).courses as CourseDto[];
  return { ...base, courses };
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

export interface OperationContext {
  actor?: string | null;
  source?: ChangeSource;
  /** Für Tests: feste Zeit und ID-Erzeugung. */
  now?: () => Date;
  newId?: () => string;
}

function defaultId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback (ältere Browser): RFC-4122-v4-Format
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

class Ctx {
  readonly now: Date;
  readonly today: string;
  readonly actor: string | null;
  readonly source: ChangeSource;
  private readonly idFn: () => string;
  constructor(o: OperationContext = {}) {
    this.now = (o.now ?? (() => new Date()))();
    this.today = this.now.toISOString().slice(0, 10);
    this.actor = o.actor ?? null;
    this.source = o.source ?? "ADMIN";
    this.idFn = o.newId ?? defaultId;
  }
  id(): string {
    return this.idFn();
  }
}

function log(ds: CourseDataset, ctx: Ctx, entry: Omit<ChangeLogEntry, "id" | "createdAt" | "actor" | "source"> & { source?: ChangeSource }): CourseDataset {
  const item: ChangeLogEntry = {
    id: ctx.id(),
    createdAt: ctx.now.toISOString(),
    actor: ctx.actor,
    source: entry.source ?? ctx.source,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    changes: entry.changes ?? null,
  };
  return { ...ds, changes: [item, ...ds.changes].slice(0, CHANGE_LOG_LIMIT) };
}

function diff(before: object, after: object) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    if (key === "layouts" || key === "ratingSets" || key === "holes" || key === "holeGeo") continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changes[key] = { from: a[key] ?? null, to: b[key] ?? null };
  }
  return changes;
}

function uniqueSlug(ds: CourseDataset, name: string, city: string | null, excludeId?: string): string {
  const base = slugify(city && !normalizeCourseName(name).includes(normalizeCourseName(city)) ? `${name} ${city}` : name) || "golfanlage";
  let candidate = base;
  for (let i = 2; i < 500; i++) {
    const existing = ds.courses.find((c) => c.slug === candidate);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error("Kein eindeutiger Slug möglich");
}

function sortRatings(sets: RatingSetDto[]): RatingSetDto[] {
  return [...sets].sort(
    (a, b) =>
      a.holes - b.holes ||
      a.gender.localeCompare(b.gender) ||
      a.teeColor.localeCompare(b.teeColor, "de") ||
      (b.validFrom ?? "").localeCompare(a.validFrom ?? ""),
  );
}

function sortCourses(list: CourseDto[]): CourseDto[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function mapCourse(ds: CourseDataset, courseId: string, fn: (c: CourseDto) => CourseDto): CourseDataset {
  let found = false;
  const courses = ds.courses.map((c) => {
    if (c.id !== courseId) return c;
    found = true;
    return fn(c);
  });
  if (!found) throw new Error("Anlage nicht gefunden");
  return { ...ds, courses };
}

function findLayout(ds: CourseDataset, layoutId: string): { course: CourseDto; layout: LayoutDto } {
  for (const course of ds.courses) {
    const layout = course.layouts.find((l) => l.id === layoutId);
    if (layout) return { course, layout };
  }
  throw new Error("Platz nicht gefunden");
}

function mapLayout(ds: CourseDataset, layoutId: string, fn: (l: LayoutDto) => LayoutDto): CourseDataset {
  const { course } = findLayout(ds, layoutId);
  return mapCourse(ds, course.id, (c) => ({ ...c, layouts: c.layouts.map((l) => (l.id === layoutId ? fn(l) : l)) }));
}

function findRating(ds: CourseDataset, ratingId: string): { course: CourseDto; layout: LayoutDto; rating: RatingSetDto } {
  for (const course of ds.courses) {
    for (const layout of course.layouts) {
      const rating = layout.ratingSets.find((s) => s.id === ratingId);
      if (rating) return { course, layout, rating };
    }
  }
  throw new Error("Rating nicht gefunden");
}

function mapRating(ds: CourseDataset, ratingId: string, fn: (s: RatingSetDto) => RatingSetDto): CourseDataset {
  const { layout } = findRating(ds, ratingId);
  return mapLayout(ds, layout.id, (l) => ({ ...l, ratingSets: sortRatings(l.ratingSets.map((s) => (s.id === ratingId ? fn(s) : s))) }));
}

export function findCourse(ds: CourseDataset, idOrSlug: string): CourseDto | null {
  return ds.courses.find((c) => c.id === idOrSlug || c.slug === idOrSlug) ?? null;
}

// ---------------------------------------------------------------------------
// Anlagen
// ---------------------------------------------------------------------------

export function createCourse(ds: CourseDataset, raw: unknown, options?: OperationContext): { dataset: CourseDataset; course: CourseDto } {
  const ctx = new Ctx(options);
  const input = courseInputSchema.parse(raw);
  const course: CourseDto = {
    id: ctx.id(),
    slug: uniqueSlug(ds, input.name, input.city),
    ...input,
    facilityType: input.facilityType as FacilityType,
    layouts: [],
  };
  let next: CourseDataset = { ...ds, courses: sortCourses([...ds.courses, course]) };
  next = log(next, ctx, { entityType: "course", entityId: course.id, action: "CREATE", changes: input });
  return { dataset: next, course };
}

export function updateCourse(ds: CourseDataset, id: string, raw: unknown, options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const input = courseInputSchema.parse(raw);
  const before = ds.courses.find((c) => c.id === id);
  if (!before) throw new Error("Anlage nicht gefunden");
  if (input.facilityType === "DRIVING_RANGE" && before.layouts.length > 0) {
    throw new Error("Eine Anlage mit Plätzen kann nicht als Driving Range geführt werden");
  }
  const slug = before.name !== input.name || before.city !== input.city ? uniqueSlug(ds, input.name, input.city, id) : before.slug;
  const after: CourseDto = { ...before, ...input, facilityType: input.facilityType as FacilityType, slug };
  const next = { ...ds, courses: sortCourses(ds.courses.map((c) => (c.id === id ? after : c))) };
  return log(next, ctx, { entityType: "course", entityId: id, action: "UPDATE", changes: diff(before, after) });
}

/** Führt eine doppelt angelegte Anlage in eine andere über (Plätze werden verschoben, Quelle deaktiviert). */
export function mergeCourses(ds: CourseDataset, targetId: string, sourceId: string, options?: OperationContext): CourseDataset {
  if (targetId === sourceId) throw new Error("Quelle und Ziel sind identisch");
  const ctx = new Ctx(options);
  const source = ds.courses.find((c) => c.id === sourceId);
  const target = ds.courses.find((c) => c.id === targetId);
  if (!source || !target) throw new Error("Anlage nicht gefunden");
  const moved = source.layouts.map((l) => ({ ...l, courseId: targetId }));
  const courses = ds.courses.map((c) => {
    if (c.id === targetId) return { ...c, layouts: [...c.layouts, ...moved].sort((a, b) => a.name.localeCompare(b.name, "de")) };
    if (c.id === sourceId) return { ...c, layouts: [], active: false, notes: `Zusammengeführt mit ${targetId}` };
    return c;
  });
  return log({ ...ds, courses }, ctx, { entityType: "course", entityId: sourceId, action: "MERGE", changes: { targetId, movedLayouts: moved.length } });
}

// ---------------------------------------------------------------------------
// Plätze / Layouts
// ---------------------------------------------------------------------------

export function createLayout(ds: CourseDataset, raw: unknown, options?: OperationContext): { dataset: CourseDataset; layout: LayoutDto } {
  const ctx = new Ctx(options);
  const input = layoutInputSchema.parse(raw);
  const course = ds.courses.find((c) => c.id === input.courseId);
  if (!course) throw new Error("Anlage nicht gefunden");
  if (course.facilityType === "DRIVING_RANGE") {
    throw new Error("Eine Driving Range ist kein handicap-relevanter Golfplatz – keine Plätze/Layouts möglich");
  }
  const layout: LayoutDto = { id: ctx.id(), ...input, type: input.type as LayoutType, ratingSets: [], holes: [], holeGeo: [] };
  let next = mapCourse(ds, course.id, (c) => ({ ...c, layouts: [...c.layouts, layout].sort((a, b) => a.name.localeCompare(b.name, "de")) }));
  next = log(next, ctx, { entityType: "layout", entityId: layout.id, action: "CREATE", changes: input });
  return { dataset: next, layout };
}

export function updateLayout(ds: CourseDataset, id: string, raw: unknown, options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const input = layoutInputSchema.parse(raw);
  const { layout: before } = findLayout(ds, id);
  if (input.courseId !== before.courseId) throw new Error("Ein Platz kann nicht per Formular einer anderen Anlage zugeordnet werden");
  const after: LayoutDto = { ...before, ...input, type: input.type as LayoutType };
  const next = mapLayout(ds, id, () => after);
  return log(next, ctx, { entityType: "layout", entityId: id, action: "UPDATE", changes: diff(before, after) });
}

export function replaceHoles(ds: CourseDataset, layoutId: string, raw: unknown[], options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const input = raw.map((h) => holeInputSchema.parse(h));
  const holes: HoleDto[] = input
    .map((h) => ({ id: ctx.id(), layoutId, ...h, gender: (h.gender as Gender | null) ?? null }))
    .sort((a, b) => a.holeNumber - b.holeNumber);
  const next = mapLayout(ds, layoutId, (l) => ({ ...l, holes }));
  return log(next, ctx, { entityType: "layout", entityId: layoutId, action: "REPLACE_HOLES", changes: { count: holes.length } });
}

/**
 * GPS-Grünkoordinaten (Front/Mitte/Back) für Löcher eines Platzes setzen. Lochdaten, Ratings, Grünfläche,
 * Fahne und Abschlagpositionen bleiben unverändert; ungültige Koordinaten werden abgelehnt.
 */
export function setGreenCoordinates(ds: CourseDataset, layoutId: string, raw: unknown[], options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const updates: GreenUpdate[] = raw.map((g) => {
    const v = greenInputSchema.parse(g);
    return { holeNumber: v.holeNumber, front: v.front, center: v.center, back: v.back, source: (v.source as GeoSource | null) ?? null };
  });
  const { layout } = findLayout(ds, layoutId);
  const merged = mergeGreenUpdates(layout, updates, ctx.now.toISOString());
  if (merged.changed.length === 0 && merged.removed.length === 0) return ds;
  const next = mapLayout(ds, layoutId, (l) => ({ ...l, holeGeo: merged.holeGeo }));
  return log(next, ctx, { entityType: "layout", entityId: layoutId, action: "SET_GREENS", changes: { changed: merged.changed, removed: merged.removed } });
}

// ---------------------------------------------------------------------------
// Rating-Sets
// ---------------------------------------------------------------------------

function ratingFromInput(input: RatingSetInput, ctx: Ctx, id: string, previous?: RatingSetDto): RatingSetDto {
  // Wer ein Rating als verifiziert markiert, hat es an diesem Tag geprüft.
  const checkedAt = input.verified ? input.checkedAt ?? ctx.today : input.checkedAt;
  let lastVerifiedAt = input.verified ? checkedAt : null;
  if (input.verified && previous?.verified) lastVerifiedAt = previous.lastVerifiedAt ?? lastVerifiedAt;
  return {
    id,
    layoutId: input.layoutId,
    gender: input.gender as Gender,
    teeColor: input.teeColor,
    teeName: input.teeName,
    holes: input.holes as 9 | 18,
    nine: (input.nine as NineSide | null) ?? null,
    par: input.par,
    courseRating: input.courseRating,
    slopeRating: input.slopeRating,
    yardage: input.yardage,
    validFrom: input.validFrom,
    validTo: input.validTo,
    sourceType: input.sourceType as RatingSetDto["sourceType"],
    sourceUrl: input.sourceUrl,
    checkedAt,
    verified: input.verified,
    lastVerifiedAt,
    confidence: input.confidence as RatingSetDto["confidence"],
    active: input.active,
    notes: input.notes,
  };
}

export function createRatingSet(ds: CourseDataset, raw: unknown, options?: OperationContext): { dataset: CourseDataset; rating: RatingSetDto } {
  const ctx = new Ctx(options);
  const input = ratingSetInputSchema.parse(raw);
  const { layout } = findLayout(ds, input.layoutId);
  if (input.holes === 9 && layout.holesCount >= 18 && !input.nine) {
    throw new Error("9-Loch-Rating auf einem 18-Loch-Platz: Hälfte (Front/Back Nine) angeben");
  }
  const rating = ratingFromInput(input, ctx, ctx.id());
  let next = mapLayout(ds, layout.id, (l) => ({ ...l, ratingSets: sortRatings([...l.ratingSets, rating]) }));
  next = log(next, ctx, { entityType: "rating_set", entityId: rating.id, action: "CREATE", changes: input });
  return { dataset: next, rating };
}

export function updateRatingSet(ds: CourseDataset, id: string, raw: unknown, options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const input = ratingSetInputSchema.parse(raw);
  const { layout, rating: before } = findRating(ds, id);
  if (input.layoutId !== layout.id) throw new Error("Ein Rating kann nicht per Formular einem anderen Platz zugeordnet werden");
  if (input.holes === 9 && layout.holesCount >= 18 && !input.nine) {
    throw new Error("9-Loch-Rating auf einem 18-Loch-Platz: Hälfte (Front/Back Nine) angeben");
  }
  const after = ratingFromInput(input, ctx, id, before);
  const next = mapRating(ds, id, () => after);
  return log(next, ctx, { entityType: "rating_set", entityId: id, action: "UPDATE", changes: diff(before, after) });
}

export function setRatingSetActive(ds: CourseDataset, id: string, active: boolean, options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const next = mapRating(ds, id, (s) => ({ ...s, active }));
  return log(next, ctx, { entityType: "rating_set", entityId: id, action: active ? "ACTIVATE" : "DEACTIVATE", changes: null });
}

export function setRatingSetVerified(ds: CourseDataset, id: string, verified: boolean, checkedAt: string | null, options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const { rating } = findRating(ds, id);
  if (verified && (rating.courseRating === null || rating.slopeRating === null || rating.par === null || !rating.sourceType)) {
    throw new Error("„Verifiziert“ ist nur mit Course Rating, Slope, Par und Datenquelle möglich");
  }
  const date = checkedAt ?? ctx.today;
  const next = mapRating(ds, id, (s) => ({ ...s, verified, checkedAt: date, lastVerifiedAt: verified ? date : s.lastVerifiedAt }));
  return log(next, ctx, { entityType: "rating_set", entityId: id, action: verified ? "VERIFY" : "UNVERIFY", changes: { checkedAt: date } });
}

// ---------------------------------------------------------------------------
// CSV-Import (nach Vorschau und Bestätigung) – entspricht applyCsvPlan der Node-Edition
// ---------------------------------------------------------------------------

export interface CsvApplyResult {
  createdCourses: number;
  createdLayouts: number;
  createdRatings: number;
  updatedRatings: number;
  skipped: number;
}

function ratingPayload(row: ParsedCsvRow, layoutId: string, existing?: { checkedAt: string | null; confidence: string | null }) {
  return {
    layoutId,
    gender: row.gender,
    teeColor: row.teeColor,
    teeName: row.teeName,
    holes: row.holes,
    nine: row.nine,
    par: row.par,
    courseRating: row.courseRating,
    slopeRating: row.slopeRating,
    yardage: row.yardage,
    validFrom: row.validFrom,
    validTo: row.validTo,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    checkedAt: row.checkedAt ?? existing?.checkedAt ?? null,
    verified: row.verified,
    confidence: row.confidence ?? existing?.confidence ?? null,
    active: true,
    notes: null,
  };
}

function inferLayoutType(rows: ParsedCsvRow[]): { type: LayoutType; holesCount: number } {
  const explicit = rows.find((r) => r.layoutType)?.layoutType ?? null;
  if (explicit) {
    const count = explicit === "9_HOLE" ? 9 : explicit === "SHORT_COURSE" ? 9 : explicit === "27_HOLE" ? 27 : explicit === "36_HOLE" ? 36 : 18;
    return { type: explicit, holesCount: count };
  }
  const has18 = rows.some((r) => r.holes === 18);
  const hasNine = rows.some((r) => r.nine);
  return has18 || hasNine ? { type: "18_HOLE", holesCount: 18 } : { type: "9_HOLE", holesCount: 9 };
}

/** Wendet einen geprüften CSV-Importplan an. Alles-oder-nichts: bei einem Fehler bleibt der Datensatz unverändert. */
export function applyCsvPlan(ds: CourseDataset, plan: CsvImportPlan, options?: OperationContext): { dataset: CourseDataset; result: CsvApplyResult } {
  const opts: OperationContext = { ...options, source: "CSV_IMPORT" };
  const result: CsvApplyResult = { createdCourses: 0, createdLayouts: 0, createdRatings: 0, updatedRatings: 0, skipped: 0 };
  const valid = plan.rows.filter((r) => r.row && r.action !== "INVALID");
  result.skipped = plan.rows.length - valid.length;
  let next = ds;
  const courseIds = new Map<string, string>();
  const layoutIds = new Map<string, string>();
  for (const p of valid) {
    const row = p.row!;
    let courseId = p.course.id ?? courseIds.get(p.course.key) ?? null;
    if (!courseId) {
      const created = createCourse(
        next,
        {
          name: row.courseName,
          officialName: row.officialName,
          city: row.city,
          region: row.region,
          postalCode: row.postalCode,
          address: row.address,
          website: row.website,
          facilityType: row.facilityType,
          externalClubId: row.externalClubId,
          latitude: row.latitude,
          longitude: row.longitude,
        },
        opts,
      );
      next = created.dataset;
      courseId = created.course.id;
      courseIds.set(p.course.key, courseId);
      result.createdCourses += 1;
    }
    const layoutKey = `${courseId}|${row.layoutName.toLowerCase()}`;
    let layoutId = p.layout.id ?? layoutIds.get(layoutKey) ?? null;
    if (!layoutId) {
      const course = next.courses.find((c) => c.id === courseId);
      const existing = course?.layouts.find((l) => l.name === row.layoutName);
      if (existing) {
        layoutId = existing.id;
      } else {
        const sameLayoutRows = valid
          .filter((x) => x.row && x.course.key === p.course.key && x.row.layoutName.toLowerCase() === row.layoutName.toLowerCase())
          .map((x) => x.row!);
        const { type, holesCount } = inferLayoutType(sameLayoutRows);
        const created = createLayout(next, { courseId, name: row.layoutName, type, holesCount }, opts);
        next = created.dataset;
        layoutId = created.layout.id;
        result.createdLayouts += 1;
      }
      layoutIds.set(layoutKey, layoutId);
    }
    if (p.rating.action === "CREATE") {
      next = createRatingSet(next, ratingPayload(row, layoutId), opts).dataset;
      result.createdRatings += 1;
    } else if (p.rating.action === "UPDATE" && p.rating.id) {
      const { rating: current } = findRating(next, p.rating.id);
      next = updateRatingSet(next, p.rating.id, ratingPayload(row, layoutId, current), opts);
      result.updatedRatings += 1;
    }
  }
  next = recordImportRun(next, "CSV", "APPLIED", result, opts);
  return { dataset: next, result };
}

export interface GreenCsvApplyResult {
  updatedHoles: number;
  layouts: number;
  skipped: number;
}

/** GPS-CSV nach Vorschau und Bestätigung übernehmen (nur Grünkoordinaten – Ratings und Lochdaten bleiben unverändert). */
export function applyGreenCsvPlan(ds: CourseDataset, plan: GreenCsvPlan, options?: OperationContext): { dataset: CourseDataset; result: GreenCsvApplyResult } {
  const opts: OperationContext = { ...options, source: "CSV_IMPORT" };
  const byLayout = new Map<string, GreenUpdate[]>();
  let skipped = 0;
  for (const row of plan.rows) {
    if (row.action === "INVALID" || row.action === "UNCHANGED" || !row.update || !row.layoutId) {
      skipped += 1;
      continue;
    }
    byLayout.set(row.layoutId, [...(byLayout.get(row.layoutId) ?? []), row.update]);
  }
  let next = ds;
  let updatedHoles = 0;
  for (const [layoutId, updates] of byLayout) {
    next = setGreenCoordinates(next, layoutId, updates, opts);
    updatedHoles += updates.length;
  }
  const result: GreenCsvApplyResult = { updatedHoles, layouts: byLayout.size, skipped };
  next = recordImportRun(next, "CSV_GPS", "APPLIED", result, opts);
  return { dataset: next, result };
}

export function recordImportRun(ds: CourseDataset, kind: string, status: string, summary: unknown, options?: OperationContext): CourseDataset {
  const ctx = new Ctx(options);
  const run: ImportRunEntry = { id: ctx.id(), kind, status, summary, startedAt: ctx.now.toISOString(), finishedAt: ctx.now.toISOString() };
  return { ...ds, importRuns: [run, ...ds.importRuns].slice(0, IMPORT_RUN_LIMIT) };
}

// ---------------------------------------------------------------------------
// Mitgelieferte Startdaten (data/seed → golfplaetze-daten.json)
// ---------------------------------------------------------------------------

export interface SeedMergeResult {
  dataset: CourseDataset;
  added: string[];
  existing: string[];
}

function sameFacility(a: CourseDto, b: CourseDto): boolean {
  if (a.id === b.id || a.slug === b.slug) return true;
  if (a.externalClubId && a.externalClubId === b.externalClubId) return true;
  return normalizeCourseName(a.name) === normalizeCourseName(b.name) && (a.city ?? "") === (b.city ?? "");
}

/** Welche Anlagen der Startdaten fehlen im Datensatz? (gleiche ID, Slug, Club-ID oder Name + Ort = vorhanden) */
export function missingSeedCourses(ds: CourseDataset, seed: CourseDataset): CourseDto[] {
  return seed.courses.filter((s) => !ds.courses.some((c) => sameFacility(c, s)));
}

/**
 * Übernimmt fehlende Anlagen aus den Startdaten (vorhandene bleiben unverändert – auch wenn sie
 * im Admin-Bereich bereits bearbeitet wurden). Protokolliert als Quelle „SEED“.
 */
export function mergeSeedCourses(ds: CourseDataset, seed: CourseDataset, options?: OperationContext): SeedMergeResult {
  const ctx = new Ctx({ ...options, source: "SEED" });
  const missing = missingSeedCourses(ds, seed);
  let next: CourseDataset = ds;
  for (const course of missing) {
    const slug = uniqueSlug(next, course.name, course.city);
    next = { ...next, courses: sortCourses([...next.courses, { ...course, slug }]) };
    next = log(next, ctx, { entityType: "course", entityId: course.id, action: "CREATE", changes: { name: course.name, layouts: course.layouts.length } });
  }
  if (missing.length > 0) next = recordImportRun(next, "SEED", "APPLIED", { added: missing.map((c) => c.name) }, { ...options, source: "SEED" });
  return {
    dataset: next,
    added: missing.map((c) => c.name),
    existing: seed.courses.filter((s) => !missing.includes(s)).map((c) => c.name),
  };
}
