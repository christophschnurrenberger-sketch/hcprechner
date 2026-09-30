/**
 * Zugriff auf die Golfplatzdatenbank (server-seitig).
 * Jede schreibende Operation wird im change_log protokolliert.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { changeLog, courses, holeGeo, holes, importRuns, layouts, ratingSets } from "@/db/schema";
import type { CsvImportPlan, ParsedCsvRow } from "@/lib/courses/csv";
import { mergeGreenUpdates, type GreenUpdate } from "@/lib/courses/geo";
import type { GreenCsvPlan } from "@/lib/courses/greenCsv";
import { normalizeCourseName, slugify } from "@/lib/courses/normalize";
import type {
  CourseDto,
  FacilityType,
  GeoPoint,
  GeoSource,
  GreenPolygon,
  HoleDto,
  HoleGeoDto,
  LayoutDto,
  LayoutType,
  RatingSetDto,
  TeePosition,
} from "@/lib/courses/types";
import {
  courseInputSchema,
  greenInputSchema,
  greenPolygonSchema,
  holeInputSchema,
  layoutInputSchema,
  ratingSetInputSchema,
  teePositionSchema,
  type CourseInput,
  type HoleInput,
  type LayoutInput,
  type RatingSetInput,
} from "@/lib/courses/validation";
import type { Gender, NineSide } from "@/lib/whs/types";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export type ChangeSource = "ADMIN" | "CSV_IMPORT" | "IMPORTER" | "SEED";

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

type CourseRow = typeof courses.$inferSelect;
type LayoutRow = typeof layouts.$inferSelect;
type RatingRow = typeof ratingSets.$inferSelect;
type HoleRow = typeof holes.$inferSelect;
type HoleGeoRow = typeof holeGeo.$inferSelect;

function toRatingDto(r: RatingRow): RatingSetDto {
  return {
    id: r.id,
    layoutId: r.layoutId,
    gender: r.gender as Gender,
    teeColor: r.teeColor,
    teeName: r.teeName,
    holes: r.holes as 9 | 18,
    nine: (r.nine as NineSide | null) ?? null,
    par: r.par,
    courseRating: r.courseRating === null ? null : Number(r.courseRating),
    slopeRating: r.slopeRating,
    yardage: r.yardage,
    validFrom: r.validFrom,
    validTo: r.validTo,
    sourceType: r.sourceType as RatingSetDto["sourceType"],
    sourceUrl: r.sourceUrl,
    checkedAt: r.checkedAt,
    verified: r.verified,
    lastVerifiedAt: r.lastVerifiedAt,
    confidence: r.confidence as RatingSetDto["confidence"],
    active: r.active,
    notes: r.notes,
  };
}

function toHoleDto(h: HoleRow): HoleDto {
  return {
    id: h.id,
    layoutId: h.layoutId,
    holeNumber: h.holeNumber,
    par: h.par,
    strokeIndex: h.strokeIndex,
    lengthMen: h.lengthMen,
    lengthWomen: h.lengthWomen,
    teeColor: h.teeColor,
    gender: (h.gender as Gender | null) ?? null,
  };
}

const point = (lat: number | null, lng: number | null): GeoPoint | null => (lat === null || lng === null ? null : { latitude: lat, longitude: lng });

function toHoleGeoDto(g: HoleGeoRow): HoleGeoDto {
  const polygon = greenPolygonSchema.safeParse(g.greenPolygon);
  const tees = Array.isArray(g.teePositions) ? g.teePositions.flatMap((t) => (teePositionSchema.safeParse(t).success ? [t as TeePosition] : [])) : [];
  const pin = point(g.pinLat, g.pinLng);
  return {
    layoutId: g.layoutId,
    holeNumber: g.holeNumber,
    green: {
      front: point(g.greenFrontLat, g.greenFrontLng),
      center: point(g.greenCenterLat, g.greenCenterLng),
      back: point(g.greenBackLat, g.greenBackLng),
      polygon: polygon.success ? (polygon.data as GreenPolygon) : null,
      pin: pin ? { ...pin, setAt: (g.pinSetAt ?? g.updatedAt).toISOString() } : null,
    },
    tees,
    source: (g.source as GeoSource | null) ?? null,
    updatedAt: g.updatedAt.toISOString(),
  };
}

function assemble(
  courseRows: CourseRow[],
  layoutRows: LayoutRow[],
  ratingRows: RatingRow[],
  holeRows: HoleRow[],
  geoRows: HoleGeoRow[] = [],
): CourseDto[] {
  const ratingsByLayout = new Map<string, RatingSetDto[]>();
  for (const r of ratingRows) {
    const list = ratingsByLayout.get(r.layoutId) ?? [];
    list.push(toRatingDto(r));
    ratingsByLayout.set(r.layoutId, list);
  }
  const holesByLayout = new Map<string, HoleDto[]>();
  for (const h of holeRows) {
    const list = holesByLayout.get(h.layoutId) ?? [];
    list.push(toHoleDto(h));
    holesByLayout.set(h.layoutId, list);
  }
  const geoByLayout = new Map<string, HoleGeoDto[]>();
  for (const g of geoRows) {
    const list = geoByLayout.get(g.layoutId) ?? [];
    list.push(toHoleGeoDto(g));
    geoByLayout.set(g.layoutId, list);
  }
  const layoutsByCourse = new Map<string, LayoutDto[]>();
  for (const l of layoutRows) {
    const list = layoutsByCourse.get(l.courseId) ?? [];
    list.push({
      id: l.id,
      courseId: l.courseId,
      name: l.name,
      type: l.type as LayoutType,
      combinationName: l.combinationName,
      holesCount: l.holesCount,
      active: l.active,
      notes: l.notes,
      ratingSets: (ratingsByLayout.get(l.id) ?? []).sort(
        (a, b) =>
          a.holes - b.holes ||
          a.gender.localeCompare(b.gender) ||
          a.teeColor.localeCompare(b.teeColor, "de") ||
          (b.validFrom ?? "").localeCompare(a.validFrom ?? ""),
      ),
      holes: (holesByLayout.get(l.id) ?? []).sort((a, b) => a.holeNumber - b.holeNumber),
      holeGeo: (geoByLayout.get(l.id) ?? []).sort((a, b) => a.holeNumber - b.holeNumber),
    });
    layoutsByCourse.set(l.courseId, list);
  }
  return courseRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    officialName: c.officialName,
    clubName: c.clubName,
    facilityType: c.facilityType as FacilityType,
    city: c.city,
    postalCode: c.postalCode,
    address: c.address,
    federalState: c.federalState,
    country: c.country,
    region: c.region,
    latitude: c.latitude,
    longitude: c.longitude,
    website: c.website,
    officialSourceUrl: c.officialSourceUrl,
    bayernGolfverbandUrl: c.bayernGolfverbandUrl,
    externalClubId: c.externalClubId,
    active: c.active,
    verified: c.verified,
    lastVerifiedAt: c.lastVerifiedAt,
    notes: c.notes,
    layouts: (layoutsByCourse.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "de")),
  }));
}

export async function loadAllCourses(options: { includeInactive?: boolean; db?: Executor } = {}): Promise<CourseDto[]> {
  const db = options.db ?? (await getDb());
  const [c, l, r, h, g] = await Promise.all([
    options.includeInactive
      ? db.select().from(courses).orderBy(asc(courses.name))
      : db.select().from(courses).where(eq(courses.active, true)).orderBy(asc(courses.name)),
    db.select().from(layouts),
    db.select().from(ratingSets),
    db.select().from(holes),
    db.select().from(holeGeo),
  ]);
  return assemble(c, l, r, h, g);
}

export async function getCourse(idOrSlug: string, db?: Executor): Promise<CourseDto | null> {
  const executor = db ?? (await getDb());
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const rows = await executor
    .select()
    .from(courses)
    .where(isUuid ? eq(courses.id, idOrSlug) : eq(courses.slug, idOrSlug));
  if (rows.length === 0) return null;
  const layoutRows = await executor.select().from(layouts).where(eq(layouts.courseId, rows[0].id));
  const layoutIds = layoutRows.map((l) => l.id);
  const [r, h, g] = layoutIds.length
    ? await Promise.all([
        executor.select().from(ratingSets).where(inArray(ratingSets.layoutId, layoutIds)),
        executor.select().from(holes).where(inArray(holes.layoutId, layoutIds)),
        executor.select().from(holeGeo).where(inArray(holeGeo.layoutId, layoutIds)),
      ])
    : [[], [], []];
  return assemble(rows, layoutRows, r, h, g)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

async function logChange(
  db: Executor,
  entry: { entityType: string; entityId: string | null; action: string; source: ChangeSource; changes?: unknown; actor?: string | null },
) {
  await db.insert(changeLog).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    source: entry.source,
    changes: entry.changes ?? null,
    actor: entry.actor ?? null,
  });
}

async function uniqueSlug(db: Executor, name: string, city: string | null, excludeId?: string): Promise<string> {
  const base = slugify(city && !normalizeCourseName(name).includes(normalizeCourseName(city)) ? `${name} ${city}` : name) || "golfanlage";
  let candidate = base;
  for (let i = 2; i < 500; i++) {
    const existing = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, candidate));
    if (existing.length === 0 || existing[0].id === excludeId) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error("Kein eindeutiger Slug möglich");
}

const today = () => new Date().toISOString().slice(0, 10);

export async function createCourse(raw: unknown, source: ChangeSource = "ADMIN", actor?: string, db?: Executor) {
  const input: CourseInput = courseInputSchema.parse(raw);
  const executor = db ?? (await getDb());
  const slug = await uniqueSlug(executor, input.name, input.city);
  const [row] = await executor
    .insert(courses)
    .values({ ...input, slug, normalizedName: normalizeCourseName(input.name) })
    .returning();
  await logChange(executor, { entityType: "course", entityId: row.id, action: "CREATE", source, changes: input, actor });
  return row;
}

export async function updateCourse(id: string, raw: unknown, source: ChangeSource = "ADMIN", actor?: string) {
  const input = courseInputSchema.parse(raw);
  const db = await getDb();
  const [before] = await db.select().from(courses).where(eq(courses.id, id));
  if (!before) throw new Error("Anlage nicht gefunden");
  if (input.facilityType === "DRIVING_RANGE") {
    const existingLayouts = await db.select({ id: layouts.id }).from(layouts).where(eq(layouts.courseId, id));
    if (existingLayouts.length > 0) throw new Error("Eine Anlage mit Plätzen kann nicht als Driving Range geführt werden");
  }
  const slug = before.name !== input.name || before.city !== input.city ? await uniqueSlug(db, input.name, input.city, id) : before.slug;
  const [row] = await db
    .update(courses)
    .set({ ...input, slug, normalizedName: normalizeCourseName(input.name), updatedAt: new Date() })
    .where(eq(courses.id, id))
    .returning();
  await logChange(db, { entityType: "course", entityId: id, action: "UPDATE", source, changes: diff(before, row), actor });
  return row;
}

export async function createLayout(raw: unknown, source: ChangeSource = "ADMIN", actor?: string, db?: Executor) {
  const input: LayoutInput = layoutInputSchema.parse(raw);
  const executor = db ?? (await getDb());
  const [course] = await executor.select().from(courses).where(eq(courses.id, input.courseId));
  if (!course) throw new Error("Anlage nicht gefunden");
  if (course.facilityType === "DRIVING_RANGE") {
    throw new Error("Eine Driving Range ist kein handicap-relevanter Golfplatz – keine Plätze/Layouts möglich");
  }
  const [row] = await executor.insert(layouts).values(input).returning();
  await logChange(executor, { entityType: "layout", entityId: row.id, action: "CREATE", source, changes: input, actor });
  return row;
}

export async function updateLayout(id: string, raw: unknown, actor?: string) {
  const input = layoutInputSchema.parse(raw);
  const db = await getDb();
  const [before] = await db.select().from(layouts).where(eq(layouts.id, id));
  if (!before) throw new Error("Platz nicht gefunden");
  const [row] = await db.update(layouts).set({ ...input, updatedAt: new Date() }).where(eq(layouts.id, id)).returning();
  await logChange(db, { entityType: "layout", entityId: id, action: "UPDATE", source: "ADMIN", changes: diff(before, row), actor });
  return row;
}

function ratingValues(input: RatingSetInput) {
  // Wer ein Rating als verifiziert markiert, hat es an diesem Tag geprüft.
  const checkedAt = input.verified ? input.checkedAt ?? today() : input.checkedAt;
  return {
    ...input,
    holes: input.holes,
    checkedAt,
    lastVerifiedAt: input.verified ? checkedAt : null,
  };
}

export async function createRatingSet(raw: unknown, source: ChangeSource = "ADMIN", actor?: string, db?: Executor) {
  const input = ratingSetInputSchema.parse(raw);
  const executor = db ?? (await getDb());
  const [layout] = await executor.select().from(layouts).where(eq(layouts.id, input.layoutId));
  if (!layout) throw new Error("Platz nicht gefunden");
  if (input.holes === 9 && layout.holesCount >= 18 && !input.nine) {
    throw new Error("9-Loch-Rating auf einem 18-Loch-Platz: Hälfte (Front/Back Nine) angeben");
  }
  const [row] = await executor.insert(ratingSets).values(ratingValues(input)).returning();
  await logChange(executor, { entityType: "rating_set", entityId: row.id, action: "CREATE", source, changes: input, actor });
  return row;
}

export async function updateRatingSet(id: string, raw: unknown, source: ChangeSource = "ADMIN", actor?: string, db?: Executor) {
  const input = ratingSetInputSchema.parse(raw);
  const executor = db ?? (await getDb());
  const [before] = await executor.select().from(ratingSets).where(eq(ratingSets.id, id));
  if (!before) throw new Error("Rating nicht gefunden");
  const values = ratingValues(input);
  if (input.verified && before.verified) values.lastVerifiedAt = before.lastVerifiedAt ?? values.lastVerifiedAt;
  const [row] = await executor
    .update(ratingSets)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(ratingSets.id, id))
    .returning();
  await logChange(executor, { entityType: "rating_set", entityId: id, action: "UPDATE", source, changes: diff(before, row), actor });
  return row;
}

export async function setRatingSetActive(id: string, active: boolean, actor?: string) {
  const db = await getDb();
  await db.update(ratingSets).set({ active, updatedAt: new Date() }).where(eq(ratingSets.id, id));
  await logChange(db, { entityType: "rating_set", entityId: id, action: active ? "ACTIVATE" : "DEACTIVATE", source: "ADMIN", actor });
}

export async function setRatingSetVerified(id: string, verified: boolean, checkedAt: string | null, actor?: string) {
  const db = await getDb();
  const [row] = await db.select().from(ratingSets).where(eq(ratingSets.id, id));
  if (!row) throw new Error("Rating nicht gefunden");
  if (verified && (row.courseRating === null || row.slopeRating === null || row.par === null || !row.sourceType)) {
    throw new Error("„Verifiziert“ ist nur mit Course Rating, Slope, Par und Datenquelle möglich");
  }
  const date = checkedAt ?? today();
  await db
    .update(ratingSets)
    .set({ verified, checkedAt: date, lastVerifiedAt: verified ? date : row.lastVerifiedAt, updatedAt: new Date() })
    .where(eq(ratingSets.id, id));
  await logChange(db, { entityType: "rating_set", entityId: id, action: verified ? "VERIFY" : "UNVERIFY", source: "ADMIN", changes: { checkedAt: date }, actor });
}

export async function replaceHoles(layoutId: string, raw: unknown[], actor?: string) {
  const input: HoleInput[] = raw.map((h) => holeInputSchema.parse(h));
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(holes).where(eq(holes.layoutId, layoutId));
    if (input.length > 0) await tx.insert(holes).values(input.map((h) => ({ ...h, layoutId })));
    await logChange(tx, { entityType: "layout", entityId: layoutId, action: "REPLACE_HOLES", source: "ADMIN", changes: { count: input.length }, actor });
  });
}

/**
 * GPS-Grünkoordinaten (Front/Mitte/Back) setzen – gleiche Regeln wie der Webspace-Datensatz (mergeGreenUpdates).
 * Lochdaten, Ratings, Grünfläche, Fahne und Abschlagpositionen bleiben unverändert.
 */
