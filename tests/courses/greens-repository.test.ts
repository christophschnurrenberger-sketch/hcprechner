import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Eingebettete In-Memory-Datenbank (oder TEST_DATABASE_URL für echtes PostgreSQL); fiktive Testdaten.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  process.env.PGLITE_DIR = "memory://";
  delete process.env.DATABASE_URL;
}

const repo = await import("@/server/courseRepository");
const { closeDb, getDb } = await import("@/db/client");
const { holeGeo } = await import("@/db/schema");
const { planGreenCsvImport } = await import("@/lib/courses/greenCsv");

const C = { latitude: 47.94, longitude: 10.31 };
const pt = (d: number) => ({ latitude: +(C.latitude + d).toFixed(6), longitude: C.longitude });

describe("GPS-Grünkoordinaten im Repository (PGlite)", () => {
  let courseId = "";
  let layoutId = "";

  beforeAll(async () => {
    const c = await repo.createCourse({ name: "GPS-Testclub (fiktiv)", city: "Teststadt", latitude: C.latitude, longitude: C.longitude });
    courseId = c.id;
    const l = await repo.createLayout({ courseId, name: "Meisterschaftsplatz", type: "18_HOLE", holesCount: 18 });
    layoutId = l.id;
    await repo.createRatingSet({ layoutId, gender: "M", teeColor: "Gelb", holes: 18, par: 72, courseRating: 71.8, slopeRating: 135, sourceType: "OFFICIAL_SCORECARD", verified: true, checkedAt: "2026-01-15" });
    await repo.replaceHoles(layoutId, Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 })));
  });

  afterAll(async () => {
    await closeDb();
  });

  it("bestehende Plätze laden ohne GPS-Daten (leere Liste, kein Fehler)", async () => {
    const course = await repo.getCourse(courseId);
    expect(course?.layouts[0].holeGeo).toEqual([]);
    expect(course?.layouts[0].holes).toHaveLength(18);
  });

  it("speichert Front/Mitte/Back, liefert sie über die Course-API-Struktur und protokolliert die Änderung", async () => {
    const res = await repo.setGreenCoordinates(layoutId, [{ holeNumber: 7, front: pt(0.0069), center: pt(0.007), back: pt(0.0071), source: "DEVICE_GPS" }], "Admin");
    expect(res.changed).toEqual([7]);
    const course = await repo.getCourse(courseId);
    const seven = course!.layouts[0].holeGeo.find((g) => g.holeNumber === 7)!;
    expect(seven.green).toMatchObject({ front: pt(0.0069), center: pt(0.007), back: pt(0.0071), polygon: null, pin: null });
    expect(seven.source).toBe("DEVICE_GPS");
    const all = await repo.loadAllCourses();
    expect(all.find((c) => c.id === courseId)?.layouts[0].holeGeo).toHaveLength(1);
    const changes = await repo.recentChanges(5);
    expect(changes[0]).toMatchObject({ entityType: "layout", entityId: layoutId, action: "SET_GREENS", actor: "Admin" });
  });

  it("Lochdaten neu speichern lässt die Grünkoordinaten unverändert (Grün ist unabhängig von Abschlag/Lochdaten)", async () => {
    await repo.replaceHoles(layoutId, Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: i % 3 === 2 ? 3 : 4, strokeIndex: 18 - i })));
    const course = await repo.getCourse(courseId);
    expect(course!.layouts[0].holeGeo.find((g) => g.holeNumber === 7)?.green.center).toEqual(pt(0.007));
    expect(course!.layouts[0].ratingSets[0].courseRating).toBe(71.8);
  });

  it("Datenbank lehnt ungültige Koordinaten ab (Prüfregel) – und die Validierung schon vorher", async () => {
    await expect(repo.setGreenCoordinates(layoutId, [{ holeNumber: 1, center: { latitude: 999, longitude: 10 } }])).rejects.toThrow();
    const db = await getDb();
    await expect(db.insert(holeGeo).values({ layoutId, holeNumber: 2, greenCenterLat: 91, greenCenterLng: 10 })).rejects.toThrow();
    await expect(db.insert(holeGeo).values({ layoutId, holeNumber: 2, greenCenterLat: 47.9 })).rejects.toThrow();
  });

  it("CSV-Import übernimmt nur Grünkoordinaten (Ratings bleiben unverändert)", async () => {
    const before = await repo.getCourse(courseId);
    const csv = `course_id,hole_number,green_center_lat,green_center_lng\n${courseId},1,${pt(0.001).latitude},${C.longitude}\n${courseId},2,${pt(0.002).latitude},${C.longitude}`;
    const plan = planGreenCsvImport(csv, [before!]);
    expect(plan.summary).toMatchObject({ create: 2, invalid: 0 });
    const result = await repo.applyGreenCsvPlan(plan, "Admin");
    expect(result).toEqual({ updatedHoles: 2, layouts: 1, skipped: 0 });
    const after = await repo.getCourse(courseId);
    expect(after!.layouts[0].holeGeo.map((g) => g.holeNumber)).toEqual([1, 2, 7]);
    expect(after!.layouts[0].ratingSets).toEqual(before!.layouts[0].ratingSets);
    expect((await repo.lastImportRuns(1))[0]).toMatchObject({ kind: "CSV_GPS", status: "APPLIED" });
  });

  it("Löschen eines Platzes entfernt seine Geodaten mit (Fremdschlüssel)", async () => {
    const l2 = await repo.createLayout({ courseId, name: "Kurzplatz", type: "9_HOLE", holesCount: 9 });
    await repo.setGreenCoordinates(l2.id, [{ holeNumber: 1, center: pt(0.01) }]);
    const db = await getDb();
    const { layouts } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(layouts).where(eq(layouts.id, l2.id));
    expect((await db.select().from(holeGeo).where(eq(holeGeo.layoutId, l2.id))).length).toBe(0);
  });
});