export async function setGreenCoordinates(
  layoutId: string,
  raw: unknown[],
  actor?: string,
  source: ChangeSource = "ADMIN",
  db?: Executor,
): Promise<{ changed: number[]; removed: number[] }> {
  const updates: GreenUpdate[] = raw.map((g) => {
    const v = greenInputSchema.parse(g);
    return { holeNumber: v.holeNumber, front: v.front, center: v.center, back: v.back, source: (v.source as GeoSource | null) ?? null };
  });
  const run = async (tx: Executor) => {
    const [layout] = await tx.select().from(layouts).where(eq(layouts.id, layoutId));
    if (!layout) throw new Error("Platz nicht gefunden");
    const [holeRows, geoRows] = await Promise.all([
      tx.select().from(holes).where(eq(holes.layoutId, layoutId)),
      tx.select().from(holeGeo).where(eq(holeGeo.layoutId, layoutId)),
    ]);
    const now = new Date();
    const merged = mergeGreenUpdates(
      { id: layoutId, holesCount: layout.holesCount, holes: holeRows.map(toHoleDto), holeGeo: geoRows.map(toHoleGeoDto) },
      updates,
      now.toISOString(),
    );
    for (const n of merged.removed) await tx.delete(holeGeo).where(and(eq(holeGeo.layoutId, layoutId), eq(holeGeo.holeNumber, n)));
    for (const n of merged.changed) {
      const g = merged.holeGeo.find((x) => x.holeNumber === n)!;
      const values = {
        greenFrontLat: g.green.front?.latitude ?? null,
        greenFrontLng: g.green.front?.longitude ?? null,
        greenCenterLat: g.green.center?.latitude ?? null,
        greenCenterLng: g.green.center?.longitude ?? null,
        greenBackLat: g.green.back?.latitude ?? null,
        greenBackLng: g.green.back?.longitude ?? null,
        source: g.source,
        updatedAt: now,
      };
      await tx
        .insert(holeGeo)
        .values({ layoutId, holeNumber: n, ...values })
        .onConflictDoUpdate({ target: [holeGeo.layoutId, holeGeo.holeNumber], set: values });
    }
    if (merged.changed.length || merged.removed.length) {
      await logChange(tx, { entityType: "layout", entityId: layoutId, action: "SET_GREENS", source, changes: { changed: merged.changed, removed: merged.removed }, actor });
    }
    return { changed: merged.changed, removed: merged.removed };
  };
  if (db) return run(db);
  return (await getDb()).transaction((tx) => run(tx));
}

export interface GreenCsvApplyResult {
  updatedHoles: number;
  layouts: number;
  skipped: number;
}

/** GPS-CSV nach Bestätigung übernehmen (alles oder nichts). */
export async function applyGreenCsvPlan(plan: GreenCsvPlan, actor?: string): Promise<GreenCsvApplyResult> {
  const byLayout = new Map<string, GreenUpdate[]>();
  let skipped = 0;
  for (const row of plan.rows) {
    if (row.action === "INVALID" || row.action === "UNCHANGED" || !row.update || !row.layoutId) {
      skipped += 1;
      continue;
    }
    byLayout.set(row.layoutId, [...(byLayout.get(row.layoutId) ?? []), row.update]);
  }
  const db = await getDb();
  let updatedHoles = 0;
  await db.transaction(async (tx) => {
    for (const [layoutId, updates] of byLayout) {
      await setGreenCoordinates(layoutId, updates, actor, "CSV_IMPORT", tx);
      updatedHoles += updates.length;
    }
    await tx.insert(importRuns).values({ kind: "CSV_GPS", status: "APPLIED", summary: { updatedHoles, layouts: byLayout.size, skipped }, finishedAt: new Date() });
  });
  return { updatedHoles, layouts: byLayout.size, skipped };
}

/** Führt eine doppelt angelegte Anlage in eine andere über (Plätze werden verschoben). */
export async function mergeCourses(targetId: string, sourceId: string, actor?: string) {
  if (targetId === sourceId) throw new Error("Quelle und Ziel sind identisch");
  const db = await getDb();
  await db.transaction(async (tx) => {
    const moved = await tx.update(layouts).set({ courseId: targetId, updatedAt: new Date() }).where(eq(layouts.courseId, sourceId)).returning({ id: layouts.id });
    await tx.update(courses).set({ active: false, notes: `Zusammengeführt mit ${targetId}`, updatedAt: new Date() }).where(eq(courses.id, sourceId));
    await logChange(tx, { entityType: "course", entityId: sourceId, action: "MERGE", source: "ADMIN", changes: { targetId, movedLayouts: moved.length }, actor });
  });
}

export async function recentChanges(limit = 50) {
  const db = await getDb();
  const rows = await db.select().from(changeLog);
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { from: a ?? null, to: b ?? null };
  }
  return changes;
}

// ---------------------------------------------------------------------------
// CSV-Import (nach Vorschau und Bestätigung)
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

export async function applyCsvPlan(plan: CsvImportPlan, actor?: string): Promise<CsvApplyResult> {
  const db = await getDb();
  const result: CsvApplyResult = { createdCourses: 0, createdLayouts: 0, createdRatings: 0, updatedRatings: 0, skipped: 0 };
  const valid = plan.rows.filter((r) => r.row && r.action !== "INVALID");
  result.skipped = plan.rows.length - valid.length;
  await db.transaction(async (tx) => {
    const courseIds = new Map<string, string>();
    const layoutIds = new Map<string, string>();
    for (const p of valid) {
      const row = p.row!;
      let courseId = p.course.id ?? courseIds.get(p.course.key) ?? null;
      if (!courseId) {
        const created = await createCourse(
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
          "CSV_IMPORT",
          actor,
          tx,
        );
        courseId = created.id;
        courseIds.set(p.course.key, courseId);
        result.createdCourses += 1;
      }
      const layoutKey = `${courseId}|${row.layoutName.toLowerCase()}`;
      let layoutId = p.layout.id ?? layoutIds.get(layoutKey) ?? null;
      if (!layoutId) {
        const existing = await tx
          .select()
          .from(layouts)
          .where(and(eq(layouts.courseId, courseId), eq(layouts.name, row.layoutName)));
        if (existing[0]) {
          layoutId = existing[0].id;
        } else {
          const sameLayoutRows = valid
            .filter((x) => x.row && x.course.key === p.course.key && x.row.layoutName.toLowerCase() === row.layoutName.toLowerCase())
            .map((x) => x.row!);
          const { type, holesCount } = inferLayoutType(sameLayoutRows);
          const created = await createLayout({ courseId, name: row.layoutName, type, holesCount }, "CSV_IMPORT", actor, tx);
          layoutId = created.id;
          result.createdLayouts += 1;
        }
        layoutIds.set(layoutKey, layoutId);
      }
      if (p.rating.action === "CREATE") {
        await createRatingSet(ratingPayload(row, layoutId), "CSV_IMPORT", actor, tx);
        result.createdRatings += 1;
      } else if (p.rating.action === "UPDATE" && p.rating.id) {
        const [current] = await tx.select().from(ratingSets).where(eq(ratingSets.id, p.rating.id));
        await updateRatingSet(p.rating.id, ratingPayload(row, layoutId, current), "CSV_IMPORT", actor, tx);
        result.updatedRatings += 1;
      }
    }
    await tx.insert(importRuns).values({ kind: "CSV", status: "APPLIED", summary: result, finishedAt: new Date() });
  });
  return result;
}

export async function recordImportRun(kind: string, status: string, summary: unknown) {
  const db = await getDb();
  await db.insert(importRuns).values({ kind, status, summary: summary as object, finishedAt: new Date() });
}

export async function lastImportRuns(limit = 10) {
  const db = await getDb();
  const rows = await db.select().from(importRuns);
  return rows.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit);
}
